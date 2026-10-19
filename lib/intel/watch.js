import { createHash } from "node:crypto";
import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS, SONNET_FALLBACK } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { getSupabaseAdmin } from "../supabase/server";
import { REGION_COUNTRY, normaliseRegions, SIGNAL_TYPES } from "../constants";
import { brandContext } from "./brand";
import { collect, within, Purse } from "./collect";
import { marketMap, countryName } from "./market";
import { xQuery } from "./plan";
import { platformLabel } from "./taxonomy";
import { rankSignals } from "../ai/run";

// Watchlists: what moved in a market or for a set of brands, read from the
// sources the person picked, for the window they picked. Four fixed steps:
//   1. read   every chosen source for the window (news, X, Instagram,
//             LinkedIn, Reddit, TikTok, YouTube, ad libraries)
//   2. judge  Haiku marks which items are real market events of the chosen
//             kinds, and about which brand
//   3. merge  the same event seen in the news and on Instagram is one signal
//             with both sources
//   4. write  Sonnet writes each signal for the brand; Haiku ranks the fit
// Every signal is saved on the server the moment it is written, so nothing
// found is ever lost to a closed tab or another device.

export const WATCH_SOURCES = ["google", "instagram", "twitter", "linkedin", "reddit", "tiktok", "youtube", "ads"];
const BUDGET_USD = 0.12;

// The words each kind of move is announced with, for searches.
const MOVE_WORDS = {
  product_launch: ["launch", "launches", "unveils", "introduces", "new range", "drops"],
  collab: ["collab", "collaboration", "partners with", "partnership", "teams up"],
  campaign: ["campaign", "ambassador", "ad film", "featuring"],
  expansion: ["expands", "enters", "opens", "new market", "first store"],
  repositioning: ["rebrand", "new look", "new identity", "relaunch"],
  market_move: ["acquires", "raises", "funding", "price cut", "acquisition"],
  controversy: ["backlash", "controversy", "recall", "lawsuit", "boycott"],
};
const TYPE_OF = { product_launch: "Launch", collab: "Collab", campaign: "Campaign", expansion: "Expansion", repositioning: "Repositioning", market_move: "Market move", controversy: "Controversy" };
const TYPE_LABELS = ["Launch", "Collab", "Campaign", "Expansion", "Repositioning", "Market move", "Controversy", "Other"];

const clean = (v, n = 200) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
const hash = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 16);

