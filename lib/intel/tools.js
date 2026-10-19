import { collect, dedupe, within, sourceSummary, Purse } from "./collect";
import { tagPosts } from "./tagger";
import { baselineFor, curveGrowth, enrich, rows, summarize, topHashtags, trendGrowth } from "./stats";
import { TIKTOK_REGIONS, industryFor } from "./catalog";
import { platformLabel, TZ_OFFSET } from "./taxonomy";
import { countryName, marketMap } from "./market";
import { brandMentions, marketNews } from "./judge";
import { postJobs, newsJobs, xQuery } from "./plan";
import { isMock } from "../ai/client";

// The analyses everything else is built from: what works on a platform, what
// is moving this week, what was posted about something, the news, the ads
// running, what buyers say in reviews, and who mentions a brand. Each one
// reads its sources through the market map and the collector (in parallel,
// page by page, within a purse), labels posts with the tagger, measures them
// in stats.js, and narrates its steps through onStep.

export { Purse };
export { accountSnapshot, resolveCompetitor } from "./accounts";
export { audienceVoice } from "./voice";
export { findCreators, creatorContact } from "./creators";
export { reviewsFor } from "./reviews";

const DAY = 86400000;
const noop = () => {};

// Words that say nothing about a topic, dropped before searching or matching.
const STOP = new Set("a an and are as at be best by can do does for from get got have how i in into is it its make me my of on or our should so than that the their them then there these this to too us vs was we what when where which who why will with without you your latest new top".split(" "));

// The content words of a topic, singular, for matching and searching.
export function topicTerms(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

// A topic as people would search it: its last three content words, which is
// usually where the subject is ("how to clean white sneakers" -> "clean white sneakers").
export const searchPhrase = (text) => {
  const raw = String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w));
  return raw.slice(-3).join(" ");
};

// The market's own words, minus places and words every business uses. When the
// news judge can't be reached, a story must share one of these to be shown.
const BUSINESS_WORDS = new Set("brand business company companies industry market product startup startups news launch launches".split(" "));
export function marketWords(ctx, map) {
  const place = new Set(topicTerms([map?.country, countryName(map?.country), ctx?.country].filter(Boolean).join(" ")));
  return new Set(topicTerms([...(map?.terms || []), ...(ctx?.keywords || []), ctx?.niche].filter(Boolean).join(" ")).filter((w) => !place.has(w) && !BUSINESS_WORDS.has(w)));
}

export const overlaps = (a, b) => {
  const x = new Set(topicTerms(a));
  return topicTerms(b).some((w) => x.has(w));
};

const FORMAT_WORDS = { reel: "reels", carousel: "carousels", image: "image posts", video: "videos", short: "shorts", text: "posts", link: "link posts" };
// Fewer on-topic posts than this and an analysis is an early read: its
// openings and formats aren't saved as patterns.
export const THIN_BELOW = 10;
// A format is only measured on its own when it has this many posts.
const FOCUS_MIN = 8;
// Posts labelled per analysis, highest engagement first.
const TAG_LIMIT = 320;

const tz = (map, ctx) => TZ_OFFSET[map?.country || ctx?.country] ?? null;

// Posts in the market's language, where the source says which language.
const inLanguage = (p, map) => !p.lang || !map?.language || ["und", "zxx", "qme", "qht", "art"].includes(p.lang) || p.lang === map.language;

const engagementOf = (p) => (p.metrics?.likes || 0) + (p.metrics?.comments || 0) * 2 + (p.metrics?.shares || 0) * 2 + (p.metrics?.views || 0) / 50;

