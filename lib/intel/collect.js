import { CAPS } from "./catalog";
import { fetchCap, fetchPages, newsRss } from "./source";

// Runs a research plan: a list of jobs, each one source asked one thing,
// in parallel, page by page, within a purse. Every item comes back tagged
// with the source and the words that found it, de-duplicated across sources,
// and every source reports how much it brought back, so a report can say
// exactly what it read ("212 posts from 140 accounts on X, 38 Reddit threads").
//
// job: { cap, params, pages?, enough?, label?, group? }
//   cap "news.rss" is the free Google News feed; every other cap is in catalog.js.

const DAY = 86400000;

export class Purse {
  constructor(limitUsd = 0.05) {
    this.limit = limitUsd;
    this.spent = 0;
    this.calls = 0;
  }
  add(usd = 0) {
    this.spent += Number(usd) || 0;
    this.calls += 1;
  }
  get empty() {
    return this.spent >= this.limit;
  }
  get left() {
    return Math.max(0, this.limit - this.spent);
  }
}

const SINGLE = new Set(["profile", "contact", "trends"]);

export const itemKey = (x) => {
  if (!x || typeof x !== "object") return String(x);
  if (x.kind === "post") return `post:${x.platform}:${x.id || x.url}`;
  if (x.kind === "article") return `article:${String(x.title || "").toLowerCase().replace(/\W+/g, " ").trim().slice(0, 80)}`;
  if (x.kind === "comment") return `comment:${x.platform}:${x.author}:${String(x.text || "").slice(0, 80)}`;
  if (x.kind === "review") return `review:${x.source}:${x.author}:${String(x.text || "").slice(0, 80)}`;
  if (x.kind === "profile" || x.kind === "creator") return `profile:${x.platform}:${String(x.handle || "").toLowerCase()}`;
  if (x.kind === "ad") return `ad:${x.platform}:${x.id || `${x.advertiser}:${String(x.text || "").slice(0, 60)}`}`;
  return `${x.kind}:${x.id || x.url || JSON.stringify(x).slice(0, 80)}`;
};

export const dedupe = (items) => {
  const seen = new Set();
  return items.filter((x) => {
    const k = itemKey(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// Inside the window, or undated (some sources don't say when).
export const within = (x, days) => !x?.postedAt || Date.now() - new Date(x.postedAt).getTime() <= days * DAY;

const labelFor = (job) => job.label || CAPS[job.cap]?.label || (job.cap === "news.rss" ? "News" : job.cap);

export async function collect(jobs, { purse, user, signal, concurrency = 6 } = {}) {
  const queue = jobs.map((job, i) => ({ job, i }));
  const results = new Array(jobs.length);
  async function worker() {
    while (queue.length) {
      const { job, i } = queue.shift();
      if (signal?.aborted) return;
      if (purse?.empty) {
        results[i] = { job, items: [], calls: 0, skipped: "budget" };
        continue;
      }
      try {
        if (job.cap === "news.rss") {
          const items = await newsRss(job.params || {}, signal);
          results[i] = { job, items, calls: 1, cached: false };
        } else if (SINGLE.has(CAPS[job.cap]?.kind)) {
          const r = await fetchCap(job.cap, job.params || {}, { user, signal });
          purse?.add(r.usd);
          results[i] = { job, items: r.data ? [r.data] : [], calls: 1, cached: r.cached };
        } else {
          const r = await fetchPages(job.cap, job.params || {}, { pages: job.pages || 1, enough: job.enough, purse, user, signal });
          results[i] = { job, items: r.data, calls: r.calls, cached: r.cached };
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        results[i] = { job, items: [], calls: 1, error: err?.code || "failed" };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, worker));

  const all = [];
  const sources = [];
  for (const r of results) {
    if (!r) continue;
    const label = labelFor(r.job);
    const words = r.job.params?.q || r.job.params?.query || r.job.params?.tag || r.job.params?.handle || r.job.params?.url || null;
    for (const it of r.items || []) {
      if (it && typeof it === "object") all.push({ ...it, src: label, foundBy: words, group: r.job.group || null });
    }
    sources.push({ cap: r.job.cap, label, group: r.job.group || null, words, n: (r.items || []).length, calls: r.calls || 0, cached: Boolean(r.cached), error: r.error || null, skipped: r.skipped || null });
  }
  return { items: dedupe(all), sources, spent: purse?.spent ?? null };
}

// "212 posts from 140 accounts on X, 38 Reddit threads": what a piece read.
export function sourceSummary(items) {
  const posts = items.filter((x) => x.kind === "post");
  const byPlatform = new Map();
  for (const p of posts) {
    if (!byPlatform.has(p.platform)) byPlatform.set(p.platform, { posts: 0, accounts: new Set() });
    const b = byPlatform.get(p.platform);
    b.posts += 1;
    if (p.author?.handle) b.accounts.add(p.author.handle.toLowerCase());
  }
  const count = (kind) => items.filter((x) => x.kind === kind).length;
  return {
    platforms: [...byPlatform.entries()].map(([platform, b]) => ({ platform, posts: b.posts, accounts: b.accounts.size })),
    comments: count("comment"),
    reviews: count("review"),
    articles: count("article"),
    ads: count("ad"),
  };
}