// A watched account as typed: a name, an @handle or a link.
function parseAccount(raw) {
  const t = clean(raw, 160);
  if (!t) return null;
  const link = t.match(/^https?:\/\/(www\.)?([^/]+)\/?([^?#]*)/i);
  if (link) {
    const host = link[2].toLowerCase();
    const path = link[3].split("/").filter(Boolean);
    if (/instagram\.com/.test(host)) return { name: path[0], instagram: path[0] };
    if (/(x|twitter)\.com/.test(host)) return { name: path[0], x: path[0] };
    if (/tiktok\.com/.test(host)) return { name: String(path[0] || "").replace(/^@/, ""), tiktok: String(path[0] || "").replace(/^@/, "") };
    if (/linkedin\.com/.test(host)) return { name: path[1] || path[0], linkedin: t };
    if (/facebook\.com/.test(host)) return { name: path[0], facebook: t };
    return { name: host.split(".")[0], website: host };
  }
  if (t.startsWith("@")) return { name: t.slice(1), instagram: t.slice(1), x: t.slice(1) };
  return { name: t };
}

const orGroup = (words) => (words.length > 1 ? `(${words.map((w) => (/\s/.test(w) ? `"${w}"` : w)).join(" OR ")})` : words[0] || "");

function plan(config, ctx, map) {
  const days = config.lookbackDays;
  const sources = config.researchPlatforms;
  const regions = normaliseRegions(config.researchLocations).filter((r) => r !== "Global");
  const country = regions.length === 1 ? REGION_COUNTRY[regions[0]] || null : map.country || null;
  const place = regions.length === 1 ? regions[0] : countryName(country);
  const accounts = String(config.accountList || "").split(/\n|,/).map(parseAccount).filter(Boolean).slice(0, 8);
  const kinds = (config.selectedSignals?.length ? config.selectedSignals : Object.keys(MOVE_WORDS)).filter((k) => MOVE_WORDS[k]);
  const moveWords = [...new Set(kinds.flatMap((k) => MOVE_WORDS[k].slice(0, 2)))].slice(0, 8);
  const niche = clean(config.niche, 80) || map.terms?.[0] || ctx.keywords[0];
  const subs = String(config.subNiches || "").split(/,|\n/).map((s) => clean(s, 40)).filter(Boolean).slice(0, 3);
  const topics = [...new Set([niche, ...subs])].filter(Boolean);
  const focusAccounts = config.targetMode === "accounts" && accounts.length;
  const names = accounts.map((a) => a.name).filter(Boolean);
  const lang = map.language || "en";
  const jobs = [];
  const add = (j) => jobs.push(j);

  if (sources.includes("google")) {
    // One news search per kind of move, so each kind's own words find its stories.
    const perKind = kinds.slice(0, 4).map((k) => MOVE_WORDS[k][0]);
    const qs = [
      ...names.slice(0, 6).map((n) => `${n}${place ? ` ${place}` : ""}`),
      ...(focusAccounts ? [] : topics.slice(0, 2).flatMap((t, i) => (i === 0 ? perKind : perKind.slice(0, 2)).map((w) => `${t} ${w}${place ? ` ${place}` : ""}`))),
    ].slice(0, 9);
    for (const q of qs) add({ cap: "news.search", params: { q, country, days, limit: 20 }, group: "news", label: "News" });
    for (const q of qs.slice(0, 2)) add({ cap: "news.rss", params: { q, country, days }, group: "news", label: "News" });
  }
  if (sources.includes("twitter")) {
    const xDays = Math.min(days, 7);
    if (names.length) add({ cap: "x.search", params: { q: `${orGroup(names.slice(0, 6))} ${orGroup(moveWords)} lang:${lang} -filter:replies`, sort: "Latest" }, pages: 2, group: "x", label: "X" });
    for (const a of accounts.filter((x) => x.x).slice(0, 4)) add({ cap: "x.search", params: { q: `from:${a.x} -filter:replies`, sort: "Latest" }, group: "x", label: "X" });
    if (!focusAccounts) for (const t of topics.slice(0, 2)) add({ cap: "x.search", params: { q: `${xQuery(t, { lang })} ${orGroup(moveWords)}`.replace(" -filter:replies", "") + " -filter:replies", sort: "Latest" }, pages: xDays > 3 ? 2 : 1, group: "x", label: "X" });
  }
  if (sources.includes("instagram")) {
    for (const a of accounts.filter((x) => x.instagram).slice(0, 6)) add({ cap: "instagram.posts", params: { handle: a.instagram }, group: "instagram", label: "Instagram" });
    if (!focusAccounts) for (const t of topics.slice(0, 2)) add({ cap: "instagram.reelsSearch", params: { q: `${t} ${moveWords[0] || "launch"}` }, group: "instagram", label: "Instagram" });
  }
  if (sources.includes("linkedin")) {
    const window = days <= 1 ? "24h" : days <= 7 ? "week" : "month";
    for (const n of names.slice(0, 4)) add({ cap: "linkedin.search", params: { q: n, sort: "date", window }, group: "linkedin", label: "LinkedIn" });
    for (const a of accounts.filter((x) => x.linkedin).slice(0, 3)) add({ cap: "linkedin.companyPosts", params: { url: a.linkedin, window }, group: "linkedin", label: "LinkedIn" });
    if (!focusAccounts) for (const t of topics.slice(0, 2)) add({ cap: "linkedin.search", params: { q: `${t} ${moveWords[0] || "launch"}`, sort: "date", window }, group: "linkedin", label: "LinkedIn" });
  }
  if (sources.includes("reddit")) {
    const timeframe = days <= 1 ? "day" : days <= 7 ? "week" : "month";
    for (const n of names.slice(0, 4)) add({ cap: "reddit.search", params: { q: n, sort: "new", timeframe }, group: "reddit", label: "Reddit" });
    if (!focusAccounts) for (const t of topics.slice(0, 2)) add({ cap: "reddit.search", params: { q: `${t} ${moveWords[0] || "launch"}`, sort: "new", timeframe }, group: "reddit", label: "Reddit" });
  }
  if (sources.includes("tiktok")) {
    const d = days <= 1 ? 1 : days <= 7 ? 7 : 30;
    for (const n of names.slice(0, 3)) add({ cap: "tiktok.search", params: { q: n, sort: 2, days: d }, group: "tiktok", label: "TikTok" });
    if (!focusAccounts) for (const t of topics.slice(0, 1)) add({ cap: "tiktok.search", params: { q: `${t} ${moveWords[0] || "new"}`, sort: 2, days: d }, group: "tiktok", label: "TikTok" });
  }
  if (sources.includes("youtube")) {
    for (const n of names.slice(0, 3)) add({ cap: "youtube.search", params: { q: `${n} ${moveWords[0] || "new"}` }, group: "youtube", label: "YouTube" });
    if (!focusAccounts) for (const t of topics.slice(0, 1)) add({ cap: "youtube.search", params: { q: `${t} ${moveWords[0] || "new"} ${new Date().getFullYear()}` }, group: "youtube", label: "YouTube" });
  }
  if (sources.includes("ads")) {
    for (const n of (names.length ? names : topics).slice(0, 4)) add({ cap: "meta.ads", params: { q: n, country, active: "active", limit: 20 }, group: "ads", label: "Ad library" });
  }
  return { jobs, days, country, place, accounts, kinds, topics, focusAccounts };
}

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          signal: { type: "boolean" },
          type: { type: "string", enum: TYPE_LABELS },
          brand: { type: "string" },
          event: { type: "string" },
        },
        required: ["i", "signal", "type", "brand", "event"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const itemLine = (x, i) => {
  const when = x.postedAt ? String(x.postedAt).slice(0, 10) : x.startedAt ? String(x.startedAt).slice(0, 10) : "undated";
  if (x.kind === "article") return `${i}. [news, ${x.source || "?"}, ${when}] ${clean(x.title, 200)}${x.snippet ? ` — ${clean(x.snippet, 160)}` : ""}`;
  if (x.kind === "ad") return `${i}. [ad by ${x.advertiser || "?"}, started ${when}] ${clean(x.title, 80)} ${clean(x.text, 200)}`;
  return `${i}. [${platformLabel(x.platform)} post by ${x.author?.name || x.author?.handle || "?"}${x.author?.followers ? `, ${x.author.followers} followers` : ""}, ${when}] ${clean(x.caption, 260)}`;
};

// Rules for the stand-in: move words and a capitalised name.
function ruleJudge(items, kinds) {
  return items.map((x, i) => {
    const textBody = `${x.title || ""} ${x.caption || ""} ${x.text || ""}`;
    const kind = kinds.find((k) => MOVE_WORDS[k].some((w) => textBody.toLowerCase().includes(w)));
    const brand = (textBody.match(/\b([A-Z][\w&'.-]+(?:\s[A-Z][\w&'.-]+)?)\b/) || [])[1] || x.advertiser || x.author?.name || "";
    return { i, signal: Boolean(kind && brand), type: TYPE_OF[kind] || "Other", brand, event: clean(x.title || x.caption || x.text, 140) };
  });
}

async function judge(items, { ctx, kinds, focus, place, user }) {
  if (!items.length) return [];
  if (isMock()) return ruleJudge(items, kinds);
  const wanted = kinds.map((k) => TYPE_OF[k]).filter(Boolean);
  const batches = [];
  for (let k = 0; k < items.length; k += 40) batches.push([k, items.slice(k, k + 40)]);
  const out = [];
  await Promise.all(
    batches.map(async ([offset, batch]) => {
      try {
        const message = await anthropic().messages.create({
          model: MODELS.quick.id,
          max_tokens: 6000,
          output_config: { effort: "low", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
          messages: [
            {
              role: "user",
              content: `You screen news stories, social posts and ads for market signals: concrete, dated moves by a named brand or company. Market: ${ctx.niche}${place ? `, in ${place}` : ""}${focus.length ? `. Watching especially: ${focus.join(", ")}` : ""}.
Kinds that count: ${wanted.join(", ")}.
For every item: signal = true only if it reports a specific move of one of those kinds by a named brand (a launch, a collaboration, a campaign...) in this market${place ? ` and in ${place} or clearly aimed at ${place}` : ""}${focus.length ? ` (moves by the watched brands count wherever they happen)` : ""}; opinions, tutorials, reviews, deals, generic posts and moves elsewhere are false. brand = the brand making the move. type = its kind. event = what happened, in under 15 words.

${batch.map((x, j) => itemLine(x, offset + j)).join("\n")}`,
            },
          ],
        });
        await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind: "watch-judge", model: message.model, usage: message.usage });
        out.push(...(JSON.parse(textOf(message) || "{}").items || []));
      } catch {
        out.push(...ruleJudge(batch, kinds).map((r) => ({ ...r, i: r.i + offset })));
      }
    })
  );
  return out;
}

const words = (s) => new Set(String(s || "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));
const similar = (a, b, bar = 0.4) => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let n = 0;
  for (const w of A) if (B.has(w)) n += 1;
  return n / Math.min(A.size, B.size) >= bar;
};
const sourceOf = (x) => (x.kind === "article" ? x.source || "News" : x.kind === "ad" ? "Ad library" : platformLabel(x.platform));

// Same brand, same kind of move, similar words: one event, many sources.
function merge(judged) {
  const events = [];
  for (const j of judged) {
    const key = String(j.brand || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (!key) continue;
    // The same brand's same move, even when it's told as two kinds of move.
    const hit = events.find((e) => e.key === key && (e.type === j.type ? similar(e.event, j.event) : similar(e.event, j.event, 0.6)));
    if (hit) hit.items.push(j.item);
    else events.push({ key, brand: j.brand, type: j.type, event: j.event, items: [j.item] });
  }
  const score = (e) => e.items.length * 3 + e.items.reduce((s, x) => s + Math.log10(1 + (x.metrics?.likes || 0) + (x.metrics?.views || 0) / 20), 0);
  return events.sort((a, b) => score(b) - score(a));
}

const WRITE_SCHEMA = {
  type: "object",
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: { i: { type: "integer" }, headline: { type: "string" }, summary: { type: "string" }, significance: { type: "string" } },
        required: ["i", "headline", "summary", "significance"],
        additionalProperties: false,
      },
    },
  },
  required: ["signals"],
  additionalProperties: false,
};