async function labelAndMeasure(posts, { ctx, map, user, handles = [] }) {
  const ranked = [...posts].sort((a, b) => engagementOf(b) - engagementOf(a)).slice(0, TAG_LIMIT);
  const tagged = await tagPosts(ranked, { niche: ctx?.niche, brand: ctx?.name, user });
  // Accounts read directly (or with enough posts here) get their own normal,
  // so "beat" means beat their usual.
  const baselines = {};
  const byAuthor = new Map();
  for (const p of tagged) {
    const key = `${p.platform}:${p.author?.handle}`;
    if (!byAuthor.has(key)) byAuthor.set(key, []);
    byAuthor.get(key).push(p);
  }
  for (const [key, list] of byAuthor) if (list.length >= 6 || handles.some((h) => key.endsWith(`:${h}`))) baselines[key] = baselineFor(list);
  return enrich(tagged, { baselines, tzOffsetMin: tz(map, ctx) });
}

// Instagram's search leans old (reels search: a median of about 7 weeks;
// hashtag pages: months), so "this week" on Instagram is read from the
// niche's active accounts instead: the people behind the best reels found,
// plus the brand's competitors, each account's latest posts.
async function instagramPanel(items, { map, purse, user, signal, max = 8 }) {
  const authors = new Map();
  for (const p of items.filter((x) => x.kind === "post" && x.platform === "instagram")) {
    const h = String(p.author?.handle || "").toLowerCase();
    if (!h) continue;
    authors.set(h, (authors.get(h) || 0) + (p.metrics?.likes || 0) + (p.metrics?.comments || 0) * 2);
  }
  const fromSearch = [...authors.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const rivals = (map?.competitors || []).map((c) => String(c.instagram || "").toLowerCase()).filter(Boolean);
  const panel = [...new Set([...rivals.slice(0, 3), ...fromSearch])].slice(0, max);
  if (!panel.length) return { items: [], sources: [] };
  return collect(panel.map((handle) => ({ cap: "instagram.posts", params: { handle }, group: "instagram", label: "Instagram accounts" })), { purse, user, signal, concurrency: 8 });
}

// What works on a platform for a niche or a topic: a deep sample, labelled
// and measured, with the standout posts. Shape kept for Studio's grounding.
export async function analyzeContent(
  { platform, query, ctx, map = null, days = 30, focus = null, handles = [], limitRows = 15, depth = "standard" },
  { user, signal, purse, onStep = noop } = {}
) {
  map ||= await marketMap(ctx, { user });
  const topic = query ? searchPhrase(query) || String(query).trim() : null;
  const label = `${FORMAT_WORDS[focus] || "posts"} about ${topic || map.terms?.[0] || ctx?.niche || "your niche"} on ${platformLabel(platform)}`;
  onStep({ id: `analyze:${platform}`, label: `Reading recent ${label}`, status: "running" });
  const jobs = postJobs(platform, map, ctx, { days, depth, topic, mode: "top", handles });
  const first = await collect(jobs, { purse, user, signal });
  let items = first.items;
  let sources = first.sources;
  if (platform === "instagram" && days <= 30) {
    const panel = await instagramPanel(items, { map, purse, user, signal, max: depth === "deep" ? 12 : 8 });
    items = dedupe([...items, ...panel.items]);
    sources = [...sources, ...panel.sources];
  }
  let posts = items.filter((p) => p.kind === "post" && p.platform === platform && within(p, days) && !p.paid && inLanguage(p, map));
  let focusApplied = null;
  if (focus) {
    const focused = posts.filter((p) => p.format === focus);
    if (focused.length >= FOCUS_MIN) {
      posts = focused;
      focusApplied = focus;
    }
  }
  if (!posts.length) {
    onStep({ id: `analyze:${platform}`, label: `Found no recent ${label}`, status: "done" });
    return { platform, query: topic || map.terms?.[0], topic, topicFound: false, days, empty: true, focus: null, requestedFocus: focus, summary: summarize([]), rows: [], posts: [], sources, read: sourceSummary([]), sample: isMock() };
  }

  const enriched = await labelAndMeasure(posts, { ctx, map, user, handles });
  // Only on-topic posts are measured. Too few of them and it's an early read.
  const base = enriched.filter((p) => (p.tags?.relevance ?? 3) >= 3);
  const relevance = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const p of enriched) relevance[p.tags?.relevance ?? 3] += 1;
  const thin = base.length < THIN_BELOW;
  const summary = summarize(base, { top: 12 });
  const counts = new Map();
  for (const p of base) counts.set(p.foundBy, (counts.get(p.foundBy) || 0) + 1);
  const queryUsed = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || topic || map.terms?.[0];
  const topicFound = Boolean(topic && base.filter((p) => overlaps(topic, `${p.caption} ${p.tags?.topic || ""}`)).length >= 3);
  const read = sourceSummary(base);
  const accounts = read.platforms[0]?.accounts || 0;
  onStep({ id: `analyze:${platform}`, label: base.length ? `Read ${base.length} ${label} from ${accounts} accounts${thin ? " (an early read)" : ""}` : `Found no recent ${label}`, status: "done" });
  return {
    platform,
    query: queryUsed,
    topic,
    topicFound,
    days,
    focus: focusApplied,
    requestedFocus: focus,
    thin,
    empty: !base.length,
    summary,
    rows: rows(summary.top, limitRows),
    posts: base,
    fetched: items.filter((p) => p.kind === "post" && p.platform === platform).length,
    labelled: enriched.length,
    relevance,
    sources,
    read,
    sample: isMock(),
  };
}

