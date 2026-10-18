import { getSupabaseAdmin } from "../supabase/server";

// Conversations with Huesy, kept on the server: reel briefs and the studio
// read them, and they follow the person to any device.

const mem = { threads: new Map(), messages: new Map() };
const useMemory = (user) => !getSupabaseAdmin() || user?.id === "local";
const now = () => new Date().toISOString();

export async function createThread(user, title) {
  const t = { user_id: user.id, title: String(title || "New question").replace(/\s+/g, " ").trim().slice(0, 80) || "New question" };
  if (useMemory(user)) {
    const row = { ...t, id: crypto.randomUUID(), created_at: now(), updated_at: now() };
    mem.threads.set(row.id, row);
    return row;
  }
  const { data, error } = await getSupabaseAdmin().from("intel_threads").insert(t).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getThread(user, id) {
  if (!id) return null;
  if (useMemory(user)) {
    const t = mem.threads.get(id);
    return t && t.user_id === user.id ? t : null;
  }
  const { data } = await getSupabaseAdmin().from("intel_threads").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  return data || null;
}

export async function listThreads(user, limit = 40) {
  if (useMemory(user)) {
    return [...mem.threads.values()].filter((t) => t.user_id === user.id).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, limit);
  }
  const { data } = await getSupabaseAdmin()
    .from("intel_threads")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return data || [];
}

export async function touchThread(user, id, patch = {}) {
  if (useMemory(user)) {
    const t = mem.threads.get(id);
    if (t) mem.threads.set(id, { ...t, ...patch, updated_at: now() });
    return;
  }
  await getSupabaseAdmin().from("intel_threads").update({ ...patch, updated_at: now() }).eq("id", id).eq("user_id", user.id);
}

export async function deleteThread(user, id) {
  if (useMemory(user)) {
    mem.threads.delete(id);
    mem.messages.delete(id);
    return;
  }
  await getSupabaseAdmin().from("intel_threads").delete().eq("id", id).eq("user_id", user.id);
}

export async function addMessage(user, threadId, { role, content, data = null, credits = 0 }) {
  const row = { thread_id: threadId, user_id: user.id, role, content: String(content || ""), data, credits };
  if (useMemory(user)) {
    const list = mem.messages.get(threadId) || [];
    const saved = { ...row, id: list.length + 1, created_at: now() };
    mem.messages.set(threadId, [...list, saved]);
    return saved;
  }
  const { data: saved, error } = await getSupabaseAdmin().from("intel_messages").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return saved;
}

// Takes back a question whose answer failed, so the conversation only holds
// what was answered. The person still has the question in the ask box.
export async function deleteMessage(user, threadId, id) {
  if (useMemory(user)) {
    mem.messages.set(threadId, (mem.messages.get(threadId) || []).filter((m) => m.id !== id));
    return;
  }
  await getSupabaseAdmin().from("intel_messages").delete().eq("id", id).eq("thread_id", threadId).eq("user_id", user.id);
}

// The latest `limit` messages, oldest first.
export async function listMessages(user, threadId, limit = 200) {
  if (useMemory(user)) return (mem.messages.get(threadId) || []).slice(-limit);
  const { data } = await getSupabaseAdmin()
    .from("intel_messages")
    .select("id, role, content, data, credits, created_at")
    .eq("thread_id", threadId)
    .eq("user_id", user.id)
    .order("id", { ascending: false })
    .limit(limit);
  return (data || []).reverse();
}

// Everything a reel brief needs to know about what this person has learned:
// every conversation, condensed to questions and answers, newest first.
// Each conversation's latest messages, dated; one that doesn't fit is
// skipped, not allowed to crowd out the rest.
export async function exportHistory(user, { maxThreads = 20, maxChars = 60000 } = {}) {
  const threads = await listThreads(user, maxThreads);
  const out = [];
  let size = 0;
  for (const t of threads) {
    const msgs = await listMessages(user, t.id, 30);
    const text = msgs.map((m) => `${m.role === "user" ? "Q" : "A"}: ${String(m.content || "").slice(0, 3000)}`).join("\n");
    if (size + text.length > maxChars) continue;
    size += text.length;
    const days = Math.max(0, Math.round((Date.now() - new Date(t.updated_at).getTime()) / 86400000));
    out.push({ id: t.id, title: t.title, updated_at: t.updated_at, ageDays: days, transcript: text });
  }
  return out;
}
