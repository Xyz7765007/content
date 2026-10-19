import { collect, within } from "./collect";
import { marketMap, platformsFor } from "./market";
import { postJobs } from "./plan";
import { reviewsFor } from "./reviews";
import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS } from "../ai/models";
import { recordUsage } from "../ai/usage";

// What buyers ask, complain about, want and object to, in their own words,
// counted. Where it listens depends on the market: forums and Q&A for most,
// reviews where buyers review (Amazon for products, Google for local places,
// Trustpilot for services), comment sections on the platforms the market
// uses, professional threads for B2B. Two steps: find the conversations,
// then read the busiest ones in full.

const noop = () => {};
const MAX_LINES = 420;
const GIVEAWAY = /giveaway|\bwin\b|comment .{0,30}\bto (win|get|enter)\b|tag .{0,20}friends?/i;

const item = { type: "object", properties: { text: { type: "string" }, lines: { type: "array", items: { type: "integer" } } }, required: ["text", "lines"], additionalProperties: false };
const SCHEMA = {
  type: "object",
  properties: {
    questions: { type: "array", items: item },
    pains: { type: "array", items: item },
    desires: { type: "array", items: item },
    objections: { type: "array", items: item },
    phrases: { type: "array", items: { type: "string" } },
  },
  required: ["questions", "pains", "desires", "objections", "phrases"],
  additionalProperties: false,
};