// What a set of posts is about, as themes several accounts share. The
// tagger's topic labels are too specific to match exactly ("cakey makeup fix",
// "makeup that won't cake"), so posts are grouped by the meaning words their
// topics and hashtags share, and each theme is named by its most used phrase.
const GENERIC = new Set("post posts video reel tips tip routine day today new best top guide review reviews thing things way ways people time brand brands business company companies industry market product products beauty".split(" "));
export function themesOf(posts, { exclude = [], min = 2, take = 10 } = {}) {
  const skip = new Set(exclude.flatMap((x) => topicTerms(x)));
  const byWord = new Map();
  for (const p of posts) {
    const words = new Set([...topicTerms(p.tags?.topic || ""), ...(p.hashtags || []).slice(0, 6).flatMap((h) => topicTerms(h))]);
    for (const w of words) {
      if (GENERIC.has(w) || skip.has(w) || w.length < 3) continue;
      if (!byWord.has(w)) byWord.set(w, { word: w, posts: [], accounts: new Set(), heat: 0, phrases: new Map() });
      const b = byWord.get(w);
      b.posts.push(p);
      b.accounts.add(String(p.author?.handle || "").toLowerCase());
      b.heat += p.calc?.heat || 0;
      const phrase = String(p.tags?.topic || "").toLowerCase().trim();
      if (phrase && topicTerms(phrase).includes(w)) b.phrases.set(phrase, (b.phrases.get(phrase) || 0) + 1);
    }
  }
  const themes = [...byWord.values()].filter((b) => b.accounts.size >= min).sort((a, b) => b.accounts.size - a.accounts.size || b.heat - a.heat);
  // A theme whose posts are mostly another, bigger theme's posts is the same theme.
  const kept = [];
  for (const t of themes) {
    const ids = new Set(t.posts.map((p) => p.id));
    if (kept.some((k) => k.posts.filter((p) => ids.has(p.id)).length >= ids.size * 0.7)) continue;
    kept.push(t);
    if (kept.length >= take) break;
  }
  return kept.map((t) => {
    const named = [...t.phrases.entries()].sort((a, b) => b[1] - a[1])[0];
    return { topic: named && named[1] >= 2 ? named[0] : t.word, posts: t.posts.length, accounts: t.accounts.size, heat: t.heat };
  });
}

