import { CAPS, capPrice } from "./catalog";
import { cacheKey, readCache, writeCache } from "./cache";
import { mockRaw } from "./mock";
import { isMock } from "../ai/client";
import { fail } from "../ai/errors";
import { recordSpend } from "../ai/usage";

// One way to fetch public data. Reads the shared cache first, then calls the
// data API with a hard timeout and a cost ceiling per call, logs the spend,
// and returns the answer already turned into Huesy's shapes.
//
// HUESY_DATA_TOKEN / HUESY_DATA_ORG / HUESY_DATA_BASE configure the API. With
// the stand-in on (HUESY_AI_MOCK=1) answers come from lib/intel/mock.js in the
// providers' own raw shapes, so the converters are exercised either way.

const BASE = () => process.env.HUESY_DATA_BASE || "https://treg.to";

export const dataConnected = () => isMock() || Boolean(process.env.HUESY_DATA_TOKEN);

export async function fetchCap(name, params = {}, { user = null, signal, fresh = false } = {}) {
  const cap = CAPS[name];
  if (!cap) throw fail("bad_request", 400);
  const key = cacheKey(name, params);

  if (!fresh) {
    const hit = await readCache(key);
    if (hit) return { data: hit.payload, cached: true, fetchedAt: hit.fetchedAt, usd: 0, sample: isMock() };
  }

  const started = Date.now();
  let raw;
  if (isMock()) {
    raw = await mockRaw(name, params);
  } else {
    const token = process.env.HUESY_DATA_TOKEN;
    if (!token) throw fail("data_unavailable", 503);
    const { body, query } = cap.build(params);
    const url = new URL(`${BASE()}/call/${cap.id}`);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, String(v));
    const maxCost = typeof cap.maxCost === "function" ? cap.maxCost(params) : cap.maxCost || 0.03;
    const headers = { "X-Treg-Token": token, "X-Treg-Route-Max-Cost": maxCost.toFixed(3) };
    if (process.env.HUESY_DATA_ORG) headers["X-Treg-Org"] = process.env.HUESY_DATA_ORG;
    if (body) headers["Content-Type"] = "application/json";
    const timeout = AbortSignal.timeout(cap.timeout || 25000);
    let res;
    try {
      res = await fetch(url, {
        method: cap.method || (body ? "POST" : "GET"),
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      console.error("[huesy:data]", name, "unreachable", err?.name || err?.message);
      throw fail("data_unavailable", 503);
    }
    const text = await res.text();
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
    if (!res.ok || !raw) {
      console.error("[huesy:data]", name, res.status, text.slice(0, 300));
      throw fail("data_unavailable", res.status === 400 ? 400 : 503);
    }
  }

  const data = cap.parse(raw, params);
  const count = Array.isArray(data) ? data.length : 1;
  const usd = isMock() ? 0 : capPrice(name, params, count);
  await recordSpend({ userId: user?.id, kind: `data:${name}`, model: cap.id, usd, mock: isMock() });
  const empty = Array.isArray(data) ? data.length === 0 : !data;
  // Empty answers are cached briefly, so a quiet search isn't retried every second.
  await writeCache(key, name, params, data, empty ? Math.min(cap.ttl, 3600000) : cap.ttl);
  return { data, cached: false, fetchedAt: new Date().toISOString(), usd, ms: Date.now() - started, sample: isMock() };
}

// Several calls at once. A call that fails becomes { error } instead of
// sinking the rest: an answer built on four of five sources beats no answer.
export async function fetchMany(jobs, ctx) {
  const settled = await Promise.allSettled(jobs.map(([name, params]) => fetchCap(name, params, ctx)));
  return settled.map((s, i) =>
    s.status === "fulfilled" ? { name: jobs[i][0], ...s.value } : { name: jobs[i][0], error: s.reason?.code || "failed", data: null }
  );
}
