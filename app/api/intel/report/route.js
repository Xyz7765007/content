import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { refundCredits, restoreWelcomeReport, spendCredits, useWelcomeReport } from "../../../../lib/billing/account";
import { PRICES } from "../../../../lib/plans";
import { brandContext } from "../../../../lib/intel/brand";
import { dataConnected } from "../../../../lib/intel/source";
import { REPORT_KINDS, createReport, getReport, listReports, reportTitle, runReport, updateReport } from "../../../../lib/intel/reports";
import { PLATFORM_IDS } from "../../../../lib/intel/brand";

export const maxDuration = 300;

// Runs a deep report and streams its progress. The report keeps running and
// saves itself even if the page is closed; Insights shows it when it's ready.
// The first report on every account is free.
export async function POST(req) {
  let user;
  let report;
  let balance;
  let free = false;
  let price = 0;
  let kind;
  let params;
  let ctx;
  try {
    const body = await req.json().catch(() => null);
    kind = body?.kind;
    if (!REPORT_KINDS[kind]) throw fail("bad_request", 400);
    ({ user } = await requireMember("any"));
    if (!dataConnected()) throw fail("data_unavailable", 503);
    ctx = brandContext(body.brand || {}, body.targets || {});
    const p = body.params || {};
    const FORMATS = ["reel", "carousel", "image", "video", "short", "text"];
    // Older callers sent one "focus": a format for playbooks, a topic otherwise.
    const legacy = String(p.focus || "").trim();
    params = {
      platform: PLATFORM_IDS.includes(p.platform) ? p.platform : ctx.platforms[0],
      format: FORMATS.includes(p.format) ? p.format : FORMATS.includes(legacy) ? legacy : null,
      topic: String(p.topic || (FORMATS.includes(legacy) ? "" : legacy)).replace(/\s+/g, " ").trim().slice(0, 60) || null,
      handles: (Array.isArray(p.handles) ? p.handles : []).map((h) => String(h).replace(/^@/, "").trim()).filter((h) => /^[\w.]{2,30}$/.test(h)).slice(0, 4),
      followers:
        p.followers && Number.isFinite(Number(p.followers.min)) && Number.isFinite(Number(p.followers.max))
          ? { min: Math.max(1000, Math.round(Number(p.followers.min))), max: Math.min(5000000, Math.round(Number(p.followers.max))) }
          : undefined,
    };
    if (kind === "competitors" && !params.handles.length && !(ctx.competitors?.[params.platform] || ctx.competitors?.instagram)?.length) {
      throw Object.assign(fail("bad_request", 400), { message: "Add at least one competitor's handle first." });
    }
    price = kind === "creators" ? PRICES.creators : PRICES.report;
    if (kind !== "creators") free = await useWelcomeReport(user);
    balance = free ? null : await spendCredits(user, kind === "creators" ? "creators" : "report", { meta: { kind } });
    report = await createReport(user, { kind, title: reportTitle(kind, params, ctx), params, credits: free ? 0 : price });
  } catch (err) {
    if (free) await restoreWelcomeReport(user);
    if (balance != null && !report) await refundCredits(user, price, kind || "report");
    const { body: b, status } = errorJson(err);
    if (err?.message && err.code === "bad_request" && err.message !== b.error.message) b.error.message = err.message;
    return NextResponse.json(b, { status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      send({ t: "start", reportId: report.id, title: report.title, credits: balance, charged: free ? 0 : price, free });
      try {
        await runReport({ user, report, kind, params, ctx, onStep: (s) => send({ t: "step", ...s }) });
        send({ t: "done", reportId: report.id, credits: balance });
      } catch (err) {
        await updateReport(user, report.id, { status: "failed" });
        let refunded = null;
        if (free) await restoreWelcomeReport(user);
        else refunded = await refundCredits(user, price, kind, report.id);
        const { body: b } = errorJson(err);
        send({ t: "error", ...b.error, refunded: free || refunded != null, credits: refunded ?? balance, reportId: report.id });
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

export async function GET(req) {
  try {
    const { user } = await requireMember("any");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ reports: await listReports(user), kinds: REPORT_KINDS });
    const report = await getReport(user, id);
    if (!report) throw fail("not_found", 404);
    return NextResponse.json({ report });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