// What's moving this week on a platform: the hottest new posts, the topics
// and tags they share, the formats, the platform's own trend boards where it
// publishes them, and search interest.
export async function trendingNow({ platform, ctx, map = null, depth = "quick" }, { user, signal, purse, onStep = noop } = {}) {
  map ||= await marketMap(ctx, { user });
  const out = { platform, hashtags: [], sounds: [], interest: [], formats: [], topics: [], hot: [], n: 0, sample: isMock() };
  onStep({ id: `trending:${platform}`, label: `Checking what's moving on ${platformLabel(platform)} this week`, status: "running" });
  const jobs = postJobs(platform, map, ctx, { days: 7, depth, mode: "both" });
  if (platform === "tiktok") {
    const region = TIKTOK_REGIONS.includes(map.country || ctx?.country) ? map.country || ctx.country : "US";
    const industry = industryFor(ctx?.niche);
    // Billed by the number of hashtags asked for: eight is plenty for a week.
    jobs.push({ cap: "tiktok.trending", params: { region, period: 7, limit: 8, ...(industry ? { industry } : {}) } }, { cap: "tiktok.music", params: { scene: 1 } });
    out.region = region;
    out.regionNote = region !== (map.country || ctx?.country) && (map.country || ctx?.country) ? `TikTok publishes no trend board for ${ctx?.region || map.country}, so this is the ${region} board.` : null;
  }
  if (ctx?.keywords?.length) jobs.push({ cap: "google.trends", params: { keywords: (map.terms?.length ? map.terms : ctx.keywords).slice(0, 5), country: map.country || ctx.country || undefined } });
  const first = await collect(jobs, { purse, user, signal });
  let items = first.items;
  let sources = first.sources;
  if (platform === "instagram") {
    const panel = await instagramPanel(items, { map, purse, user, signal });
    items = dedupe([...items, ...panel.items]);
    sources = [...sources, ...panel.sources];
  }

  const fresh = items.filter((p) => p.kind === "post" && p.platform === platform && within(p, 7) && inLanguage(p, map));
  const enriched = fresh.length ? await labelAndMeasure(fresh, { ctx, map, user }) : [];
  const onTopic = enriched.filter((p) => (p.tags?.relevance ?? 3) >= 3);
  out.n = onTopic.length;
  // What's moving has to be moving: posts nobody engaged with (deal spam,
  // reposts) are read but never shown as a trend.
  const deal = (p) => p.tags?.angle === "promotional" && ["buy", "link"].includes(p.tags?.cta);
  const moving = onTopic.filter((p) => !deal(p) && ((p.metrics.likes || 0) + (p.metrics.comments || 0) + (p.metrics.shares || 0) > 2 || (p.metrics.views || 0) >= 300));
  out.moving = moving.length;
  out.hot = rows([...moving].sort((a, b) => (b.calc.heat ?? 0) - (a.calc.heat ?? 0)), 10);
  const s = summarize(moving);
  out.formats = s.formats;
  out.sounds = (s.sounds || []).map((x) => ({ title: x.key, uses: x.n }));
  out.hashtags = topHashtags(moving, 12).map((h) => ({ tag: h.tag, posts: h.n }));
  out.topics = themesOf(moving, { exclude: [...(ctx?.keywords || []), ...(map.terms || [])] });

  // Platform boards.
  const board = items.filter((x) => x.kind === "trend" && x.platform === "tiktok");
  if (board.length) out.hashtags = [...dedupe(board.map((h) => ({ ...h, id: h.tag }))).map((h) => ({ tag: h.tag, views: h.views, posts: h.posts, growthPct: curveGrowth(h.curve), rank: h.rank, board: true })), ...out.hashtags].slice(0, 16);
  const sounds = items.filter((x) => x.kind === "sound");
  if (sounds.length) out.sounds = [...sounds.slice(0, 12).map((x) => ({ title: x.title, author: x.author, uses: x.uses, commercial: x.commercial })), ...out.sounds];
  const trends = items.find((x) => x?.keywords && x?.points);
  out.interest = trendGrowth(trends);
  out.sources = sources;
  onStep({ id: `trending:${platform}`, label: out.n ? `Read ${out.n} posts from this week on ${platformLabel(platform)}` : `Little new on ${platformLabel(platform)} this week`, status: "done" });
  return out;
}