async function writeSignals(events, { brand, ctx, user }) {
  if (isMock()) {
    return events.map((e, i) => ({ i, headline: `${e.brand}: ${clean(e.event, 90)}`, summary: clean(e.items[0]?.snippet || e.items[0]?.caption || e.items[0]?.text || e.event, 220), significance: `A ${e.type.toLowerCase()} in ${ctx.niche} worth a take from ${ctx.name}.` }));
  }
  const block = events
    .map((e, i) => `${i}. ${e.brand} — ${e.type}: ${e.event}\n${e.items.slice(0, 3).map((x) => `   ${itemLine(x, "-")}`).join("\n")}`)
    .join("\n");
  const message = await anthropic().beta.messages.create({
    model: MODELS.write.id,
    max_tokens: 14000,
    thinking: { type: "between_tools" },
    output_config: { effort: "low", format: { type: "json_schema", schema: WRITE_SCHEMA } },
    ...SONNET_FALLBACK,
    messages: [
      {
        role: "user",
        content: `Brand: ${clean(brand?.brandName, 80) || ctx.name}. ${ctx.description ? `What it does: ${clean(ctx.description, 300)}. ` : ""}Audience: ${clean(ctx.audience, 200) || "not given"}.
Write each market signal below as a card for this brand: headline (under 14 words, the brand and the move, factual), summary (two sentences: what happened and the key detail, only from the sources), significance (one sentence: why it matters to this brand or what they could do about it). Use only what the sources say; no invented numbers or dates. Plain words.

${block}`,
      },
    ],
  });
  await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind: "watch-write", model: message.model, usage: message.usage });
  return JSON.parse(textOf(message) || "{}").signals || [];
}

