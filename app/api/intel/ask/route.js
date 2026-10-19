import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { refundCredits, spendCredits } from "../../../../lib/billing/account";
import { PRICES } from "../../../../lib/plans";
import { brandContext } from "../../../../lib/intel/brand";
import { answerQuestion } from "../../../../lib/intel/agent";
import { addMessage, createThread, deleteMessage, deleteThread, getThread, listMessages, touchThread } from "../../../../lib/intel/threads";
import { dataConnected } from "../../../../lib/intel/source";

export const maxDuration = 300;

// Streams one answer, one JSON object per line:
//   { t: "start", threadId, credits, charged }
//   { t: "step", id, label, status }        what Huesy is doing
//   { t: "text", delta } / { t: "retract" } the answer as it is written
//   { t: "evidence", posts }                standout posts behind it
//   { t: "proposal", kind, ... credits }    a deeper report it recommends
//   { t: "actions", findingIds }            make content from this
//   { t: "refund", credits, reason }       nothing found, so it's free
//   { t: "done", messageId, credits }
//   { t: "error", code, message, refunded, credits }
// The question is paid for up front (100 credits) and refunded when the
// answer fails or is stopped before it arrives.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    const { body: b, status } = errorJson(fail("bad_request", 400));
    return NextResponse.json(b, { status });
  }
  const question = String(body?.question || "").trim().slice(0, 1500);

  let user;
  let thread;
  let isNew = false;
  let history;
  let balance;
  let ctx;
  try {
    if (!question) throw fail("bad_request", 400);
    ({ user } = await requireMember("any"));
    // Read before anything is charged, so a malformed brand costs nothing.
    ctx = brandContext(body.brand || {}, body.targets || {});
    if (!dataConnected()) throw fail("data_unavailable", 503);
    thread = body.threadId ? await getThread(user, body.threadId) : null;
    if (body.threadId && !thread) throw fail("not_found", 404);
    if (!thread) {
      thread = await createThread(user, question);
      isNew = true;
    }
    history = await listMessages(user, thread.id, 40);
    // The same question still being answered (a reload or a second tab keeps
    // the first one running): never start, or charge for, it twice.
    const last = history[history.length - 1];
    if (last?.role === "user" && String(last.content || "").trim() === question && Date.now() - new Date(last.created_at || 0).getTime() < 4 * 60 * 1000) throw fail("busy", 409);
    balance = await spendCredits(user, "ask", { ref: thread.id });
  } catch (err) {
    if (isNew && thread) await deleteThread(user, thread.id).catch(() => {});
    const { body: b, status } = errorJson(err);
    return NextResponse.json(b, { status });
  }
  // The page going away shows up as the stream being cancelled, which can
  // come sooner than the request's own signal. Either one stops the answer.
  const gone = new AbortController();
  req.signal?.addEventListener?.("abort", () => gone.abort(), { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    cancel() {
      gone.abort();
    },
    async start(controller) {
      // What has reached the screen so far: once part of an answer has been
      // shown, stopping keeps it, and keeps it paid for.
      let shown = "";
      const send = (event) => {
        if (event.t === "text") shown += event.delta;
        if (event.t === "retract") shown = "";
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          /* the reader went away */
        }
      };
      let answered = false;
      let asked = null;
      try {
        if (gone.signal.aborted) throw Object.assign(new Error("aborted"), { aborted: true });
        asked = await addMessage(user, thread.id, { role: "user", content: question });
        send({ t: "start", threadId: thread.id, title: thread.title, credits: balance, charged: PRICES.ask });
        const { answer, collected, noData } = await answerQuestion({ question, history, ctx, user, threadId: thread.id, signal: gone.signal, send });
        if (gone.signal.aborted) throw Object.assign(new Error("aborted"), { aborted: true });
        if (!answer) throw fail("failed", 502);
        answered = true;
        let charged = PRICES.ask;
        if (noData) {
          const back = await refundCredits(user, PRICES.ask, "ask_no_data", thread.id);
          if (back != null) {
            balance = back;
            charged = 0;
            send({ t: "refund", credits: balance, reason: "I couldn't find data for that, so this one's free." });
          }
        }
        const seen = new Set();
        const evidence = collected.evidence.filter((p) => p?.url && !seen.has(p.url) && seen.add(p.url)).slice(0, 6);
        const findingIds = [...collected.findings, ...collected.recalled].map((f) => f.id).filter(Boolean).slice(0, 12);
        const saved = await addMessage(user, thread.id, {
          role: "assistant",
          content: answer,
          credits: charged,
          data: { steps: collected.steps, evidence, findingIds, proposal: collected.proposal, sample: collected.sample },
        });
        await touchThread(user, thread.id);
        if (evidence.length) send({ t: "evidence", posts: evidence });
        if (collected.proposal) send({ t: "proposal", ...collected.proposal });
        if (findingIds.length) send({ t: "actions", findingIds });
        send({ t: "done", messageId: saved.id, credits: balance, sample: collected.sample });
      } catch (err) {
        if (!answered && err?.aborted && shown.trim().length >= 80) {
          await addMessage(user, thread.id, { role: "assistant", content: `${shown.trim()}\n\n_Stopped before the end._`, credits: PRICES.ask, data: { stopped: true } }).catch(() => {});
          await touchThread(user, thread.id).catch(() => {});
        } else if (!answered) {
          const refunded = await refundCredits(user, PRICES.ask, "ask", thread.id);
          if (isNew) await deleteThread(user, thread.id).catch(() => {});
          else if (asked?.id != null) await deleteMessage(user, thread.id, asked.id).catch(() => {});
          if (!err?.aborted) {
            const { body: b } = errorJson(err);
            send({ t: "error", ...b.error, refunded: refunded != null, credits: refunded ?? balance });
          }
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}