// Posts about something, as found: for "what's been posted about X" and
// "latest launches" questions. Not measured, newest or best first.
export async function searchPosts({ platform, query, ctx, map = null, days = 7, sort = "latest", limit = 20 }, { user, signal, purse, onStep = noop } = {}) {
  map ||= await marketMap(ctx, { user });
  onStep({ id: `search:${platform}:${query}`, label: `Searching ${platformLabel(platform)} for ${query}`, status: "running" });
  const jobs = postJobs(platform, { ...map, terms: [], hashtags: [], xQueries: [], linkedinQueries: [], youtubeQueries: [], tiktokQueries: [], redditQueries: [], subreddits: [] }, { ...ctx, keywords: [] }, { days, depth: "standard", topic: query, mode: sort === "top" ? "top" : "latest" });
  // On X the words are searched as written by the person, OR groups included.
  if (platform === "x") for (const j of jobs) if (j.cap === "x.search" && !/^from:/.test(j.params.q)) j.params.q = xQuery(query, { lang: map.language || "en" });
  const first = await collect(jobs, { purse, user, signal });
  let items = first.items;
  let sources = first.sources;
  if (platform === "instagram" && days <= 14) {
    const panel = await instagramPanel(items, { map: { ...map, competitors: [] }, purse, user, signal, max: 6 });
    // Panel posts count only when they're about the search.
    const words = topicTerms(query);
    items = dedupe([...items, ...panel.items.filter((p) => words.some((w) => String(p.caption || "").toLowerCase().includes(w)))]);
    sources = [...sources, ...panel.sources];
  }
  const posts = items.filter((p) => p.kind === "post" && within(p, days) && inLanguage(p, map));
  const ordered = sort === "top" ? posts.sort((a, b) => engagementOf(b) - engagementOf(a)) : posts.sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")));
  onStep({ id: `search:${platform}:${query}`, label: `Found ${posts.length} ${platformLabel(platform)} posts about ${query}`, status: "done" });
  return { platform, query, days, posts: enrich(ordered.slice(0, limit)), total: posts.length, sources, sample: isMock() };
}

// Fresh news: the paid news search with a real time window, plus the free
// feed for wider coverage, newest first, de-duplicated by headline.
export async function newsFor({ query = null, ctx, map = null, days = 7, depth = "standard" }, { user, signal, purse, onStep = noop } = {}) {
  map ||= await marketMap(ctx, { user });
  const about = query || map.newsQueries?.[0] || ctx?.keywords?.[0];
  onStep({ id: `news:${about}`, label: `Checking the last ${days} days of news about ${about}`, status: "running" });
  const { items, sources } = await collect(newsJobs(map, ctx, { days, topic: query, depth }), { purse, user, signal });
  const found = items
    .filter((a) => a.kind === "article" && within(a, days + 0.5))
    .sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")));
  // A search for the market's words is judged before it is shown. A question's
  // own search (Ask) is read by the model that asked it.
  let articles = found;
  if (!query && found.length) {
    const words = marketWords(ctx, map);
    articles = await marketNews(found, { ctx, map, user, fallback: (xs) => xs.filter((a) => topicTerms(`${a.title} ${a.snippet || ""}`).some((w) => words.has(w))) });
  }
  onStep({ id: `news:${about}`, label: articles.length === found.length ? `Read ${found.length} stories from the last ${days} days` : `Read ${found.length} stories from the last ${days} days; ${articles.length} are about your market`, status: "done" });
  return { query: about, days, items: articles, sources, sample: isMock() };
}