// A watchlist's settings as the browser sends them, bounded.
export function boundConfig(config = {}) {
  const c = config && typeof config === "object" ? config : {};
  const platforms = [...new Set((Array.isArray(c.researchPlatforms) ? c.researchPlatforms : []).filter((p) => WATCH_SOURCES.includes(p)))];
  const range = Array.isArray(c.resultRange) ? c.resultRange.map((n) => Math.round(Number(n))) : [];
  const [lo, hi] = range.length === 2 && range.every((n) => Number.isFinite(n)) ? range : [10, 25];
  return {
    ...c,
    researchPlatforms: platforms.length ? platforms : ["google"],
    researchLocations: (Array.isArray(c.researchLocations) ? c.researchLocations : []).slice(0, 12).map((r) => String(r).slice(0, 40)),
    lookbackDays: Math.max(1, Math.min(30, Math.round(Number(c.lookbackDays) || 7))),
    resultRange: [Math.max(1, Math.min(60, lo)), Math.max(1, Math.min(60, Math.max(lo, hi)))],
    selectedSignals: (Array.isArray(c.selectedSignals) ? c.selectedSignals : []).filter((x) => SIGNAL_TYPES.some((t) => t.id === x)).slice(0, 10),
    accountList: String(c.accountList || "").slice(0, 4000),
    niche: String(c.niche || "").slice(0, 200),
    subNiches: String(c.subNiches || "").slice(0, 400),
  };
}

