import { getSupabaseAdmin } from "../supabase/server";
import { fail } from "../ai/errors";

// Studio pieces: creatives, carousels and text posts, with the grounding they
// were built on. `counted` marks the ones that used a month's allowance.

const mem = new Map();
const useMemory = (user) => !getSupabaseAdmin() || user?.id === "local";
const now = () => new Date().toISOString();

export async function createItem(user, { kind, title, grounding, body }) {
  const row = { user_id: user.id, kind, title: String(title || "").slice(0, 140) || null, grounding: grounding || null, body: body || {}, status: "draft" };
  if (useMemory(user)) {
    const r = { ...row, id: crypto.randomUUID(), counted: false, counted_at: null, created_at: now(), updated_at: now() };
    mem.set(r.id, r);
    return r;
  }
  const { data, error } = await getSupabaseAdmin().from("content_items").insert(row).select("*").single();
  if (error) throw fail("failed", 500);
  return data;
}

export async function getItem(user, id) {
  if (useMemory(user)) {
    const r = mem.get(id);
    return r && r.user_id === user.id ? r : null;
  }
  const { data } = await getSupabaseAdmin().from("content_items").select("*").eq("id", id).eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  return data || null;
}

export async function listItems(user, { kind, limit = 60 } = {}) {
  if (useMemory(user)) {
    return [...mem.values()].filter((r) => r.user_id === user.id && (!kind || r.kind === kind)).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, limit);
  }
  let q = getSupabaseAdmin()
    .from("content_items")
    .select("id, kind, title, status, counted, body, grounding, created_at, updated_at")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return data || [];
}

export async function updateItem(user, id, patch) {
  const allowed = {};
  for (const k of ["title", "body", "status", "grounding"]) if (patch[k] !== undefined) allowed[k] = patch[k];
  if (useMemory(user)) {
    const r = mem.get(id);
    if (!r || r.user_id !== user.id) throw fail("not_found", 404);
    const next = { ...r, ...allowed, updated_at: now() };
    mem.set(id, next);
    return next;
  }
  const { data, error } = await getSupabaseAdmin().from("content_items").update(allowed).eq("id", id).eq("user_id", user.id).select("*").maybeSingle();
  if (error) throw fail("failed", 500);
  if (!data) throw fail("not_found", 404);
  return data;
}

// A short lock on a piece while a paid step runs (making a picture or a
// carousel), so parallel requests can't each do it. Returns false when busy.
const locks = new Map();
export async function lockItem(user, id, seconds = 150) {
  const until = new Date(Date.now() + seconds * 1000).toISOString();
  if (useMemory(user)) {
    if ((locks.get(id) || 0) > Date.now()) return false;
    locks.set(id, Date.now() + seconds * 1000);
    return true;
  }
  const { data } = await getSupabaseAdmin()
    .from("content_items")
    .update({ lock_until: until })
    .eq("id", id)
    .eq("user_id", user.id)
    .or(`lock_until.is.null,lock_until.lt.${now()}`)
    .select("id");
  return Boolean(data?.length);
}

export async function unlockItem(user, id) {
  if (useMemory(user)) {
    locks.delete(id);
    return;
  }
  await getSupabaseAdmin().from("content_items").update({ lock_until: null }).eq("id", id).eq("user_id", user.id);
}

export async function markCountedLocal(user, id) {
  if (useMemory(user)) {
    const r = mem.get(id);
    if (r) mem.set(id, { ...r, counted: true, counted_at: now() });
  }
}

// A piece that used the month's allowance is hidden, not removed, so it
// still counts. An idea that never counted is simply deleted.
export async function deleteItem(user, id) {
  if (useMemory(user)) {
    mem.delete(id);
    return;
  }
  const admin = getSupabaseAdmin();
  await admin.from("content_items").delete().eq("id", id).eq("user_id", user.id).eq("counted", false);
  await admin.from("content_items").update({ deleted_at: now() }).eq("id", id).eq("user_id", user.id);
}