// Ads running now: Meta's library, LinkedIn's library and TikTok's top ads.
// An ad belongs to a brand when its page carries the brand's name (either way
// round: the page "Plum" runs Plum Goodness's ads) or it links to the brand's
// site. Ads that only share words with the name are someone else's.
const flat = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function isTheirAd(ad, { advertiser, website = null }) {
  const name = flat(advertiser);
  const page = flat(ad.advertiser);
  if (name && page.length >= 3 && (page.includes(name) || (page.length >= 4 && name.startsWith(page)))) return true;
  const domain = String(website || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return Boolean(domain) && [ad.domain, ad.link].some((u) => {
    const host = String(u || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
    return host === domain || host.endsWith(`.${domain}`);
  });
}

// A brand's own page in the Meta ad library. The page whose Instagram is
// theirs wins; without one, the best-liked real page (1,000+ likes) carrying
// their name. "Plum" the skincare brand and "Plum" the bank are both verified
// pages called Plum.
export function pickPage(pages, { advertiser, instagram = null }) {
  const ig = flat(instagram);
  const mine = ig ? pages.find((p) => flat(p.instagram) === ig) : null;
  if (mine) return mine;
  return (
    pages
      .filter((p) => (p.likes || 0) >= 1000 && isTheirAd({ advertiser: p.name }, { advertiser }))
      .sort((a, b) => Number(b.verified) - Number(a.verified) || (b.likes || 0) - (a.likes || 0))[0] || null
  );
}

// A search for "Plum Goodness" finds only its small regional pages; its main
// page is called "Plum". So the name's first word is searched as well.
async function brandPage({ advertiser, instagram }, env) {
  const first = String(advertiser).trim().split(/\s+/)[0];
  const queries = [...new Set([advertiser, first.length >= 4 ? first : null].filter(Boolean))];
  const seen = [];
  const sources = [];
  for (const q of queries) {
    const r = await collect([{ cap: "meta.pages", params: { q } }], env);
    seen.push(...r.items.filter((x) => x.kind === "page"));
    sources.push(...r.sources);
    const mine = instagram && seen.find((p) => flat(p.instagram) === flat(instagram));
    if (mine) return { page: mine, sources };
  }
  return { page: pickPage(seen, { advertiser }), sources };
}

export async function adsFor({ query, advertiser = null, website = null, instagram = null, ctx, map = null, platforms = null }, { user, signal, purse, onStep = noop } = {}) {
  map ||= await marketMap(ctx, { user });
  const country = map.country || ctx?.country || null;
  const b2b = ["saas_b2b", "b2b_service", "agency"].includes(map.businessType);
  const want = platforms || ["meta", ...(b2b ? ["linkedin"] : []), ...(TIKTOK_REGIONS.includes(country || "US") && !b2b ? ["tiktok"] : [])];
  const q = advertiser || query || map.terms?.[0] || ctx?.keywords?.[0];
  onStep({ id: `ads:${q}`, label: `Looking at ads running for ${q}`, status: "running" });
  const jobs = [];
  // A brand's ads come from its own page; a market's from a keyword search.
  const found = want.includes("meta") && advertiser ? await brandPage({ advertiser, instagram }, { purse, user, signal }).catch(() => ({ page: null, sources: [] })) : { page: null, sources: [] };
  const page = found.page;
  if (want.includes("meta")) jobs.push(page ? { cap: "meta.pageAds", params: { pageId: page.id, country, limit: 30 } } : { cap: "meta.ads", params: { q, country, active: "active", limit: 30 } });
  if (want.includes("linkedin")) jobs.push({ cap: "linkedin.ads", params: advertiser ? { company: advertiser } : { keyword: q } });
  if (want.includes("tiktok")) jobs.push({ cap: "tiktok.ads", params: { query: q, region: TIKTOK_REGIONS.includes(country) ? country : "US", period: 30, limit: 20 } });
  const { items, sources } = await collect(jobs, { purse, user, signal });
  let ads = items.filter((x) => x.kind === "ad");
  // When none of the ads found are theirs, they run none here: never count another advertiser's ads.
  if (advertiser) ads = ads.filter((a) => (page && a.pageId === page.id) || isTheirAd(a, { advertiser, website }));
  onStep({ id: `ads:${q}`, label: page ? `Found ${ads.length} ads running from ${page.name}'s page` : `Found ${ads.length} ads for ${q}`, status: "done" });
  return { query: q, advertiser, page: page ? { id: page.id, name: page.name, likes: page.likes, instagram: page.instagram } : null, ads, sources: [...found.sources, ...sources], sample: isMock() };
}

// Who is talking about a brand: X, Reddit and the news, newest first.
export async function mentionsOf({ name, handles = {}, ctx, map = null, days = 14 }, { user, signal, purse, onStep = noop } = {}) {
  map ||= await marketMap(ctx, { user });
  const lang = map.language || "en";
  onStep({ id: `mentions:${name}`, label: `Checking who mentions ${name}`, status: "running" });
  const q = /\s/.test(name) ? `"${name}"` : name;
  const not = handles.x ? ` -from:${handles.x}` : "";
  const timeframe = days <= 7 ? "week" : "month";
  // The bare name finds every other meaning of the word too ("minimalist"), so
  // the name is also searched next to the market's own words.
  const niche = [...marketWords(ctx, map)].slice(0, 2);
  // People say "Plum", not "Plum Goodness": a distinctive first word is searched
  // too, always next to the market's words.
  const first = String(name).trim().split(/\s+/)[0];
  const short = /\s/.test(name.trim()) && first.length >= 4 ? first : null;
  const near = niche.length ? ` (${niche.join(" OR ")})` : "";
  const jobs = [
    { cap: "x.search", params: { q: `${q}${not} lang:${lang} -filter:replies`, sort: "Latest" }, pages: 2, group: "x" },
    ...(near ? [{ cap: "x.search", params: { q: `${q}${near}${not} lang:${lang} -filter:replies`, sort: "Latest" }, group: "x" }] : []),
    ...(near && short ? [{ cap: "x.search", params: { q: `${short}${near}${not} lang:${lang} -filter:replies`, sort: "Latest" }, group: "x" }] : []),
    { cap: "reddit.search", params: { q: name, sort: "new", timeframe }, group: "reddit" },
    ...(niche.length ? [{ cap: "reddit.search", params: { q: `${short || name} ${niche[0]}`, sort: "new", timeframe }, group: "reddit" }] : []),
    ...newsJobs(map, ctx, { days, topic: name, depth: "quick" }),
  ];
  const { items, sources } = await collect(jobs, { purse, user, signal });
  const words = topicTerms(name);
  const said = (x) => `${x.caption || ""} ${x.title || ""}`.toLowerCase();
  const inNiche = (x) => niche.some((w) => said(x).includes(w));
  const hasName = (x) => words.every((w) => said(x).includes(w)) || (short && said(x).includes(short.toLowerCase()) && inNiche(x));
  // Those next to the market's words are judged first; a post cross-posted to several places counts once.
  const seen = new Set();
  const named = items
    .filter((x) => within(x, days) && hasName(x))
    .filter((x) => {
      const k = said(x).replace(/\W+/g, " ").trim().slice(0, 120);
      return !seen.has(k) && seen.add(k);
    })
    .sort((a, b) => Number(inNiche(b)) - Number(inNiche(a)));
  // A name match isn't a mention: "minimalist wedding" isn't about Minimalist.
  const about = await brandMentions(named, { name, alias: short, niche: map.summary || ctx?.niche, user, fallback: (xs) => xs });
  onStep({ id: `mentions:${name}`, label: `Found ${about.length} mentions of ${name}`, status: "done" });
  return { name, days, posts: about.filter((x) => x.kind === "post"), articles: about.filter((x) => x.kind === "article"), sources, sample: isMock() };
}

export const _test = { inLanguage, engagementOf, DAY };
