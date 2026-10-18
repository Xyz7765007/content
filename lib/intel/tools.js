import { fetchCap } from "./source";
import { tagPosts } from "./tagger";
import { baselineFor, cadence, curveGrowth, enrich, rows, strength, summarize, topHashtags, trendGrowth } from "./stats";
import { asTag } from "./brand";
import { TIKTOK_REGIONS, industryFor } from "./catalog";
import { platformLabel } from "./taxonomy";
import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS } from "../ai/models";
import { recordUsage } from "../ai/usage";

// The analyses everything else is built from: what works, what's rising, how a
// competitor performs, what the audience asks, which creators fit. Each one
// fetches in parallel, tolerates a source failing, tags and measures the posts,
// narrates its steps through onStep, and spends from a purse that stops new
// calls once its limit is reached.

const DAY = 86400000;

export class Purse {
  constructor(limitUsd = 0.05) {
    this.limit = limitUsd;
    this.spent = 0;
    this.calls = 0;
  }
  add(usd = 0) {
    this.spent += usd;
    this.calls += 1;
  }
  get empty() {
    return this.spent >= this.limit;
  }
}

const noop = () => {};

// Runs data calls in parallel within the purse. Failed calls come back as
// { error } so the rest of an analysis carries on.
async function gather(jobs, { purse, user, signal }) {
  const allowed = purse ? jobs.filter(() => !purse.empty) : jobs;
  const settled = await Promise.allSettled(allowed.map(([name, params]) => fetchCap(name, params, { user, signal })));
  return settled.map((s, i) => {
    if (s.status === "fulfilled") {
      purse?.add(s.value.usd);
      return { name: allowed[i][0], ...s.value };
    }
    return { name: allowed[i][0], error: s.reason?.code || "failed", data: null };
  });
}

