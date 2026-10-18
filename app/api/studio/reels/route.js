import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { allowanceLeft } from "../../../../lib/billing/account";
import { brandContext, PLATFORM_IDS } from "../../../../lib/intel/brand";
import { dataConnected, fetchCap } from "../../../../lib/intel/source";
import { ageDays, latestOnly, queryFindings } from "../../../../lib/intel/findings";
import { exportHistory } from "../../../../lib/intel/threads";
import { ground } from "../../../../lib/studio/ground";
import { REEL_STYLES, reelBrief } from "../../../../lib/studio/write";
import { allowanceMessage, limitError } from "../../../../lib/studio/limits";
import {
  cancelReel,
  createDraft,
  getReel,
  listReels,
  recordResults,
  requestRevision,
  signedVideo,
  submitReel,
  updateDraft,
} from "../../../../lib/studio/reels";
import { REELS } from "../../../../lib/plans";

export const maxDuration = 300;

const cleanRequest = (r = {}, userId = "") => ({
  goal: String(r.goal || "").slice(0, 120),
  topic: String(r.topic || "").slice(0, 160),
  style: REEL_STYLES[r.style] ? r.style : "faceless",
  length: String(r.length || "").slice(0, 40),
  cta: String(r.cta || "").slice(0, 160),
  mustInclude: String(r.mustInclude || "").slice(0, 600),
  voice: String(r.voice || "").slice(0, 40),
  language: String(r.language || "English").slice(0, 40),
  references: (r.references || []).map((u) => String(u).slice(0, 400)).filter((u) => /^https?:\/\//.test(u)).slice(0, 5),
  uploads: (Array.isArray(r.uploads) ? r.uploads : []).filter((p) => typeof p === "string" && p.startsWith(`${userId}/reel-refs/`) && !p.includes("..")).slice(0, 8),
});

// The brand as it was when the reel was asked for, for whoever makes it.
const BRAND_KEYS = ["brandName", "product", "brandDescription", "targetAudience", "brandPersona", "brandValues", "platformPersonality", "creativeDirection", "activePlatforms", "intel"];
const brandSnapshot = (brand = {}) => {
  const out = {};
  for (const k of BRAND_KEYS) if (brand?.[k] !== undefined) out[k] = brand[k];
  const text = JSON.stringify(out);
  return text.length > 20000 ? JSON.parse(JSON.stringify({ brandName: out.brandName, product: out.product, brandDescription: String(out.brandDescription || "").slice(0, 2000) })) : out;
};
const MAX_REBUILDS = 3;

async function present(reel) {
  if (!reel) return reel;
  const { history, ...rest } = reel;
  return { ...rest, videoUrl: reel.video_path ? await signedVideo(reel.video_path) : null, historyThreads: history?.threads?.length ?? undefined };
}

// The views on a delivered reel, read from its public link when the platform
// shares them. Otherwise the person types them in.
async function readViews(url, user) {
  const code = String(url).match(/instagram\.com\/(?:reel|p)\/([^/?#]+)/)?.[1];
  if (!code) return null;
  try {
    const r = await fetchCap("instagram.post", { shortcode: code }, { user, fresh: true });
    return { views: r.data?.metrics?.views ?? null, likes: r.data?.metrics?.likes ?? null, postedAt: r.data?.postedAt || null };
  } catch {
    return null;
  }
}

const WEEK = 7 * 86400000;
// A reel works when it passes the bar within seven days of being posted.
// Checks after day seven are kept for interest but don't count.
function verdict(checks, postedAt) {
  const posted = postedAt ? new Date(postedAt).getTime() : null;
  const inWeek = posted ? checks.filter((c) => new Date(c.at).getTime() - posted <= WEEK) : [];
  const weekBest = Math.max(0, ...inWeek.map((c) => c.views || 0));
  const best = Math.max(0, ...checks.map((c) => c.views || 0));
  const weekOver = posted ? Date.now() - posted > WEEK : false;
  return { best, weekBest, worked: weekBest >= REELS.successViews, settled: weekOver || weekBest >= REELS.successViews };
}

export async function POST(req) {
  let user;
  let body;
  try {
    body = await req.json().catch(() => null);
    ({ user } = await requireMember("studio"));
  } catch (err) {
    const { body: b, status } = errorJson(err);
    return NextResponse.json(b, { status });
  }

  // Building the brief takes a minute, so it streams its steps.
  if (body?.action === "brief") {
    try {
      const a = await allowanceLeft(user, "reel");
      const blocked = allowanceMessage("reel", a.left, a.resetsAt);
      if (blocked && !body.reelId) throw limitError(blocked);
      if (body.reelId) {
        const draft = await getReel(user, body.reelId);
        if (!draft || draft.status !== "draft") throw fail("not_found", 404);
        if ((draft.request?.rebuilds || 0) >= MAX_REBUILDS) throw limitError("That's 3 new briefs for this reel. Send this one, or start a new reel.");
      }
      if (!dataConnected()) throw fail("data_unavailable", 503);
    } catch (err) {
      const { body: b, status } = errorJson(err);
      return NextResponse.json(b, { status });
    }
    const ctx = brandContext(body.brand || {}, body.targets || {});
    const platform = PLATFORM_IDS.includes(body.platform) ? body.platform : ctx.platforms[0];
    const request = cleanRequest(body.request, user.id);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (e) => {
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
          } catch {
            /* closed */
          }
        };
        try {
          const pack = await ground({ type: "reel", platform, topic: request.topic || null, ctx, user, sourceIds: (body.sourceIds || []).slice(0, 12), onStep: (s) => send({ t: "step", ...s }) });
          send({ t: "step", id: "history", label: "Reading everything you've learned with me", status: "running" });
          const threads = await exportHistory(user);
          const findings = latestOnly(await queryFindings(user, { sinceDays: 60, limit: 120 }))
            .slice(0, 40)
            .map((f) => ({ kind: f.kind, platform: f.platform, fact: f.statement, at: f.fetched_at, ageDays: ageDays(f) }));
          send({ t: "step", id: "history", label: `Read ${threads.length} conversations and ${findings.length} findings`, status: "done" });
          send({ t: "step", id: "brief", label: "Writing the brief", status: "running" });
          const brief = await reelBrief({ pack, ctx, request, history: threads, findings, user });
          send({ t: "step", id: "brief", label: "Brief ready", status: "done" });
          const snapshot = { ...brandSnapshot(body.brand), niche: ctx.niche, platform };
          const previous = body.reelId ? await getReel(user, body.reelId) : null;
          const draft = body.reelId
            ? await updateDraft(user, body.reelId, { request: { ...request, platform, rebuilds: (previous?.request?.rebuilds || 0) + 1 }, brief, grounding: pack })
            : await createDraft(user, { request: { ...request, platform }, brief, grounding: pack, brand: snapshot, history: { threads, findings } });
          send({ t: "reel", reel: await present(draft) });
          send({ t: "done" });
        } catch (err) {
          const { body: b } = errorJson(err);
          send({ t: "error", ...b.error });
        } finally {
          try {
            controller.close();
          } catch {
            /* closed */
          }
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  }

  try {
    if (body?.action === "submit") {
      const reel = await getReel(user, body.reelId);
      if (!reel) throw fail("not_found", 404);
      if (reel.status === "draft") {
        const hookIndex = Math.max(0, Math.min(2, Number(body.hookIndex) || 0));
        await updateDraft(user, reel.id, { request: { ...reel.request, chosenHook: hookIndex, notes: String(body.notes || "").slice(0, 1000) } });
      }
      return NextResponse.json({ reel: await present(await submitReel(user, body.reelId)) });
    }
    if (body?.action === "cancel") return NextResponse.json({ reel: await present(await cancelReel(user, body.reelId)) });
    if (body?.action === "revise") return NextResponse.json({ reel: await present(await requestRevision(user, body.reelId, body.note)) });
    if (body?.action === "results") {
      const reel = await getReel(user, body.reelId);
      if (!reel) throw fail("not_found", 404);
      const url = String(body.url || reel.results?.url || "").trim();
      if (!/^https?:\/\//.test(url)) throw Object.assign(fail("bad_request", 400), { message: "Paste the link to the posted reel." });
      const typed = body.views === "" || body.views == null ? NaN : Number(body.views);
      const read = Number.isFinite(typed) && typed >= 0 && typed < 1e10 ? { views: Math.round(typed), source: "you" } : await readViews(url, user);
      // When it was posted: from the platform, or what the person told us.
      const given = body.postedAt && !Number.isNaN(new Date(body.postedAt).getTime()) ? new Date(body.postedAt).toISOString() : null;
      const postedAt = reel.results?.postedAt || read?.postedAt || given || null;
      const checks = [...(reel.results?.checks || [])].slice(-29);
      if (read?.views != null) checks.push({ at: new Date().toISOString(), views: read.views, likes: read.likes ?? null, source: read.source || "read" });
      const v = verdict(checks, postedAt);
      const saved = await recordResults(user, reel.id, { url, postedAt, checks, ...v });
      return NextResponse.json({ reel: await present(saved), needsViews: read?.views == null, needsDate: !postedAt });
    }
    throw fail("bad_request", 400);
  } catch (err) {
    const { body: b, status } = errorJson(err);
    return NextResponse.json(b, { status });
  }
}

export async function GET(req) {
  try {
    const { user } = await requireMember("studio");
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const reel = await getReel(user, id);
      if (!reel) throw fail("not_found", 404);
      return NextResponse.json({ reel: await present(reel) });
    }
    const reels = await listReels(user);
    return NextResponse.json({ reels: await Promise.all(reels.map(present)) });
  } catch (err) {
    const { body: b, status } = errorJson(err);
    return NextResponse.json(b, { status });
  }
}
