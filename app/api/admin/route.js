import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { errorJson, fail } from "../../../lib/ai/errors";
import { requireAdmin } from "../../../lib/admin";
import { getSupabaseAdmin } from "../../../lib/supabase/server";
import { grantCredits, seatsTaken, setPlan } from "../../../lib/billing/account";
import { tier2Seats, REELS } from "../../../lib/plans";
import { adminGet, deliver, queue, signedVideo, startProduction } from "../../../lib/studio/reels";

export const maxDuration = 60;

const db = () => {
  const admin = getSupabaseAdmin();
  if (!admin) throw fail("not_connected", 503);
  return admin;
};

async function findUser(email) {
  const target = String(email || "").trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data } = await db().auth.admin.listUsers({ page, perPage: 200 });
    const hit = data?.users?.find((u) => (u.email || "").toLowerCase() === target);
    if (hit) return hit;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return null;
}

async function ensureAccount(userId, email) {
  const { data } = await db().from("accounts").select("user_id").eq("user_id", userId).maybeSingle();
  if (!data) await db().from("accounts").insert({ user_id: userId, email: (email || "").toLowerCase() });
}

// Everything the owner needs on one screen.
export async function GET() {
  try {
    await requireAdmin();
    const admin = db();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [accounts, requests, open, delivered, usage, taken] = await Promise.all([
      admin.from("accounts").select("user_id, email, plan, credits, period_start, period_end, welcome_report_used, created_at").order("created_at", { ascending: false }).limit(300),
      admin.from("plan_requests").select("*").eq("status", "pending").order("created_at", { ascending: true }),
      queue(),
      admin.from("reel_requests").select("id, user_id, status, request, delivered_at, results, created_at, proof:grounding->proof->>label, hook:grounding->pattern->>hookLabel").eq("status", "delivered").order("delivered_at", { ascending: false }).limit(200),
      admin.from("ai_usage").select("user_id, kind, usd, mock").gte("created_at", since).limit(20000),
      seatsTaken(),
    ]);
    const spendByUser = {};
    const spendByKind = {};
    for (const r of usage.data || []) {
      if (r.mock) continue;
      const usd = Number(r.usd || 0);
      spendByUser[r.user_id || "none"] = (spendByUser[r.user_id || "none"] || 0) + usd;
      const k = String(r.kind).split(":")[0];
      spendByKind[k] = (spendByKind[k] || 0) + usd;
    }
    // A reel's result counts once its first week is over, or once it passed.
    const tracked = (delivered.data || []).filter((r) => r.results?.checks?.length && r.results?.settled);
    const worked = tracked.filter((r) => r.results?.worked).length;
    // The hit rate by the proof each brief was built on, so the labels can be
    // checked against what actually happened.
    const byProof = {};
    for (const r of tracked) {
      const k = r.proof || "Unknown";
      byProof[k] = byProof[k] || { tracked: 0, worked: 0 };
      byProof[k].tracked += 1;
      if (r.results?.worked) byProof[k].worked += 1;
    }
    return NextResponse.json({
      accounts: (accounts.data || []).map((a) => ({ ...a, spend30d: Number((spendByUser[a.user_id] || 0).toFixed(3)) })),
      requests: requests.data || [],
      queue: open,
      delivered: (delivered.data || []).slice(0, 50),
      seats: { limit: tier2Seats(), taken },
      reelHitRate: { tracked: tracked.length, worked, bar: REELS.successViews, byProof },
      spend30d: Object.fromEntries(Object.entries(spendByKind).map(([k, v]) => [k, Number(v.toFixed(3))])),
    });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null);
    switch (body?.action) {
      case "set_plan": {
        let userId = body.userId;
        let email = body.email;
        if (!userId) {
          const u = await findUser(email);
          if (!u) throw Object.assign(fail("not_found", 404), { message: "No account with that email. They need to sign up first." });
          userId = u.id;
          email = u.email;
        }
        await ensureAccount(userId, email);
        await setPlan(userId, body.plan || null);
        return NextResponse.json({ ok: true });
      }
      case "grant": {
        const amount = Math.round(Number(body.amount));
        if (!body.userId || !Number.isFinite(amount) || amount <= 0 || amount > 200000) throw fail("bad_request", 400);
        const balance = await grantCredits(body.userId, amount, "admin_grant", String(body.note || "").slice(0, 120) || null);
        return NextResponse.json({ ok: true, balance });
      }
      case "decide_request": {
        const { data: r } = await db().from("plan_requests").select("*").eq("id", body.id).maybeSingle();
        if (!r || r.status !== "pending") throw fail("not_found", 404);
        if (body.approve) {
          await ensureAccount(r.user_id, r.email);
          await setPlan(r.user_id, r.plan);
        }
        await db().from("plan_requests").update({ status: body.approve ? "approved" : "declined", decided_at: new Date().toISOString() }).eq("id", r.id);
        return NextResponse.json({ ok: true });
      }
      case "reel_get": {
        const reel = await adminGet(body.id);
        if (!reel) throw fail("not_found", 404);
        const uploads = await Promise.all(
          (reel.request?.uploads || []).map(async (p) => ({ path: p, url: (await db().storage.from("uploads").createSignedUrl(p, 3600)).data?.signedUrl || null }))
        );
        return NextResponse.json({ reel: { ...reel, uploads, videoUrl: await signedVideo(reel.video_path) } });
      }
      case "reel_start":
        return NextResponse.json({ reel: await startProduction(body.id) });
      case "reel_upload_url": {
        const reel = await adminGet(body.id);
        if (!reel) throw fail("not_found", 404);
        const path = `${reel.user_id}/${reel.id}/${randomUUID()}.mp4`;
        const { data, error } = await db().storage.from("reels").createSignedUploadUrl(path);
        if (error) throw fail("failed", 500);
        return NextResponse.json({ path, uploadUrl: data.signedUrl });
      }
      case "reel_deliver": {
        if (!String(body.path || "").includes(body.id)) throw fail("bad_request", 400);
        return NextResponse.json({ reel: await deliver(body.id, { videoPath: body.path, caption: body.caption }) });
      }
      default:
        throw fail("bad_request", 400);
    }
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