/* ------------------------------------------------------------- storage -- */

export async function saveWatchlist(user, { id, name, config }) {
  const admin = getSupabaseAdmin();
  if (!admin || !user?.id || user.id === "local" || !id) return;
  const { error } = await admin.from("watchlists").upsert({ user_id: user.id, id: String(id).slice(0, 80), name: clean(name, 120) || null, config, updated_at: new Date().toISOString(), deleted_at: null }, { onConflict: "user_id,id" });
  if (error) console.error("[huesy:watch] save list", error.message);
}

export async function saveSignal(user, searchId, signal) {
  const admin = getSupabaseAdmin();
  if (!admin || !user?.id || user.id === "local" || !searchId) return;
  const { error } = await admin.from("watch_signals").upsert({ user_id: user.id, search_id: String(searchId).slice(0, 80), signal_key: signal.key, data: signal, found_at: new Date().toISOString() }, { onConflict: "user_id,search_id,signal_key", ignoreDuplicates: false });
  if (error) console.error("[huesy:watch] save signal", error.message);
}

export async function rankStored(user, searchId, ranks) {
  const admin = getSupabaseAdmin();
  if (!admin || !user?.id || user.id === "local" || !searchId || !ranks?.length) return;
  const { data } = await admin.from("watch_signals").select("signal_key, data").eq("user_id", user.id).eq("search_id", searchId).in("signal_key", ranks.map((r) => r.key));
  for (const row of data || []) {
    const r = ranks.find((x) => x.key === row.signal_key);
    if (r) await admin.from("watch_signals").update({ data: { ...row.data, fit: r.fit, angle: r.angle } }).eq("user_id", user.id).eq("search_id", searchId).eq("signal_key", row.signal_key);
  }
}

/* ----------------------------------------------------------------- run -- */

