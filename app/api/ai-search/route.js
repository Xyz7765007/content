import { NextResponse } from "next/server";
import { requireAccess } from "../../../lib/ai/access";
import { errorJson, fail } from "../../../lib/ai/errors";
import { runWatch } from "../../../lib/intel/watch";
import { refundCredits, requirePlan, spendCredits } from "../../../lib/billing/account";
import { PRICES } from "../../../lib/plans";

export const maxDuration = 300;

// Streams a watchlist check as it happens, one JSON object per line. Every
// signal is also saved on the server as it is found (lib/intel/watch.js).
//   { t: "status", text }       what Huesy is doing
//   { t: "query", q }           a web search it just ran
//   { t: "reading", hosts }     sites in the results it is reading
//   { t: "signal", signal }     a finished signal, as soon as it is written
//   { t: "ranked", ranks }      [{ id, fit, angle }] for the brand
//   { t: "done", count }
//   { t: "error", code, message }
// Access problems answer before the stream starts, as plain JSON with a status.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    const { body: b, status } = errorJson(fail("bad_request", 400));
    return NextResponse.json(b, { status });
  }

  let user;
  let balance = null;
  let payer = null;
  try {
    ({ user } = await requireAccess());
    const member = user || { id: "local", email: "local@huesy.dev" };
    await requirePlan(member, "any");
    // A radar check costs credits, refunded when it fails or finds nothing.
    balance = await spendCredits(member, "radar");
    payer = member;
  } catch (err) {
    const { body: b, status } = errorJson(err);
    return NextResponse.json(b, { status });
  }

  const gone = new AbortController();
  req.signal?.addEventListener?.("abort", () => gone.abort(), { once: true });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    cancel() {
      gone.abort();
    },
    async start(controller) {
      const send = (event) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          /* the reader went away; the run stops at the next abort check */
        }
      };
      // A check is free when it brings nothing back: it found nothing, it
      // failed, or it was stopped before the first signal arrived.
      let found = 0;
      let signals = 0;
      let finished = false;
      try {
        const counted = (event) => {
          if (event.t === "signal") signals += 1;
          if (event.t === "done") {
            found = event.count || 0;
            finished = true;
          }
          send(event.t === "done" ? { ...event, credits: balance, charged: PRICES.radar } : event);
        };
        await runWatch({ config: body?.config, brand: body?.brand, searchId: typeof body?.searchId === "string" ? body.searchId.slice(0, 80) : null, name: typeof body?.name === "string" ? body.name.slice(0, 120) : null, user, send: counted, abort: gone.signal });
        if ((finished ? !found : !signals) && payer) {
          const back = await refundCredits(payer, PRICES.radar, finished ? "radar_empty" : "radar_stopped");
          send({ t: "refund", credits: back ?? balance, reason: finished ? "empty" : "stopped" });
        }
      } catch (err) {
        if (gone.signal.aborted) {
          if (!signals && payer) await refundCredits(payer, PRICES.radar, "radar_stopped");
          return;
        }
        const { body: b } = errorJson(err);
        const back = payer ? await refundCredits(payer, PRICES.radar, "radar_failed") : null;
        send({ t: "error", ...b.error, refunded: back != null, credits: back ?? balance });
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
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
