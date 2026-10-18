import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "../supabase/server";
import { isMock } from "../ai/client";

// A read-through cache for public data, shared by every account: two brands in
// the same niche asking about #skincare within the hour cost one call.
// Sample data from the stand-in never touches the shared table, so a test run
// can never leak into what real customers read.

const memory = new Map();

const stable = (v) => {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => `${k}:${stable(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
};

export const cacheKey = (cap, params) =>
  createHash("sha256").update(`${cap}|${stable(params || {})}`).digest("hex").slice(0, 40);

const useMemory = () => isMock() || !getSupabaseAdmin();

export async function readCache(key) {
  if (useMemory()) {
    const hit = memory.get(key);
    if (hit && hit.expires > Date.now()) return hit;
    return null;
  }
  const { data, error } = await getSupabaseAdmin()
    .from("data_cache")
    .select("payload, fetched_at, expires_at")
    .eq("key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return { payload: data.payload, fetchedAt: data.fetched_at };
}

export async function writeCache(key, cap, params, payload, ttlMs) {
  const fetchedAt = new Date().toISOString();
  if (useMemory()) {
    memory.set(key, { payload, fetchedAt, expires: Date.now() + ttlMs });
    return;
  }
  const { error } = await getSupabaseAdmin()
    .from("data_cache")
    .upsert({
      key,
      capability: cap,
      params,
      payload,
      fetched_at: fetchedAt,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    });
  if (error) console.error("[huesy:cache] write", cap, error.message);
}

export function clearMemoryCache() {
  memory.clear();
}
