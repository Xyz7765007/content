import { getSupabaseAdmin } from "../supabase/server";
import { fail } from "../ai/errors";
import { REELS } from "../plans";
import { claimAllowance, releaseAllowance } from "../billing/account";

// A reel request's life: draft (brief being shaped, free) → requested (counted,
// due in 24 hours) → in production (the OS has it) → delivered. One free
// revision sends it back to the queue. Cancelling before production starts,
// or a delivery more than 48 hours late, gives the allowance back.

const mem = new Map();
const useMemory = (user) => !getSupabaseAdmin() || user?.id === "local";
const db = () => getSupabaseAdmin();
const now = () => new Date().toISOString();
const hoursFrom = (h) => new Date(Date.now() + h * 3600000).toISOString();

export const OPEN = ["requested", "in_production", "revision_requested"];

export async function createDraft(user, { request, brief, grounding, brand, history }) {
  const row = { user_id: user.id, status: "draft", request, brief, grounding, brand, history };
  if (useMemory(user)) {
    const r = { ...row, id: crypto.randomUUID(), counted: false, revisions_used: 0, created_at: now(), updated_at: now() };
    mem.set(r.id, r);
    return r;
  }
  const { data, error } = await db().from("reel_requests").insert(row).select("*").single();
  if (error) throw fail("failed", 500);
  return data;
}

async function load(user, id) {
  if (useMemory(user)) {
    const r = mem.get(id);
    return r && r.user_id === user.id ? r : null;
  }
  const { data } = await db().from("reel_requests").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  return data || null;
}

async function save(user, id, patch) {
  if (useMemory(user)) {
    const r = mem.get(id);
    const next = { ...r, ...patch, updated_at: now() };
    mem.set(id, next);
    return next;
  }
  const { data, error } = await db().from("reel_requests").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw fail("failed", 500);
  return data;
}

// Gives a very late reel back to the month's allowance (once), and says so.
// Only the first delivery counts: a revision is free, so it has nothing to
// give back.
async function settleLate(user, r) {
  if (!r || !["requested", "in_production"].includes(r.status) || !r.counted || !r.due_at) return r;
  const lateBy = Date.now() - new Date(r.due_at).getTime() - (REELS.refundHours - REELS.dueHours) * 3600000;
  if (lateBy <= 0 || r.request?.lateRefunded) return r;
  if (!useMemory(user)) await releaseAllowance("reel", r.id);
  return save(user, r.id, { counted: false, counted_at: null, request: { ...r.request, lateRefunded: true } });
}

export async function getReel(user, id) {
  return settleLate(user, await load(user, id));
}

export async function listReels(user, limit = 30) {
  let rows;
  if (useMemory(user)) rows = [...mem.values()].filter((r) => r.user_id === user.id && r.status !== "draft");
  else {
    const { data } = await db()
      .from("reel_requests")
      .select("id, status, request, brief, counted, counted_at, due_at, delivered_at, video_path, caption, revisions_used, results, created_at, updated_at")
      .eq("user_id", user.id)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(limit);
    rows = data || [];
  }
  return Promise.all(rows.map((r) => settleLate(user, r)));
}

export async function updateDraft(user, id, patch) {
  const r = await load(user, id);
  if (!r) throw fail("not_found", 404);
  if (r.status !== "draft") throw fail("bad_request", 400);
  const allowed = {};
  for (const k of ["request", "brief", "grounding"]) if (patch[k] !== undefined) allowed[k] = patch[k];
  return save(user, id, allowed);
}

export async function submitReel(user, id) {
  const r = await load(user, id);
  if (!r) throw fail("not_found", 404);
  if (r.status !== "draft") return r;
  if (!r.brief) throw fail("bad_request", 400);
  const used = await claimAllowance(user, "reel", id);
  const patch = { status: "requested", due_at: hoursFrom(REELS.dueHours) };
  if (useMemory(user)) Object.assign(patch, { counted: true, counted_at: now() });
  const saved = await save(user, id, patch);
  return { ...saved, used };
}

export async function cancelReel(user, id) {
  const r = await load(user, id);
  if (!r) throw fail("not_found", 404);
  if (r.status === "draft") {
    if (useMemory(user)) mem.delete(id);
    else await db().from("reel_requests").delete().eq("id", id).eq("user_id", user.id);
    return { cancelled: true };
  }
  if (r.status !== "requested") throw Object.assign(fail("bad_request", 400), { message: "This reel is already being made, so it can't be cancelled." });
  if (r.counted && !useMemory(user)) await releaseAllowance("reel", id);
  return save(user, id, { status: "cancelled", counted: false, counted_at: null });
}

export async function requestRevision(user, id, note) {
  const r = await load(user, id);
  if (!r) throw fail("not_found", 404);
  if (r.status !== "delivered") throw fail("bad_request", 400);
  if ((r.revisions_used || 0) >= REELS.revisions) throw Object.assign(fail("bad_request", 400), { message: "This reel's free revision has been used." });
  const text = String(note || "").trim().slice(0, 1200);
  if (text.length < 4) throw Object.assign(fail("bad_request", 400), { message: "Say what you'd like changed." });
  return save(user, id, { status: "revision_requested", revision_note: text, revisions_used: (r.revisions_used || 0) + 1, due_at: hoursFrom(REELS.dueHours) });
}

export async function recordResults(user, id, patch) {
  const r = await load(user, id);
  if (!r) throw fail("not_found", 404);
  if (r.status !== "delivered") throw fail("bad_request", 400);
  const results = { ...(r.results || {}), ...patch };
  return save(user, id, { results });
}

/* ------------------------------------------------- the queue (admin, OS) -- */

export async function queue({ statuses = OPEN, limit = 100 } = {}) {
  const admin = db();
  if (!admin) return [];
  const { data } = await admin
    .from("reel_requests")
    .select("id, user_id, status, request, brief, due_at, delivered_at, revision_note, revisions_used, created_at, updated_at")
    .in("status", statuses)
    .order("due_at", { ascending: true })
    .limit(limit);
  return data || [];
}

export async function adminGet(id) {
  const { data } = await db().from("reel_requests").select("*").eq("id", id).maybeSingle();
  return data || null;
}

export async function startProduction(id) {
  const { data } = await db().from("reel_requests").update({ status: "in_production" }).eq("id", id).in("status", ["requested", "revision_requested"]).select("*").maybeSingle();
  return data;
}

export async function deliver(id, { videoPath, caption }) {
  // A first delivery more than a day past due gives the reel back to the
  // month, once, even if nobody opened the page while it was late.
  const before = await adminGet(id);
  if (before && ["requested", "in_production"].includes(before.status) && before.counted && before.due_at && !before.request?.lateRefunded) {
    const lateBy = Date.now() - new Date(before.due_at).getTime() - (REELS.refundHours - REELS.dueHours) * 3600000;
    if (lateBy > 0) {
      await db().from("reel_requests").update({ counted: false, counted_at: null, request: { ...before.request, lateRefunded: true } }).eq("id", id);
    }
  }
  const { data, error } = await db()
    .from("reel_requests")
    .update({ status: "delivered", video_path: videoPath, caption: caption ? String(caption).slice(0, 3000) : null, delivered_at: now() })
    .eq("id", id)
    .in("status", ["requested", "in_production", "revision_requested"])
    .select("*")
    .maybeSingle();
  if (error) throw fail("failed", 500);
  if (!data) throw fail("not_found", 404);
  return data;
}

export async function signedVideo(path, seconds = 60 * 60 * 24) {
  if (!path) return null;
  const { data } = await db().storage.from("reels").createSignedUrl(path, seconds);
  return data?.signedUrl || null;
}