function ruleVoice(lines) {
  const bucket = (test) => {
    const counts = new Map();
    for (const [i, l] of lines.entries()) {
      if (!test(l.text)) continue;
      const key = l.text.replace(/\s+/g, " ").trim().slice(0, 140);
      if (!counts.has(key)) counts.set(key, []);
      counts.get(key).push(i + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6).map(([text, at]) => ({ text, lines: at }));
  };
  return {
    questions: bucket((l) => /\?/.test(l)),
    pains: bucket((l) => /\b(too|can't|cannot|doesn't|didn't|expensive|worst|hate|problem|issue|broke|irritat|breakout|waste)/i.test(l) && !/\?/.test(l)),
    desires: bucket((l) => /\b(wish|want|need|love|finally|please make|looking for|recommend)/i.test(l)),
    objections: bucket((l) => /\b(but|worth it|scam|fake|overpriced|not sure|doubt)\b/i.test(l)),
    phrases: [],
  };
}

const sourceName = (x) => (x.kind === "review" ? x.source : x.platform === "reddit" ? "Reddit" : x.platform === "x" ? "X" : x.platform === "youtube" ? "YouTube" : x.platform === "instagram" ? "Instagram" : x.platform === "tiktok" ? "TikTok" : x.platform === "linkedin" ? "LinkedIn" : "Web");

export async function audienceVoice({ query = null, ctx, map = null, platform = null, days = 365 }, { user, signal, purse, onStep = noop } = {}) {
  map ||= await marketMap(ctx, { user });
  const about = query || map.voiceQueries?.[0] || map.terms?.[0] || ctx?.niche;
  onStep({ id: "voice", label: `Finding where people talk about ${about}`, status: "running" });
  const b2b = ["saas_b2b", "b2b_service", "agency"].includes(map.businessType);
  const places = platformsFor(map, { include: [platform, "reddit"].filter(Boolean), max: 5 });
  const topic = query || null;

  // Step 1: the conversations.
  const jobs = [];
  for (const p of places) {
    if (p === "reddit") {
      for (const q of [...new Set([topic, ...(map.voiceQueries || []).slice(0, 2), ...(map.redditQueries || []).slice(0, 1)].filter(Boolean))].slice(0, 3)) jobs.push({ cap: "reddit.search", params: { q, sort: "top", timeframe: "year" }, group: "reddit" });
      for (const s of (map.subreddits || []).slice(0, 3)) jobs.push({ cap: "reddit.search", params: { q: `subreddit:${s} ${topic || map.terms?.[0] || ""}`.trim(), sort: "top", timeframe: "year" }, group: "reddit" });
    } else if (p === "youtube") {
      jobs.push({ cap: "youtube.search", params: { q: `${about} review` }, group: "youtube" }, { cap: "youtube.search", params: { q: topic || map.youtubeQueries?.[0] || about }, group: "youtube" });
    } else if (p === "x") {
      jobs.push({ cap: "x.search", params: { q: `${(topic || map.terms?.[0] || about).split(/\s+/).slice(0, 3).join(" ")} ? lang:${map.language || "en"} -filter:replies`, sort: "Top" }, pages: 2, group: "x" });
    } else if (p === "linkedin" && b2b) {
      jobs.push(...postJobs("linkedin", map, ctx, { days: 30, depth: "quick", topic, mode: "top" }));
    } else if (p === "instagram" || p === "tiktok") {
      jobs.push(...postJobs(p, { ...map, hashtags: [] }, ctx, { days: 60, depth: "quick", topic, mode: "top" }).slice(0, 2));
    }
  }
  const competitors = (map.competitors || []).slice(0, 2);
  const [found, reviews] = await Promise.all([
    collect(jobs, { purse, user, signal }),
    (map.reviewSources || []).length
      ? Promise.all(
          [{ name: topic || map.terms?.[0], amazonQuery: map.voiceQueries?.[0] || map.terms?.[0] }, ...competitors.map((c) => ({ name: c.name, brand: true, domain: c.website, amazonQuery: c.amazonQuery || c.name }))]
            .slice(0, 3)
            .map((target) => reviewsFor({ target, ctx, map }, { user, signal, purse }).catch(() => ({ reviews: [], sources: [] })))
        )
      : Promise.resolve([]),
  ]);
  const posts = found.items.filter((x) => x.kind === "post" && within(x, days) && !GIVEAWAY.test(x.caption || ""));

  // Step 2: the busiest conversations, read in full.
  const busiest = (platformId, n) => posts.filter((x) => x.platform === platformId).sort((a, b) => (b.metrics.comments || 0) - (a.metrics.comments || 0)).slice(0, n);
  const deep = [];
  for (const t of busiest("reddit", 5)) deep.push({ cap: "reddit.comments", params: { postId: t.id, url: t.url } });
  for (const v of busiest("youtube", 3)) if (v.id) deep.push({ cap: "youtube.comments", params: { videoId: v.id } });
  for (const r of busiest("instagram", 2)) {
    const code = String(r.url || "").match(/\/(?:p|reel)\/([^/?#]+)/)?.[1];
    if (code) deep.push({ cap: "instagram.comments", params: { shortcode: code, url: r.url } });
  }
  for (const v of busiest("tiktok", 2)) if (v.id) deep.push({ cap: "tiktok.comments", params: { videoId: v.id, url: v.url } });
  // Each conversation's link travels with it, so every line read from it can link back.
  for (const x of busiest("x", 2)) if (x.id) deep.push({ cap: "x.replies", params: { tweetId: x.id, url: x.url } });
  for (const l of busiest("linkedin", 2)) if (l.id) deep.push({ cap: "linkedin.comments", params: { postId: l.id, url: l.url } });
  onStep({ id: "voice", label: `Reading ${deep.length} of the busiest conversations`, status: "running" });
  const read = deep.length ? await collect(deep, { purse, user, signal }) : { items: [], sources: [] };

  const comments = read.items.filter((x) => x.kind === "comment" && String(x.text).length > 12);
  const reviewItems = reviews.flatMap((r) => r.reviews || []);
  const products = reviews.flatMap((r) => r.products || []);
  const lines = [
    ...posts.filter((x) => x.platform === "reddit" || x.platform === "x").map((x) => ({ text: x.platform === "reddit" ? `${x.title || ""}${x.caption && x.caption !== x.title ? ` — ${String(x.caption).replace(x.title || "", "").slice(0, 200)}` : ""}` : x.caption, src: sourceName(x), url: x.url })),
    ...comments.map((c) => ({ text: c.text, src: sourceName(c), url: c.url || (c.on && /^https?:/.test(c.on) ? c.on : null) })),
    ...reviewItems.map((r) => ({ text: `${r.rating ? `${r.rating}★ ` : ""}${r.title ? `${r.title}: ` : ""}${r.text}`, src: r.source, url: r.url })),
  ]
    .map((l) => ({ ...l, text: String(l.text || "").replace(/\s+/g, " ").trim().slice(0, 240) }))
    .filter((l) => l.text.length > 12)
    .slice(0, MAX_LINES);

  let voice;
  if (isMock() || lines.length < 8) voice = ruleVoice(lines);
  else {
    try {
      const message = await anthropic().messages.create({
        model: MODELS.quick.id,
        max_tokens: 6000,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [
          {
            role: "user",
            content: `These are forum threads, comments and reviews from people in this market: ${ctx?.niche || about}${map.country ? ` (${map.country})` : ""}. Group what they say.
- questions: what people ask, merged when they mean the same thing, with the numbers of every line that asks it
- pains: complaints and frustrations, merged, with every line number that says it
- desires: what people want, wish for or recommend, merged, with every line number
- objections: doubts and reasons not to buy (price, trust, results), merged, with every line number
- phrases: up to 12 short phrases in the audience's own words worth reusing in content
Use only what is below. Keep each item under 15 words, in plain words. Ignore spam, jokes and lines unrelated to the market.

${lines.map((l, i) => `${i + 1}. [${l.src}] ${l.text}`).join("\n")}`,
          },
        ],
      });
      await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind: "voice", model: message.model, usage: message.usage });
      voice = JSON.parse(textOf(message) || "{}");
    } catch (err) {
      if (signal?.aborted) throw err;
      voice = ruleVoice(lines);
    }
  }

  // Counts come from the cited line numbers, counted here, with where they came from.
  const counted = (items) =>
    (items || [])
      .map((it) => {
        const at = [...new Set((it.lines || []).filter((n) => Number.isInteger(n) && n >= 1 && n <= lines.length))];
        const from = {};
        for (const n of at) from[lines[n - 1].src] = (from[lines[n - 1].src] || 0) + 1;
        // Up to three of the lines it stands for, each linking to where it was said.
        const examples = [];
        const seen = new Set();
        for (const l of at.map((n) => lines[n - 1])) {
          if (!l.url || seen.has(l.url)) continue;
          seen.add(l.url);
          examples.push({ text: l.text.slice(0, 160), url: l.url, src: l.src });
          if (examples.length === 3) break;
        }
        return { text: String(it.text || "").slice(0, 140), count: at.length, from, example: examples[0] || null, examples };
      })
      .filter((it) => it.text && it.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

  const bySource = {};
  for (const l of lines) bySource[l.src] = (bySource[l.src] || 0) + 1;
  const threads = posts
    .filter((x) => x.platform === "reddit")
    .sort((a, b) => (b.metrics.comments || 0) - (a.metrics.comments || 0))
    .slice(0, 6)
    .map((t) => ({ title: t.title, url: t.url, where: t.where, comments: t.metrics.comments, score: t.metrics.likes }));
  const ratings = reviewItems.filter((r) => r.rating != null);
  onStep({ id: "voice", label: `Read ${lines.length} comments, threads and reviews`, status: "done" });
  return {
    platform: platform || "mixed",
    query: about,
    read: lines.length,
    bySource,
    questions: counted(voice.questions),
    pains: counted(voice.pains),
    desires: counted(voice.desires),
    objections: counted(voice.objections),
    phrases: (voice.phrases || []).map((p) => String(p).slice(0, 80)).slice(0, 12),
    threads,
    reviews: ratings.length ? { count: ratings.length, average: Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10, low: reviewItems.filter((r) => r.rating != null && r.rating <= 2).slice(0, 4).map((r) => ({ text: r.text.slice(0, 200), source: r.source, url: r.url })) } : null,
    products: products.slice(0, 6).map((p) => ({ title: p.title, rating: p.rating, reviews: p.reviews, price: p.price, url: p.url })),
    sources: [...found.sources, ...read.sources, ...reviews.flatMap((r) => r.sources || [])],
    sample: isMock(),
  };
}