const dedupe = (posts) => {
  const seen = new Set();
  return posts.filter((p) => {
    const key = `${p.platform}:${p.id || p.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const within = (p, days) => !p.postedAt || Date.now() - new Date(p.postedAt).getTime() <= days * DAY;

// Words that say nothing about a topic, dropped before searching or matching.
const STOP = new Set("a an and are as at be best by can do does for from get got have how i in into is it its make me my of on or our should so than that the their them then there these this to too us vs was we what when where which who why will with without you your".split(" "));

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

export const overlaps = (a, b) => {
  const x = new Set(topicTerms(a));
  return topicTerms(b).some((w) => x.has(w));
};

// Each job carries the words it searched, so the analysis can say which words
// actually returned posts.
const searchJobs = (platform, words, days) => {
  const [first, second] = words;
  const tagsFor = (w) => {
    const terms = String(w || "").split(/\s+/).filter(Boolean);
    // A phrase as one tag, and its last word on its own: #whitesneakers, #sneakers.
    return terms.length > 1 ? [asTag(terms.join(" ")), asTag(terms[terms.length - 1])] : [asTag(w)];
  };
  switch (platform) {
    case "instagram": {
      const tags = [...new Set([...tagsFor(first), ...(second ? [asTag(second)] : [])].filter(Boolean))].slice(0, 3);
      return tags.map((tag) => ({ cap: "instagram.hashtag", params: { tag }, words: tag === asTag(first) || tagsFor(first).includes(tag) ? first : second }));
    }
    case "tiktok":
      return [first, second].filter(Boolean).map((q) => ({ cap: "tiktok.search", params: { q, limit: 20 }, words: q }));
    case "youtube":
      return [
        { cap: "youtube.search", params: { q: first }, words: first },
        { cap: "youtube.search", params: { q: `${first} shorts` }, words: first },
      ];
    case "x":
      return [{ cap: "x.search", params: { q: `${first} min_faves:20 -filter:replies` }, words: first }];
    case "linkedin":
      return [{ cap: "linkedin.search", params: { q: first, window: days > 7 ? "last-month" : "last-week" }, words: first }];
    default:
      return [];
  }
};

const FORMAT_WORDS = { reel: "reels", carousel: "carousels", image: "image posts", video: "videos", short: "shorts", text: "posts" };
// Fewer on-topic posts than this and an analysis is an early read: its
// openings and formats aren't saved as patterns.
export const THIN_BELOW = 10;
// A format is only measured on its own when it has this many posts.
const FOCUS_MIN = 8;

// What works on a platform for a query: the sample, the patterns and the winners.
export async function analyzeContent(
  { platform, query, ctx, days = 30, focus = null, handles = [], limitRows = 15 },
  { user, signal, purse, onStep = noop } = {}
) {
  const topic = query ? searchPhrase(query) || String(query).trim() : null;
  const words = [topic, ...(ctx?.keywords || [])].filter(Boolean).map((w) => String(w).trim()).filter((w, i, a) => a.indexOf(w) === i);
  const plan = searchJobs(platform, words, days);
  for (const h of handles.slice(0, 3)) {
    if (platform === "instagram") plan.push({ cap: "instagram.posts", params: { handle: h }, words: `@${h}` });
    if (platform === "tiktok") plan.push({ cap: "tiktok.profile", params: { handle: h }, words: `@${h}` });
  }
  const label = `${FORMAT_WORDS[focus] || "posts"} about ${words[0] || ctx?.niche || "your niche"} on ${platformLabel(platform)}`;
  onStep({ id: `analyze:${platform}`, label: `Reading recent ${label}`, status: "running" });
  const results = await gather(plan.map((j) => [j.cap, j.params]), { purse, user, signal });
  results.forEach((r, i) => {
    r.words = plan[i]?.words;
  });

  // TikTok accounts need a second hop: profile, then videos.
  const ttProfiles = results.filter((r) => r.name === "tiktok.profile" && r.data?.secUid);
  if (ttProfiles.length) {
    const more = await gather(ttProfiles.map((r) => ["tiktok.videos", { secUid: r.data.secUid, limit: 20 }]), { purse, user, signal });
    more.forEach((r, i) => {
      r.words = ttProfiles[i].words;
    });
    results.push(...more);
  }

  const tagWords = (r) => (Array.isArray(r.data) ? r.data.filter((p) => p && p.platform).map((p) => ({ ...p, foundBy: r.words })) : []);
  let posts = dedupe(results.flatMap(tagWords));
  posts = posts.filter((p) => within(p, days) && !p.paid);
  let focusApplied = null;
  if (focus) {
    const focused = posts.filter((p) => p.format === focus);
    if (focused.length >= FOCUS_MIN) {
      posts = focused;
      focusApplied = focus;
    }
  }
  const sources = results.map((r) => ({ name: r.name, words: r.words, cached: Boolean(r.cached), error: r.error || null, n: Array.isArray(r.data) ? r.data.length : r.data ? 1 : 0 }));
  if (!posts.length) {
    onStep({ id: `analyze:${platform}`, label: `Found no recent ${label}`, status: "done" });
    return { platform, query: words[0], topicFound: false, days, empty: true, focus: null, requestedFocus: focus, summary: summarize([]), rows: [], posts: [], sources, sample: isMock() };
  }

  const tagged = await tagPosts(posts, { niche: ctx?.niche, brand: ctx?.name, user });
  // Accounts read directly get their own normal, so "beat" means beat their usual.
  const baselines = {};
  const byAuthor = new Map();
  for (const p of tagged) {
    const key = `${p.platform}:${p.author?.handle}`;
    if (!byAuthor.has(key)) byAuthor.set(key, []);
    byAuthor.get(key).push(p);
  }
  for (const [key, list] of byAuthor) if (list.length >= 6) baselines[key] = baselineFor(list);
  const enriched = enrich(tagged, { baselines });
  // Only on-topic posts are measured. Too few of them and it's an early read.
  const base = enriched.filter((p) => (p.tags?.relevance ?? 3) >= 3);
  const thin = base.length < THIN_BELOW;
  const summary = summarize(base);
  // Which words actually brought back the posts that were measured.
  const counts = new Map();
  for (const p of base) counts.set(p.foundBy, (counts.get(p.foundBy) || 0) + 1);
  const queryUsed = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || words[0];
  const topicFound = Boolean(topic && (counts.get(topic) || 0) >= 3);
  onStep({ id: `analyze:${platform}`, label: base.length ? `Read ${base.length} ${label}${thin ? " (an early read)" : ""}` : `Found no recent ${label}`, status: "done" });
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
    sources,
    sample: isMock(),
  };
}

// What's rising right now on a platform for this niche.
export async function trendingNow({ platform, ctx }, { user, signal, purse, onStep = noop } = {}) {
  const out = { platform, hashtags: [], sounds: [], interest: [], formats: [], sample: isMock() };
  onStep({ id: `trending:${platform}`, label: `Checking what's rising on ${platformLabel(platform)}`, status: "running" });
  if (platform === "tiktok") {
    const region = TIKTOK_REGIONS.includes(ctx?.country) ? ctx.country : "US";
    const industry = industryFor(ctx?.niche);
    const r = await gather(
      [
        ["tiktok.trending", { region, period: 7, limit: 3, ...(industry ? { industry } : {}) }],
        ["tiktok.trending", { region, period: 7, limit: 3 }],
        ["tiktok.music", { scene: 1 }],
      ],
      { purse, user, signal }
    );
    const tags = [...(r[0]?.data || []), ...(r[1]?.data || [])];
    out.region = region;
    out.regionNote = region !== ctx?.country && ctx?.country ? `TikTok publishes no trend board for ${ctx.region}, so this is the ${region} board.` : null;
    out.hashtags = dedupe(tags.map((h) => ({ ...h, platform: "tiktok", id: h.tag }))).map((h) => ({ tag: h.tag, views: h.views, posts: h.posts, growthPct: curveGrowth(h.curve), rank: h.rank }));
    out.sounds = (r[2]?.data || []).slice(0, 12).map((s) => ({ title: s.title, author: s.author, uses: s.uses, commercial: s.commercial }));
  } else {
    const a = await analyzeContent({ platform, ctx, days: 7 }, { user, signal, purse });
    out.hashtags = topHashtags(a.posts || [], 10).map((h) => ({ tag: h.tag, posts: h.n }));
    out.sounds = (a.summary?.sounds || []).map((s) => ({ title: s.key, uses: s.n }));
    out.formats = a.summary?.formats || [];
  }
  if (ctx?.keywords?.length) {
    const g = await gather([["google.trends", { keywords: ctx.keywords.slice(0, 5), country: ctx.country || undefined }]], { purse, user, signal });
    out.interest = trendGrowth(g[0]?.data);
  }
  onStep({ id: `trending:${platform}`, label: `Checked what's rising on ${platformLabel(platform)}`, status: "done" });
  return out;
}

// One account: its normal, how often it posts, what it posts, and its breakouts.
export async function accountSnapshot({ platform, handle }, { user, signal, purse, ctx, onStep = noop } = {}) {
  const clean = String(handle || "").replace(/^@/, "").trim();
  onStep({ id: `account:${clean}`, label: `Reading @${clean} on ${platformLabel(platform)}`, status: "running" });
  let profile = null;
  let posts = [];
  if (platform === "instagram") {
    const r = await gather([["instagram.profile", { handle: clean }], ["instagram.posts", { handle: clean }]], { purse, user, signal });
    profile = r[0]?.data;
    posts = r[1]?.data || [];
  } else if (platform === "tiktok") {
    const r = await gather([["tiktok.profile", { handle: clean }]], { purse, user, signal });
    profile = r[0]?.data;
    if (profile?.secUid) posts = (await gather([["tiktok.videos", { secUid: profile.secUid, limit: 20 }]], { purse, user, signal }))[0]?.data || [];
  } else {
    onStep({ id: `account:${clean}`, label: `${platformLabel(platform)} accounts can't be read yet`, status: "done" });
    return { platform, handle: clean, unsupported: true };
  }
  if (!profile && !posts.length) {
    onStep({ id: `account:${clean}`, label: `Couldn't find @${clean}`, status: "error" });
    return { platform, handle: clean, missing: true };
  }
  posts = posts.map((p) => ({ ...p, author: { ...p.author, handle: p.author?.handle || clean, followers: p.author?.followers ?? profile?.followers } }));
  const tagged = await tagPosts(posts, { niche: ctx?.niche, brand: ctx?.name, user });
  const base = baselineFor(tagged);
  const enriched = enrich(tagged, { baselines: { [`${platform}:${clean}`]: base } });
  const summary = summarize(enriched, { top: 5 });
  onStep({ id: `account:${clean}`, label: `Read @${clean}: ${enriched.length} recent posts`, status: "done" });
  return {
    platform,
    handle: clean,
    profile,
    normal: base,
    cadence: cadence(enriched),
    summary,
    breakouts: rows(enriched.filter((p) => (p.calc.beat ?? 0) >= 1.8).sort((a, b) => strength(b) - strength(a)), 5),
    posts: enriched,
    sample: isMock(),
  };
}

const VOICE_SCHEMA = {
  type: "object",
  properties: {
    questions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, lines: { type: "array", items: { type: "integer" } } }, required: ["text", "lines"], additionalProperties: false } },
    pains: { type: "array", items: { type: "object", properties: { text: { type: "string" }, lines: { type: "array", items: { type: "integer" } } }, required: ["text", "lines"], additionalProperties: false } },
    desires: { type: "array", items: { type: "object", properties: { text: { type: "string" }, lines: { type: "array", items: { type: "integer" } } }, required: ["text", "lines"], additionalProperties: false } },
    phrases: { type: "array", items: { type: "string" } },
  },
  required: ["questions", "pains", "desires", "phrases"],
  additionalProperties: false,
};

