import { CAPS, capPrice } from "./catalog";
import { cacheKey, readCache, writeCache } from "./cache";
import { mockRaw } from "./mock";
import { isMock } from "../ai/client";
import { fail } from "../ai/errors";
import { recordSpend } from "../ai/usage";

// One way to fetch public data. Reads the shared cache first, then calls the
// data API with a hard timeout and a cost ceiling per call, logs what the
// call really cost (the API reports it per call), and returns the answer
// already turned into Huesy's shapes, with the params for the next page.
//
// HUESY_DATA_TOKEN / HUESY_DATA_ORG / HUESY_DATA_BASE configure the API. With
// the stand-in on (HUESY_AI_MOCK=1) answers come from lib/intel/mock.js in the
// providers' own raw shapes, so the parsers are exercised either way.

const BASE = () => process.env.HUESY_DATA_BASE || "https://treg.to";

export const dataConnected = () => isMock() || Boolean(process.env.HUESY_DATA_TOKEN);

async function callApi(cap, params, signal) {
  const token = process.env.HUESY_DATA_TOKEN;
  if (!token) throw fail("data_unavailable", 503);
  const { body, query } = cap.build(params);
  const url = new URL(`${BASE()}/call/${cap.id}`);
  for (const [k, v] of Object.entries(query || {})) if (v != null && v !== "") url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  const maxCost = typeof cap.maxCost === "function" ? cap.maxCost(params) : cap.maxCost || 0.02;
  const headers = { "X-Treg-Token": token, "X-Treg-Route-Max-Cost": maxCost.toFixed(4) };
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
    console.error("[huesy:data]", cap.id, "unreachable", err?.name || err?.message);
    throw fail("data_unavailable", 503);
  }
  const textBody = await res.text();
  let raw = null;
  try {
    raw = JSON.parse(textBody);
  } catch {
    raw = null;
  }
  const micro = Number(res.headers.get("x-treg-cost-micro"));
  const usd = Number.isFinite(micro) && res.headers.has("x-treg-cost-micro") ? micro / 1e6 : null;
  if (!res.ok || !raw) {
    console.error("[huesy:data]", cap.id, res.status, textBody.slice(0, 240));
    const e = fail("data_unavailable", res.status === 400 || res.status === 422 ? 400 : 503);
    e.usd = usd ?? 0;
    throw e;
  }
  return { raw, usd };
}

// Google News RSS: free, keyless, up to 100 items, and `when:7d` works when
// the query is short. Used next to the paid news search for wider coverage.
const decode = (s) =>
  String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

export async function newsRss({ q, country, days = 7 }, signal) {
  const gl = String(country || "US").toUpperCase();
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${Math.max(1, Math.min(30, days))}d`)}&hl=en-${gl}&gl=${gl}&ceid=${gl}:en`;
  const timeout = AbortSignal.timeout(15000);
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) throw fail("data_unavailable", 503);
  const xml = await res.text();
  const cutoff = Date.now() - days * 86400000 - 6 * 3600000;
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      const tag = (name) => decode(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]);
      const source = tag("source");
      const title = tag("title").replace(new RegExp(`\\s+-\\s+${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
      const when = Date.parse(tag("pubDate"));
      return { kind: "article", title, url: tag("link"), source: source || null, snippet: null, postedAt: Number.isFinite(when) ? new Date(when).toISOString() : null, image: null, feed: "rss" };
    })
    // A long query can quietly drop the date filter, so the window is checked here.
    .filter((a) => a.title && a.url && (!a.postedAt || Date.parse(a.postedAt) >= cutoff));
}

// Identical calls made at the same moment share one request (and one charge).
const inFlight = new Map();

export async function fetchCap(name, params = {}, ctx = {}) {
  const key = cacheKey(name, params);
  if (!ctx.fresh && inFlight.has(key)) {
    const shared = await inFlight.get(key);
    return { ...shared, usd: 0, cached: true };
  }
  const run = fetchCapOnce(name, params, ctx, key);
  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

async function fetchCapOnce(name, params = {}, { user = null, signal, fresh = false } = {}, key) {
  const cap = CAPS[name];
  if (!cap) throw fail("bad_request", 400);

  if (!fresh) {
    const hit = await readCache(key);
    if (hit) {
      // Entries written before paging existed hold the list itself.
      const payload = hit.payload;
      const data = payload && !Array.isArray(payload) && "data" in payload && "next" in payload ? payload.data : payload;
      const next = payload && !Array.isArray(payload) && "next" in payload ? payload.next : null;
      return { data, next, cached: true, fetchedAt: hit.fetchedAt, usd: 0, sample: isMock() };
    }
  }

  const started = Date.now();
  let raw;
  let charged = null;
  if (isMock()) {
    raw = await mockRaw(name, params);
  } else {
    try {
      ({ raw, usd: charged } = await callApi(cap, params, signal));
    } catch (err) {
      // A failed call can still have been billed; it counts towards the day.
      if (err?.usd) await recordSpend({ userId: user?.id, kind: `data:${name}`, model: cap.id, usd: err.usd, mock: false });
      throw err;
    }
  }

  let data;
  try {
    data = cap.parse(raw, params);
  } catch (err) {
    console.error("[huesy:data] parse", name, err?.message);
    data = cap.kind === "profile" || cap.kind === "contact" || cap.kind === "trends" ? null : [];
  }
  const next = cap.next ? cap.next(raw, params) : null;
  const count = Array.isArray(data) ? data.length : 1;
  const usd = isMock() ? 0 : charged ?? capPrice(name, params, count);
  await recordSpend({ userId: user?.id, kind: `data:${name}`, model: cap.id, usd, mock: isMock() });
  const empty = Array.isArray(data) ? data.length === 0 : !data;
  // Empty answers are cached briefly, so a quiet search isn't retried every second.
  await writeCache(key, name, params, { data, next }, empty ? Math.min(cap.ttl, 3600000) : cap.ttl);
  return { data, next, cached: false, fetchedAt: new Date().toISOString(), usd, ms: Date.now() - started, sample: isMock() };
}

// Follows a source's pages until it has enough, runs out, or the purse says
// stop. Returns every item, what it cost, and how far it got.
export async function fetchPages(name, params = {}, { pages = 1, enough = Infinity, purse, user, signal } = {}) {
  const items = [];
  let usd = 0;
  let calls = 0;
  let cachedAll = true;
  let p = params;
  for (let i = 0; i < Math.max(1, pages); i++) {
    if (purse?.empty && i > 0) break;
    const r = await fetchCap(name, p, { user, signal });
    purse?.add(r.usd);
    usd += r.usd;
    calls += 1;
    cachedAll &&= r.cached;
    if (Array.isArray(r.data)) items.push(...r.data);
    if (!r.next || items.length >= enough) break;
    p = r.next;
  }
  return { data: items, usd, calls, cached: cachedAll };
}

// Several calls at once. A call that fails becomes { error } instead of
// sinking the rest: an answer built on four of five sources beats no answer.
export async function fetchMany(jobs, ctx) {
  const settled = await Promise.allSettled(jobs.map(([name, params]) => fetchCap(name, params, ctx)));
  return settled.map((s, i) =>
    s.status === "fulfilled" ? { name: jobs[i][0], ...s.value } : { name: jobs[i][0], error: s.reason?.code || "failed", data: null }
  );
}