export async function runWatch({ config: raw, brand, searchId = null, name = null, user, send, abort }) {
  const config = boundConfig(raw);
  const ctx = brandContext(brand || {}, { niche: config.niche, subNiches: config.subNiches });
  const member = user || { id: "local" };
  await saveWatchlist(member, { id: searchId, name: name || config.name || config.niche, config });

  send({ t: "status", text: "Getting to know the market" });
  const map = await marketMap(ctx, { user: member });
  const p = plan(config, ctx, map);
  const purse = new Purse(BUDGET_USD);
  send({ t: "status", text: `Reading ${config.researchPlatforms.map((s) => (s === "google" ? "news" : s === "twitter" ? "X" : s === "ads" ? "ad libraries" : platformLabel(s))).join(", ")} for the last ${p.days} day${p.days === 1 ? "" : "s"}` });
  // What it's reading, every source shown: up to two searches per source.
  const shownPer = {};
  for (const j of p.jobs) {
    shownPer[j.label] = (shownPer[j.label] || 0) + 1;
    if (shownPer[j.label] > 2) continue;
    send({ t: "query", q: `${j.label}: ${String(j.params.q || j.params.handle || j.params.url || "").replace(/ -filter:replies| lang:\w+/g, "").slice(0, 90)}` });
  }

  const { items, sources } = await collect(p.jobs, { purse, user: member, signal: abort });
  if (abort?.aborted) return;
  send({ t: "reading", hosts: [...new Set(sources.filter((s) => s.n).map((s) => s.label))].slice(0, 8) });
  const fresh = items
    .filter((x) => ["article", "post", "ad"].includes(x.kind))
    .filter((x) => (x.kind === "ad" ? !x.startedAt || within({ postedAt: x.startedAt }, p.days) : within(x, p.days)))
    .filter((x) => x.kind !== "post" || x.postedAt);
  // News first (dated, sourced), then the busiest posts, then ads.
  const ranked = [
    ...fresh.filter((x) => x.kind === "article"),
    ...fresh.filter((x) => x.kind === "post").sort((a, b) => ((b.metrics.likes || 0) + (b.metrics.views || 0) / 20) - ((a.metrics.likes || 0) + (a.metrics.views || 0) / 20)),
    ...fresh.filter((x) => x.kind === "ad"),
  ].slice(0, 200);
  send({ t: "status", text: `Read ${fresh.length} stories, posts and ads. Picking out real moves` });

  const judged = (await judge(ranked, { ctx, kinds: p.kinds, focus: p.accounts.map((a) => a.name), place: p.place, user: member }))
    .filter((j) => j.signal && ranked[j.i])
    .map((j) => ({ ...j, item: ranked[j.i] }));
  if (abort?.aborted) return;
  // Written in one call, so a check writes up to 40.
  const events = merge(judged).slice(0, Math.min(40, config.resultRange[1]));
  if (!events.length) {
    send({ t: "done", count: 0 });
    return;
  }
  send({ t: "status", text: `Found ${events.length} moves. Writing them up` });

  let written = [];
  try {
    written = await writeSignals(events, { brand, ctx, user: member });
  } catch (err) {
    if (abort?.aborted) return;
    console.error("[huesy:watch] write", err?.message || err);
    written = events.map((e, i) => ({ i, headline: `${e.brand}: ${clean(e.event, 100)}`, summary: clean(e.items[0]?.snippet || e.items[0]?.caption || e.event, 240), significance: "" }));
  }
  const signals = [];
  for (const w of written) {
    const e = events[w.i];
    if (!e) continue;
    const primary = e.items.find((x) => x.kind === "article") || e.items[0];
    const when = e.items.map((x) => x.postedAt || x.startedAt).filter(Boolean).sort()[0] || null;
    const key = hash(`${e.key}|${e.type}|${[...words(e.event)].sort().slice(0, 6).join(" ")}`);
    const signal = {
      id: key,
      key,
      headline: clean(w.headline, 160),
      brand: clean(e.brand, 80),
      type: TYPE_LABELS.includes(e.type) ? e.type : "Other",
      source: sourceOf(primary),
      url: primary?.url || "",
      sources: e.items.slice(0, 5).map((x) => ({ label: sourceOf(x), url: x.url || "", date: (x.postedAt || x.startedAt || "").slice(0, 10) || null })),
      summary: clean(w.summary, 400),
      significance: clean(w.significance, 300),
      date: when ? when.slice(0, 10) : "",
      fetchedAt: Date.now(),
      ...(isMock() ? { sample: true } : {}),
    };
    signals.push(signal);
    await saveSignal(member, searchId, signal);
    send({ t: "signal", signal });
  }

  if (signals.length) {
    send({ t: "status", text: `Ranking these for ${brand?.brandName || "your brand"}` });
    try {
      const ranks = await rankSignals(brand, signals, user);
      send({ t: "ranked", ranks });
      await rankStored(member, searchId, ranks.map((r) => ({ ...r, key: r.id })));
    } catch (err) {
      console.error("[huesy:rank]", err?.message || err);
    }
  }
  send({ t: "done", count: signals.length });
}

export const _test = { parseAccount, plan, merge, similar, boundConfig };