function ruleVoice(lines) {
  const bucket = (test) => {
    const counts = new Map();
    for (const l of lines.filter(test)) {
      const key = l.replace(/\s+/g, " ").trim().slice(0, 140);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([text, count]) => ({ text, count }));
  };
  return {
    questions: bucket((l) => /\?/.test(l)),
    pains: bucket((l) => /\b(too|can't|cannot|doesn't|didn't|expensive|worst|hate|problem|issue|broke|irritat)/i.test(l) && !/\?/.test(l)),
    desires: bucket((l) => /\b(wish|want|need|love|finally|please make|do one)/i.test(l)),
    phrases: [],
  };
}

// What the audience asks, complains about and wants, in their own words.
export async function audienceVoice({ platform, query, ctx }, { user, signal, purse, onStep = noop } = {}) {
  onStep({ id: "voice", label: `Reading what people ask about ${query || ctx?.niche}`, status: "running" });
  const a = await analyzeContent({ platform, query, ctx, days: 30, limitRows: 5 }, { user, signal, purse });
  // The most discussed posts, leaving out giveaways ("comment to win"), whose
  // comments are entries, not opinions.
  const giveaway = /giveaway|\bwin\b|comment .{0,30}\bto (win|get|enter)\b|tag .{0,20}friends?/i;
  const top = (a.posts || [])
    .filter((p) => !giveaway.test(p.caption || ""))
    .sort((x, y) => (y.metrics.comments || 0) - (x.metrics.comments || 0))
    .slice(0, 3);
  const jobs = [];
  for (const p of top) {
    if (p.platform === "instagram") {
      const code = String(p.url || "").match(/\/(?:p|reel)\/([^/?#]+)/)?.[1];
      if (code) jobs.push(["instagram.comments", { shortcode: code }]);
    }
    if (p.platform === "youtube" && p.id) jobs.push(["youtube.comments", { videoId: p.id }]);
  }
  jobs.push(["reddit.search", { q: query || ctx?.keywords?.[0] || ctx?.niche }]);
  const r = await gather(jobs, { purse, user, signal });
  const comments = r.filter((x) => /comments/.test(x.name)).flatMap((x) => x.data || []);
  const threads = r.find((x) => x.name === "reddit.search")?.data || [];
  const lines = [...comments.map((c) => c.text), ...threads.map((t) => t.title)].filter(Boolean);
  let voice;
  if (isMock() || lines.length < 5) voice = ruleVoice(lines);
  else {
    try {
      const message = await anthropic().messages.create({
        model: MODELS.quick.id,
        max_tokens: 3000,
        output_config: { effort: "low", format: { type: "json_schema", schema: VOICE_SCHEMA } },
        messages: [
          {
            role: "user",
            content: `These are comments and forum titles from people interested in ${ctx?.niche || query}. Group them.
- questions: the questions people ask, merged when they mean the same thing, with the numbers of every line that asks it
- pains: complaints and frustrations, merged, with the numbers of every line that says it
- desires: what people want or wish for, merged, with the numbers of every line that says it
- phrases: up to 10 short phrases in the audience's own words worth reusing in content
Use only what is below. Keep each item under 15 words.

${lines.slice(0, 160).map((l, i) => `${i + 1}. ${String(l).replace(/\s+/g, " ").slice(0, 200)}`).join("\n")}`,
          },
        ],
      });
      await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind: "voice", model: message.model, usage: message.usage });
      // Counts come from the line numbers the model cited, counted here.
      const parsed = JSON.parse(textOf(message) || "{}");
      const counted = (items) =>
        (items || [])
          .map((it) => ({ text: it.text, count: new Set((it.lines || []).filter((n) => Number.isInteger(n) && n >= 1 && n <= Math.min(160, lines.length))).size }))
          .filter((it) => it.count > 0)
          .sort((x, y) => y.count - x.count);
      voice = { questions: counted(parsed.questions), pains: counted(parsed.pains), desires: counted(parsed.desires), phrases: (parsed.phrases || []).slice(0, 10) };
    } catch {
      voice = ruleVoice(lines);
    }
  }
  onStep({ id: "voice", label: `Read ${lines.length} comments and threads`, status: "done" });
  return { platform, query: query || ctx?.niche, read: lines.length, ...voice, threads: threads.slice(0, 5), sample: isMock() };
}

export async function adsFor({ query }, { user, signal, purse, onStep = noop } = {}) {
  onStep({ id: "ads", label: `Looking at ads running for ${query}`, status: "running" });
  const r = await gather([["tiktok.ads", { query, period: 30, limit: 10 }]], { purse, user, signal });
  const ads = r[0]?.data || [];
  onStep({ id: "ads", label: `Found ${ads.length} ads for ${query}`, status: "done" });
  return { query, ads, sample: isMock() };
}

export async function newsFor({ query, ctx }, { user, signal, purse, onStep = noop } = {}) {
  onStep({ id: "news", label: `Checking news about ${query}`, status: "running" });
  const r = await gather([["google.news", { q: query, country: ctx?.country || undefined, limit: 10 }]], { purse, user, signal });
  const items = (r[0]?.data || []).filter((n) => !n.postedAt || Date.now() - new Date(n.postedAt).getTime() < 21 * DAY);
  onStep({ id: "news", label: `Read ${items.length} recent stories`, status: "done" });
  return { query, items, sample: isMock() };
}

const COUNTRY_NAMES = { IN: "India", US: "United States", GB: "United Kingdom", AE: "United Arab Emirates", AU: "Australia", SG: "Singapore", CA: "Canada", DE: "Germany", FR: "France" };

// Creators who fit the niche: found, checked on their recent posts, ranked.
export async function findCreators({ platform = "instagram", keywords = [], followers = {}, ctx, limit = 30 }, { user, signal, purse, onStep = noop } = {}) {
  const words = (keywords.length ? keywords : ctx?.keywords || []).map((w) => String(w).split(" ")[0].toLowerCase()).filter(Boolean).slice(0, 4);
  onStep({ id: "creators", label: `Searching ${platformLabel(platform)} creators in ${words.join(", ")}`, status: "running" });
  const filters = {
    keywords_in_bio: words,
    number_of_followers: { min: followers.min ?? 5000, max: followers.max ?? 250000 },
  };
  if (ctx?.country && COUNTRY_NAMES[ctx.country]) filters.location = [COUNTRY_NAMES[ctx.country]];
  const r = await gather([["creators.search", { platform, filters, limit }]], { purse, user, signal });
  if (r[0]?.error) {
    onStep({ id: "creators", label: "Creator search is unavailable right now", status: "error" });
    return { platform, creators: [], error: r[0].error, sample: isMock() };
  }
  const found = (r[0]?.data || []).filter((c) => c.handle);
  onStep({ id: "creators", label: `Found ${found.length} creators. Checking their recent posts`, status: "running" });
  const checked = [];
  const toCheck = found.slice(0, 20);
  if (platform === "instagram") {
    const posts = await gather(toCheck.map((c) => ["instagram.posts", { handle: c.handle }]), { purse, user, signal });
    for (let i = 0; i < toCheck.length; i++) {
      const c = toCheck[i];
      const list = posts[i]?.data || [];
      const tagged = list.length ? await tagPosts(list, { niche: ctx?.niche, brand: ctx?.name, user }) : [];
      const last = list.map((p) => p.postedAt).filter(Boolean).sort().pop() || null;
      const rel = tagged.length ? tagged.reduce((s, p) => s + (p.tags?.relevance || 3), 0) / tagged.length : null;
      const avgEng = list.length ? list.reduce((s, p) => s + (p.metrics.likes || 0) + (p.metrics.comments || 0), 0) / list.length : null;
      const er = c.engagement ?? (avgEng && c.followers ? Math.round((avgEng / c.followers) * 1000) / 10 : null);
      const daysQuiet = last ? Math.round((Date.now() - new Date(last).getTime()) / DAY) : null;
      const fit = Math.round(
        Math.min(100, (rel ? (rel / 5) * 50 : 25) + Math.min(30, (er || 0) * 6) + (daysQuiet == null ? 5 : daysQuiet <= 7 ? 20 : daysQuiet <= 30 ? 10 : 0))
      );
      checked.push({ ...c, engagement: er, relevance: rel ? Math.round(rel * 10) / 10 : null, lastPost: last, daysQuiet, fit, recent: rows(enrich(tagged), 3) });
    }
  }
  const rest = found.slice(20).map((c) => ({ ...c, fit: null }));
  const ranked = [...checked.sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0)), ...rest];
  onStep({ id: "creators", label: `Ranked ${ranked.length} creators by fit`, status: "done" });
  return { platform, creators: ranked, sample: isMock() };
}

export async function creatorContact({ handle }, { user, signal } = {}) {
  const r = await fetchCap("instagram.contact", { handle: String(handle).replace(/^@/, "") }, { user, signal });
  return r.data;
}
