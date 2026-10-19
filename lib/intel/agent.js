import { anthropic, isMock } from "../ai/client";
import { MODELS, SONNET_FALLBACK } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { fail } from "../ai/errors";
import { PRICES } from "../plans";
import { brandBrief } from "./brand";
import { Purse, accountSnapshot, adsFor, analyzeContent, audienceVoice, mentionsOf, newsFor, overlaps, resolveCompetitor, reviewsFor, searchPosts, trendingNow } from "./tools";
import { getSupabaseAdmin } from "../supabase/server";
import { reportLabel } from "./kinds";
import { fetchCap } from "./source";
import { rows, trendGrowth } from "./stats";
import { groupRow, solid, r1, pct } from "./groups";
import { marketMap, countryName, RESEARCH_PLATFORMS } from "./market";
import {
  ageDays,
  findingsFromAccount,
  findingsFromAnalysis,
  findingsFromTrending,
  findingsFromVoice,
  latestOnly,
  queryFindings,
  saveFindings,
} from "./findings";
import { formatLabel, hookLabel, platformLabel } from "./taxonomy";
import { PLATFORM_IDS } from "./brand";

export { solid } from "./groups";

// Ask: one question, answered from fresh, real data. Sonnet 5.5 works as the
// analyst with the tools below and plans its calls (news, every platform's
// search, accounts, comments, reviews, ads, the web), runs them in parallel,
// and writes once at the end. The stand-in routes the question to the same
// tools by keywords and writes the answer from what they return, so every
// part of the pipeline runs in QA without a model.

export const MAX_CALLS = 12;
export const DATA_BUDGET_USD = 0.1;

const SEARCHABLE = ["instagram", "tiktok", "youtube", "x", "linkedin", "reddit"];
const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

export const compactAnalysis = (a) => ({
  platform: a.platform,
  searchedFor: a.query,
  topicFound: a.topic ? Boolean(a.topicFound) : undefined,
  days: a.days,
  format: a.focus || (a.requestedFocus ? `mixed (too few ${a.requestedFocus} posts to measure on their own)` : "all"),
  posts: a.summary?.n || 0,
  accounts: a.read?.platforms?.[0]?.accounts ?? null,
  earlyRead: a.thin ? "Fewer than 10 on-topic posts: treat everything here as an early read" : undefined,
  medianEngagementPct: a.summary?.medianErPct ?? null,
  medianViews: a.summary?.medianViews ?? null,
  formats: solid(a.summary?.formats, 4).map((g) => groupRow(g, "format")),
  hooks: solid(a.summary?.hooks, 5).map((g) => groupRow(g, "hook")),
  lengths: solid(a.summary?.lengths, 4).map((g) => groupRow(g, "length")),
  postingTimes: solid(a.summary?.times, 3).map((g) => groupRow(g, "time")),
  sounds: (a.summary?.sounds || []).slice(0, 3).map((g) => g.key),
  hashtags: (a.summary?.hashtags || []).slice(0, 8).map((h) => h.tag),
  topPosts: rows(a.summary?.top || [], 8),
  note: a.empty ? "No recent posts found for this search." : undefined,
});

const postRow = (p) => ({
  date: day(p.postedAt),
  platform: p.platform,
  author: p.author?.handle ? `${p.platform === "reddit" ? "u/" : "@"}${p.author.handle}` : p.author?.name || null,
  name: p.author?.name && p.author.name !== p.author.handle ? p.author.name : undefined,
  followers: p.author?.followers ?? undefined,
  where: p.where || undefined,
  text: clip(p.caption, 200),
  url: p.url,
  likes: p.metrics?.likes ?? undefined,
  comments: p.metrics?.comments ?? undefined,
  views: p.metrics?.views ?? undefined,
});

const PLATFORM_ENUM = { type: "string", enum: SEARCHABLE };
// A platform the market map says this market doesn't use (and the brand
// doesn't post on) isn't worth a call.
const skipped = (map, platform, ctx) => !ctx.platforms.includes(platform) && (map?.platforms || []).some((p) => p.id === platform && p.fit === "skip");

export const TOOLS = [
  {
    name: "recall",
    description: "What you already know about this brand's market from earlier research, newest first, each fact with its age in days, plus deep reports run in the last 14 days. Free and instant. Use it for 'what works' and 'what do we know' questions, not for news.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: [...PLATFORM_IDS, "google"] },
        kind: { type: "string", enum: ["format", "hook", "length", "sound", "hashtag", "examples", "trend", "interest", "competitor", "audience"] },
        topic: { type: "string", description: "Words the facts should be about. Empty for everything." },
      },
    },
  },
  {
    name: "search_news",
    description: "News articles from the last N days for a search, newest first, with dates, sources and links. Region-aware. Use short searches (2 to 6 words) with the region name for local markets, e.g. 'beauty brand launch India'. Call it several times in parallel for different angles (launch, collaboration, campaign, funding).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        days: { type: "integer", minimum: 1, maximum: 30, description: "How far back. Default 14." },
        country: { type: "string", description: "Two-letter market code, e.g. IN. Defaults to the brand's market." },
      },
      required: ["query"],
    },
  },
  {
    name: "search_posts",
    description: "Posts on one platform matching a search, from the last N days, newest or best first, with authors, dates, numbers and links. Brands announce launches and collaborations on their own accounts, so this finds what news misses. On X, OR groups and quotes work: '(launch OR collab) (skincare OR makeup) India'. On Reddit it searches all communities.",
    input_schema: {
      type: "object",
      properties: {
        platform: PLATFORM_ENUM,
        query: { type: "string", description: "Short search, the words people would use on that platform." },
        days: { type: "integer", minimum: 1, maximum: 30, description: "Default 14. X reaches back about 7 days." },
        sort: { type: "string", enum: ["latest", "top"] },
      },
      required: ["platform", "query"],
    },
  },
  {
    name: "read_account",
    description: "One account's recent posts and performance: size, how often it posts, its normal reach, what breaks out, and its latest posts with links. Give a handle, an @handle or a profile link; for a brand you only know by name, give the name and the platform.",
    input_schema: {
      type: "object",
      properties: { platform: { type: "string", enum: ["instagram", "tiktok", "youtube", "x", "linkedin", "facebook"] }, account: { type: "string" }, name: { type: "string" } },
      required: ["platform", "account"],
    },
  },
  {
    name: "read_comments",
    description: "The comments or replies on one post (Instagram, TikTok, YouTube, X, Reddit or LinkedIn), from its link: what people say about it.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  {
    name: "read_reviews",
    description: "What buyers say in reviews of a brand or product: Trustpilot by website, Google reviews for places, Amazon ratings for products.",
    input_schema: { type: "object", properties: { name: { type: "string" }, brand: { type: "boolean", description: "true when name is a brand or company, so only its own listings and places count" }, website: { type: "string" }, product: { type: "string", description: "How to find the product on Amazon" } }, required: ["name"] },
  },
  {
    name: "web_search",
    description: "A web search for facts that aren't news or social posts: a company's site, who owns a brand, what a product is.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "measure_content",
    description: "Reads a deep sample of recent posts on one platform for a topic and measures what works: formats, openings, lengths, posting times, sounds, hashtags, with sample sizes and the standout posts. reach = how many times a typical post a group gets.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: PLATFORM_IDS },
        query: { type: "string", description: "Topic, 1 to 3 words. Empty for the brand's niche." },
        days: { type: "integer", enum: [7, 14, 30] },
        format: { type: "string", enum: ["reel", "carousel", "image", "video", "short", "text"] },
      },
      required: ["platform"],
    },
  },
  {
    name: "whats_trending",
    description: "What's moving this week on one platform for this market: the topics most accounts are posting about, the posts taking off, hashtags, sounds (with whether brand accounts may use them) and search interest.",
    input_schema: { type: "object", properties: { platform: PLATFORM_ENUM }, required: ["platform"] },
  },
  {
    name: "search_interest",
    description: "Google search interest over the last year for up to 5 keywords in the brand's market, with growth over the last 4 weeks.",
    input_schema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, maxItems: 5 } }, required: ["keywords"] },
  },
  {
    name: "ads_running",
    description: "Ads running now in the Meta (Facebook and Instagram) and LinkedIn ad libraries, and TikTok's top ads: for a topic, or for one advertiser by name.",
    input_schema: { type: "object", properties: { query: { type: "string" }, advertiser: { type: "string" } } },
  },
  {
    name: "mentions",
    description: "Who is talking about a brand in the last N days: posts on X and Reddit and news articles that name it.",
    input_schema: { type: "object", properties: { name: { type: "string" }, days: { type: "integer", minimum: 1, maximum: 30 } }, required: ["name"] },
  },
  {
    name: "audience_voice",
    description: "What buyers in this market ask, complain about, want and object to, from forums, comments and reviews, counted, with their own phrases.",
    input_schema: { type: "object", properties: { query: { type: "string" } } },
  },
  {
    name: "propose",
    description: "Offer a deep piece of work this question really needs. The person sees a button with its price and decides. kinds: trends (trend radar), playbook (what works, formula by formula), competitors (several competitors compared across platforms, ads and reviews), audience (full audience voice), creators (creator shortlist with contacts).",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["trends", "playbook", "competitors", "audience", "creators"] },
        platform: { type: "string", enum: [...PLATFORM_IDS, "reddit", "all"] },
        format: { type: "string", enum: ["reel", "carousel", "image", "video", "short", "text"], description: "Playbook only: one format to focus on" },
        topic: { type: "string", description: "What it should be about, one to three words" },
        handles: { type: "array", items: { type: "string" }, description: "Competitors: names, handles or links" },
        reason: { type: "string", description: "One sentence: what it will give them" },
      },
      required: ["kind", "reason"],
    },
  },
];

export const PROPOSAL_PRICE = { trends: PRICES.report, playbook: PRICES.report, competitors: PRICES.report, audience: PRICES.report, creators: PRICES.creators };

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const system = (ctx, map) => {
  const now = new Date();
  const place = countryName(map?.country || ctx.country);
  const where = (map?.platforms || []).filter((p) => p.fit !== "skip").map((p) => `${platformLabel(p.id)} (${p.fit})`).join(", ");
  return `You are Huesy, a market intelligence analyst for one brand. You answer questions about its market with fresh, real data from the news and from social platforms, and you say what it means for them.

Today is ${WEEKDAY[now.getUTCDay()]}, ${now.toISOString().slice(0, 10)}.

${brandBrief(ctx)}
Market: ${map?.summary || ctx.niche}${place ? `, mainly ${place}` : ""}.
Where this market talks: ${where || ctx.platforms.join(", ")}.
${map?.competitors?.length ? `Competitors: ${map.competitors.map((c) => c.name).filter(Boolean).slice(0, 8).join(", ")}.` : ""}
${map?.subreddits?.length ? `Communities: ${map.subreddits.map((s) => `r/${s}`).join(", ")}.` : ""}
${map?.notes ? `Notes: ${map.notes}` : ""}

How you work:
- Get real data before saying anything about the market, news, trends, competitors, audiences, creators or performance. Never invent facts, numbers, posts, dates or links. If a search finds nothing, say so plainly.
- Plan, then call every tool you need in parallel in one turn. Add a second round only to fill a gap the first left.
- News, launches, collaborations, campaigns, announcements, anything "latest", "recent" or "this week": always call search_news (two or three angles, in parallel) and search_posts on the platforms where this market talks (for example X and Instagram, plus LinkedIn for business news), with days matching the window the question implies (default 14). Use the market's own words and region. Report only items dated inside the window, each with its date and link, newest first; drop anything older or undated that you can't place. Never present older items as recent.
- "What works" questions: recall first; if what you know is older than 30 days or thin, measure_content.
- Trends: whats_trending on the market's main platforms, plus search_news.
- A competitor or brand: read_account on the platforms it uses (handle or name), mentions, and ads_running or read_reviews when relevant.
- What buyers think: audience_voice, read_reviews, or search_posts on reddit.
- You may make at most ${MAX_CALLS} data calls per question. When it needs a full report (a playbook, several competitors compared, a full audience read, a creator shortlist, a trend radar), answer what you can and call propose.
- Do not write anything before or between tool calls. Write once, at the end.
- Answer: lead with the answer in one or two sentences. Then the items, each with what happened, who, the date and the link. Then "What it means for ${ctx.name}" with two or three concrete moves. Under 300 words unless asked for more. Plain words, no hype, markdown links.
- Numbers: reach is how many times a typical post a group gets; always give sample sizes as posts and accounts. A group marked earlySign is seen in fewer than five accounts: call it an early sign. An analysis marked earlyRead is thin: say so.
- When you use something you already knew (recall), say how old it is. If a recent deep report covers the question, point to it by name (it's in Insights).
- Never name data providers, APIs or tools, and never describe how data was collected beyond "I read 24 recent reels" or "I checked the last two weeks of news".
- If the question has nothing to do with marketing, content or their market, say in one line what you can help with.`;
};

// Deep reports from the last two weeks, so the analyst can point to one.
async function recentReports(user) {
  const admin = getSupabaseAdmin();
  if (!admin || user?.id === "local") return [];
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data } = await admin
    .from("intel_reports")
    .select("kind, title, created_at")
    .eq("user_id", user.id)
    .eq("status", "ready")
    .neq("kind", "briefing")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(8);
  return (data || []).map((r) => ({ kind: reportLabel(r.kind), title: r.title, ageDays: Math.round((Date.now() - new Date(r.created_at).getTime()) / 86400000) }));
}

// Whether a data tool's answer had anything in it. A question whose every data
// call came back empty (and with nothing already known) is refunded.
const hasData = (name, out) => {
  switch (name) {
    case "search_news":
      return Boolean(out.stories?.length);
    case "search_posts":
      return Boolean(out.posts?.length);
    case "read_account":
      return !out.note;
    case "read_comments":
      return Boolean(out.comments?.length);
    case "read_reviews":
      return Boolean(out.reviews || out.products?.length);
    case "web_search":
      return Boolean(out.results?.length);
    case "measure_content":
      return out.posts > 0;
    case "whats_trending":
      return Boolean(out.postsThisWeek || out.hashtags?.length || out.sounds?.length || out.searchInterest?.length);
    case "search_interest":
      return Boolean(out.keywords?.length);
    case "ads_running":
      return Boolean(out.ads?.length);
    case "mentions":
      return Boolean(out.posts?.length || out.articles?.length);
    case "audience_voice":
      return out.read > 0;
    default:
      return false;
  }
};
const FREE_TOOLS = ["recall", "propose"];

async function execTool(name, input, env) {
  if (FREE_TOOLS.includes(name)) return runTool(name, input, env);
  env.collected.attempted += 1;
  const out = await runTool(name, input, env);
  if (hasData(name, out)) env.collected.useful += 1;
  return out;
}

// Where a link points: the platform and the id each comments call needs.
function postFromUrl(url) {
  const u = String(url || "");
  let m;
  if ((m = u.match(/instagram\.com\/(?:p|reel|reels)\/([^/?#]+)/))) return { platform: "instagram", cap: "instagram.comments", params: { shortcode: m[1], url: u } };
  if ((m = u.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/))) return { platform: "tiktok", cap: "tiktok.comments", params: { videoId: m[1], url: u } };
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/))) return { platform: "youtube", cap: "youtube.comments", params: { videoId: m[1] } };
  if ((m = u.match(/(?:x|twitter)\.com\/(?:[^/]+|i\/web)\/status\/(\d+)/))) return { platform: "x", cap: "x.replies", params: { tweetId: m[1] } };
  if ((m = u.match(/reddit\.com\/r\/[^/]+\/comments\/(\w+)/))) return { platform: "reddit", cap: "reddit.comments", params: { postId: m[1], url: u } };
  if ((m = u.match(/linkedin\.com\/.*?(?:activity[-:])(\d{15,})/))) return { platform: "linkedin", cap: "linkedin.comments", params: { postId: m[1] } };
  return null;
}

async function runTool(name, input, env) {
  const { ctx, map, user, signal, purse, onStep, collected, threadId } = env;
  const source = { type: "ask", thread: threadId };
  const keep = async (findings) => {
    const saved = await saveFindings(user, findings, source);
    collected.findings.push(...saved);
    return saved;
  };
  const e = { user, signal, purse, onStep, ctx, map };
  switch (name) {
    case "recall": {
      onStep({ id: "recall", label: "Checking what I already know", status: "running" });
      let found = latestOnly(await queryFindings(user, { platform: input.platform, kinds: input.kind ? [input.kind] : undefined, sinceDays: 45, limit: 80 }));
      if (input.topic) {
        const about = found.filter((f) => overlaps(input.topic, `${f.statement} ${f.scope?.query || ""} ${f.scope?.topic || ""}`));
        found = about.length ? about : found.filter((f) => ["trend", "interest", "sound", "competitor"].includes(f.kind));
      }
      const reports = await recentReports(user);
      collected.recalled.push(...found.slice(0, 20));
      onStep({ id: "recall", label: found.length ? `Found ${Math.min(found.length, 20)} things I already know` : "Nothing known yet, so I'll look", status: "done" });
      return {
        facts: found.slice(0, 20).map((f) => ({
          id: f.id,
          kind: f.kind,
          platform: f.platform,
          fact: f.statement,
          ageDays: ageDays(f),
          format: f.scope?.focus || null,
          accounts: f.metrics?.authors ?? null,
          earlySign: (f.metrics?.authors ?? 99) < 5 || Boolean(f.scope?.thin),
        })),
        recentReports: reports.length ? reports : undefined,
        note: found.length ? undefined : input.topic ? `Nothing known yet about ${input.topic}.` : "Nothing known yet about this market.",
      };
    }
    case "search_news": {
      const days = Math.max(1, Math.min(30, Number(input.days) || 14));
      const r = await newsFor({ query: String(input.query || "").slice(0, 120), ctx: { ...ctx, country: input.country || ctx.country }, map: input.country ? { ...map, country: String(input.country).toUpperCase().slice(0, 2) } : map, days, depth: "quick" }, e);
      return { days, searchedFor: r.query, found: r.items.length, stories: r.items.slice(0, 12).map((a) => ({ date: day(a.postedAt), title: clip(a.title, 160), source: a.source, url: a.url, snippet: a.snippet ? clip(a.snippet, 110) : undefined })) };
    }
    case "search_posts": {
      const platform = SEARCHABLE.includes(input.platform) ? input.platform : ctx.platforms[0];
      if (skipped(map, platform, ctx)) return { platform, posts: [], note: `${platformLabel(platform)} isn't used in this market${map.notes ? ` (${map.notes.slice(0, 120)})` : ""}. Search another platform.` };
      const days = Math.max(1, Math.min(30, Number(input.days) || 14));
      const r = await searchPosts({ platform, query: String(input.query || ctx.keywords[0]).slice(0, 200), ctx, map, days, sort: input.sort === "top" ? "top" : "latest", limit: 10 }, e);
      collected.sample ||= r.sample;
      return { platform, searchedFor: r.query, days, found: r.total, posts: r.posts.map(postRow), note: platform === "x" && days > 7 ? "X search reaches back about 7 days." : undefined };
    }
    case "read_account": {
      const platform = ["instagram", "tiktok", "youtube", "x", "linkedin", "facebook"].includes(input.platform) ? input.platform : "instagram";
      let acct = String(input.account || input.name || "").trim();
      const isLink = /^https?:\/\//.test(acct);
      // A brand named in words, not a handle: use the account the market map
      // knows, or find and check it, rather than guessing a handle.
      if (!isLink && !acct.startsWith("@") && (/\s/.test(acct) || /[A-Z]/.test(acct) || input.name)) {
        const name = input.name || acct;
        const known = (map.competitors || []).find((c) => String(c.name).toLowerCase() === name.toLowerCase());
        const field = platform === "x" ? "x" : platform;
        // Only a handle the brand itself gave is trusted as is; a guessed one is checked.
        const trusted = known && !known.suggested && known[field] && platform !== "linkedin";
        const resolved = trusted ? null : await resolveCompetitor({ ...(known || {}), name, suggested: !known || known.suggested }, e, { platforms: [platform] });
        const found = trusted ? known[field] : resolved?.accounts?.[platform]?.handle || resolved?.accounts?.[platform]?.url || resolved?.accounts?.[platform]?.channelId;
        if (!found) return { account: name, platform, note: `I couldn't find a verified ${platformLabel(platform)} account for ${name}.` };
        acct = found;
      }
      const link = /^https?:\/\//.test(acct);
      const s = await accountSnapshot({ platform, handle: link ? null : acct.replace(/^@/, ""), url: link ? acct : null, name: input.name || null }, e);
      await keep(findingsFromAccount(s, ctx));
      collected.evidence.push(...(s.breakouts || []).slice(0, 4));
      collected.sample ||= s.sample;
      if (s.unsupported || s.missing) return { account: acct, platform, note: s.missing ? "Account not found, private, or not on this platform." : "Not supported on this platform yet." };
      return {
        platform,
        account: s.profile?.name ? `${s.profile.name}${s.handle ? ` (${platform === "linkedin" ? s.handle : `@${s.handle}`})` : ""}` : s.handle,
        followers: s.profile?.followers ?? null,
        postsPerWeek: s.cadence?.perWeek ?? null,
        normalViews: s.normal?.views ?? null,
        normalLikes: s.normal?.likes ?? null,
        formats: (s.summary?.formats || []).slice(0, 3).map((g) => ({ format: g.key, posts: g.n, reach: r1(g.medianStrength) })),
        hooks: (s.summary?.hooks || []).filter((g) => g.key !== "other").slice(0, 3).map((g) => ({ hook: g.key, posts: g.n, reach: r1(g.medianStrength) })),
        breakouts: (s.breakouts || []).slice(0, 3),
        latest: (s.recent || []).slice(0, 4).map((p) => ({ date: day(p.postedAt), text: clip(p.caption, 200), url: p.url, likes: p.likes, views: p.views })),
      };
    }
    case "read_comments": {
      const target = postFromUrl(input.url);
      if (!target) return { note: "That link isn't a post I can read comments on." };
      onStep({ id: `comments:${input.url}`, label: `Reading the comments on that ${platformLabel(target.platform)} post`, status: "running" });
      const r = await fetchCap(target.cap, target.params, { user, signal });
      purse.add(r.usd);
      const comments = (r.data || []).sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 30);
      onStep({ id: `comments:${input.url}`, label: `Read ${comments.length} comments`, status: "done" });
      return { platform: target.platform, comments: comments.map((c) => ({ text: clip(c.text, 220), likes: c.likes, date: day(c.postedAt) })) };
    }
    case "read_reviews": {
      const site = String(input.website || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const r = await reviewsFor({ target: { name: input.name, brand: Boolean(input.brand), domain: site || null, amazonQuery: input.product || input.name }, ctx, map, sources: [...new Set([...(map.reviewSources || []), ...(site ? ["trustpilot"] : [])])] }, e);
      const ratings = r.reviews.filter((x) => x.rating != null);
      return {
        reviews: ratings.length ? { count: ratings.length, average: Math.round((ratings.reduce((s, x) => s + x.rating, 0) / ratings.length) * 10) / 10 } : null,
        recent: r.reviews.slice(0, 12).map((x) => ({ rating: x.rating, source: x.source, date: day(x.postedAt), text: clip(`${x.title ? `${x.title}: ` : ""}${x.text}`, 220), url: x.url })),
        products: r.products.slice(0, 5).map((p) => ({ title: clip(p.title, 120), rating: p.rating, reviews: p.reviews, price: p.price, url: p.url })),
      };
    }
    case "web_search": {
      onStep({ id: `web:${input.query}`, label: `Searching the web for ${clip(input.query, 60)}`, status: "running" });
      const r = await fetchCap("web.search", { q: String(input.query || "").slice(0, 200), country: map.country || ctx.country || undefined, limit: 8 }, { user, signal });
      purse.add(r.usd);
      onStep({ id: `web:${input.query}`, label: `Read ${(r.data || []).length} web results`, status: "done" });
      return { results: (r.data || []).slice(0, 8).map((x) => ({ title: x.title, url: x.url, snippet: x.snippet ? clip(x.snippet, 200) : undefined })) };
    }
    case "measure_content": {
      const platform = PLATFORM_IDS.includes(input.platform) ? input.platform : ctx.platforms[0];
      const a = await analyzeContent({ platform, query: input.query || null, ctx, map, days: input.days || (platform === "x" ? 9 : 30), focus: input.format || null, depth: "standard" }, e);
      await keep(findingsFromAnalysis(a, ctx));
      collected.evidence.push(...rows(a.summary?.top || [], 6));
      collected.sample ||= a.sample;
      return compactAnalysis(a);
    }
    case "whats_trending": {
      const platform = SEARCHABLE.includes(input.platform) ? input.platform : ctx.platforms[0];
      if (skipped(map, platform, ctx)) return { platform, postsThisWeek: 0, note: `${platformLabel(platform)} isn't used in this market. Check another platform.` };
      const t = await trendingNow({ platform, ctx, map }, e);
      await keep(findingsFromTrending(t, ctx));
      collected.sample ||= t.sample;
      return {
        platform,
        region: t.region || ctx.region,
        note: t.regionNote || undefined,
        postsThisWeek: t.n,
        topics: t.topics.slice(0, 6),
        takingOff: t.hot.slice(0, 4).map((p) => ({ date: day(p.postedAt), handle: p.handle, text: clip(p.caption, 150), url: p.url, likes: p.likes, views: p.views })),
        hashtags: t.hashtags.slice(0, 8),
        sounds: t.sounds.slice(0, 5),
        searchInterest: t.interest,
        formats: (t.formats || []).slice(0, 3).map((g) => ({ format: g.key, posts: g.n, reach: r1(g.medianStrength) })),
      };
    }
    case "search_interest": {
      onStep({ id: "interest", label: `Checking search interest in ${(input.keywords || []).slice(0, 3).join(", ")}`, status: "running" });
      const r = await fetchCap("google.trends", { keywords: (input.keywords || []).slice(0, 5), country: map.country || ctx.country || undefined }, { user, signal });
      purse.add(r.usd);
      const growth = trendGrowth(r.data);
      await keep(findingsFromTrending({ platform: "google", interest: growth }, ctx));
      onStep({ id: "interest", label: "Checked search interest", status: "done" });
      return { keywords: growth };
    }
    case "ads_running": {
      const r = await adsFor({ query: input.query || null, advertiser: input.advertiser || null, ctx, map }, e);
      return { ads: r.ads.slice(0, 10).map((a) => ({ advertiser: a.advertiser, platform: a.platform, text: clip(a.text || a.title, 200), cta: a.cta || undefined, started: day(a.startedAt), url: a.url || undefined, ctrPct: a.ctr ?? undefined })) };
    }
    case "mentions": {
      const r = await mentionsOf({ name: String(input.name || "").slice(0, 80), ctx, map, days: Math.max(1, Math.min(30, Number(input.days) || 14)) }, e);
      return { posts: r.posts.slice(0, 8).map(postRow), articles: r.articles.slice(0, 6).map((a) => ({ date: day(a.postedAt), title: a.title, source: a.source, url: a.url })) };
    }
    case "audience_voice": {
      const v = await audienceVoice({ query: input.query || null, ctx, map }, e);
      await keep(findingsFromVoice(v, ctx));
      const brief = (list) => (list || []).slice(0, 6).map((q) => ({ text: q.text, count: q.count, from: q.from }));
      return { read: v.read, bySource: v.bySource, questions: brief(v.questions), pains: brief(v.pains), desires: brief(v.desires), objections: brief(v.objections), phrases: v.phrases };
    }
    case "propose": {
      collected.proposal = {
        kind: input.kind,
        platform: input.platform || (input.kind === "trends" ? "all" : ctx.platforms[0]),
        format: ["reel", "carousel", "image", "video", "short", "text"].includes(input.format) ? input.format : null,
        topic: String(input.topic || input.focus || "").slice(0, 80) || null,
        handles: (input.handles || []).map((h) => String(h).trim()).filter(Boolean).slice(0, 4),
        reason: String(input.reason || "").slice(0, 240),
        credits: PROPOSAL_PRICE[input.kind] ?? PRICES.report,
      };
      return { ok: true, note: "They will see a button to run it, with its price. Mention it in one sentence." };
    }
    default:
      return { error: "Unknown tool" };
  }
}

// The last few turns of the conversation, starting on a question.
const condense = (history) => {
  const recent = history.slice(-12);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent.map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 4000) || "(no text)" }));
};

async function claudeAgent({ question, history, env, send }) {
  const client = anthropic();
  const sys = [{ type: "text", text: system(env.ctx, env.map), cache_control: { type: "ephemeral" } }];
  const tools = TOOLS.map((t, i) => (i === TOOLS.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t));
  const messages = [...condense(history), { role: "user", content: question }];
  let calls = 0;
  let answer = "";
  for (let turn = 0; turn < 6; turn++) {
    const stream = client.beta.messages.stream(
      { model: MODELS.write.id, max_tokens: 4000, thinking: { type: "between_tools" }, output_config: { effort: "low" }, ...SONNET_FALLBACK, system: sys, tools, messages },
      { signal: env.signal }
    );
    let turnText = "";
    let retracted = false;
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use" && turnText && !retracted) {
        send({ t: "retract" });
        retracted = true;
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        turnText += event.delta.text;
        if (!retracted) send({ t: "text", delta: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    await recordUsage({ userId: env.user.id !== "local" ? env.user.id : null, kind: "ask", model: final.model, usage: final.usage });
    if (final.stop_reason === "refusal") throw fail("declined", 422);
    const uses = final.content.filter((b) => b.type === "tool_use");
    if (!uses.length) {
      answer = turnText;
      break;
    }
    messages.push({ role: "assistant", content: final.content });
    const results = await Promise.all(
      uses.map(async (tu) => {
        const free = FREE_TOOLS.includes(tu.name);
        if (!free && (calls >= MAX_CALLS || env.purse.empty)) {
          return { type: "tool_result", tool_use_id: tu.id, content: "No more data calls for this question. Answer with what you have, or call propose.", is_error: true };
        }
        if (!free) calls += 1;
        try {
          const out = await execTool(tu.name, tu.input || {}, env);
          return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 20000) };
        } catch (err) {
          if (env.signal?.aborted) throw err;
          env.onStep({ id: `${tu.name}:${tu.id}`, label: "One source didn't answer", status: "error" });
          return { type: "tool_result", tool_use_id: tu.id, content: `That source failed (${err?.code || "error"}). Carry on with what you have.`, is_error: true };
        }
      })
    );
    messages.push({ role: "user", content: results });
  }
  return answer;
}

/* ------------------------------------------------------------- stand-in -- */

const FORMAT_WORDS = [["carousel", "carousel"], ["reel", "reel"], ["short", "short"], ["thread", "text"], ["video", "video"], ["image", "image"]];

function route(question, ctx, map) {
  const q = question.toLowerCase();
  const platform = SEARCHABLE.find((p) => q.includes(p === "x" ? "twitter" : p)) || (/\bx\b/.test(q) ? "x" : ctx.platforms[0]);
  const format = FORMAT_WORDS.find(([w]) => q.includes(w))?.[1] || null;
  const handle = question.match(/@([\w.]{2,30})/)?.[1];
  const topic = ctx.keywords[0];
  if (/creator|influencer|ugc/.test(q)) return [["recall", { platform }], ["propose", { kind: "creators", platform, topic, reason: `A ranked shortlist of ${platformLabel(platform)} creators in ${ctx.niche}, checked on their recent posts, with contacts.` }]];
  if (/full report|deep|playbook|everything/.test(q)) return [["recall", { platform }], ["propose", { kind: "playbook", platform, format, topic, reason: `What works in ${ctx.niche} on ${platformLabel(platform)}, formula by formula, with examples.` }]];
  if (/news|launch|collab|campaign|announce|latest|recent/.test(q)) {
    const where = (map?.platforms || []).filter((p) => p.fit === "core" && SEARCHABLE.includes(p.id)).map((p) => p.id).slice(0, 2);
    return [["search_news", { query: `${topic} launch`, days: 14 }], ["search_news", { query: `${topic} collaboration`, days: 14 }], ...(where.length ? where : [platform]).map((p) => ["search_posts", { platform: p, query: `${topic} launch`, days: 14 }])];
  }
  if (handle || /competitor/.test(q)) {
    const comp = map?.competitors?.[0];
    const h = handle || comp?.instagram || ctx.competitors?.[platform]?.[0] || ctx.competitors?.instagram?.[0];
    if (h) return [["recall", { platform }], ["read_account", { platform: platform === "tiktok" ? "tiktok" : "instagram", account: h }]];
  }
  if (/trend|rising|viral|this week|sound|hashtag/.test(q)) return [["recall", { platform }], ["whats_trending", { platform }]];
  if (/ask|question|audience|comment|pain|complain|review/.test(q)) return [["recall", { platform }], ["audience_voice", {}]];
  if (/\bads?\b|advert/.test(q)) return [["ads_running", { query: topic }]];
  return [["recall", { platform, topic }], ["measure_content", { platform, query: topic, days: 30, format }]];
}

function writeMockAnswer(results, ctx) {
  const parts = [];
  const pick = (n) => results.filter(([name]) => name === n).map(([, out]) => out);
  const analysis = pick("measure_content")[0];
  const trend = pick("whats_trending")[0];
  const account = pick("read_account")[0];
  const voice = pick("audience_voice")[0];
  const ads = pick("ads_running")[0];
  const news = pick("search_news");
  const posts = pick("search_posts");
  const proposal = results.find(([n]) => n === "propose")?.[2];
  if (news.length || posts.length) {
    const stories = news.flatMap((n) => n.stories || []);
    const found = posts.flatMap((p) => p.posts || []);
    if (!stories.length && !found.length) parts.push(`I couldn't find anything from the last two weeks about ${ctx.keywords[0]}.`);
    else {
      parts.push(`**Here's what's new in ${ctx.niche} in the last two weeks**, from ${stories.length} news stories and ${found.length} posts.`);
      if (stories.length) parts.push(`\n### In the news\n${stories.slice(0, 5).map((s) => `- ${s.date}: [${s.title}](${s.url}), ${s.source}`).join("\n")}`);
      if (found.length) parts.push(`\n### On social\n${found.slice(0, 5).map((p) => `- ${p.date}: ${p.author} on ${platformLabel(p.platform)}: [${clip(p.text, 90)}](${p.url})`).join("\n")}`);
      parts.push(`\n### What it means for ${ctx.name}\n- Pick the launch closest to your audience and post your take within a day.`);
    }
  }
  if (analysis) {
    const h = analysis.hooks?.find((g) => !g.earlySign) || analysis.hooks?.[0];
    const f = analysis.formats?.[0];
    const about = analysis.searchedFor;
    if (!analysis.posts) parts.push(`I couldn't find recent posts about ${about} on ${platformLabel(analysis.platform)}. Try a broader search word.`);
    else {
      const size = (g) => `${g.posts} posts from ${g.accounts ?? "?"} accounts`;
      parts.push(`**${h ? hookLabel(h.hook) : "Standout"} openings are working in ${about} on ${platformLabel(analysis.platform)}**, reaching about ${h?.reach ?? "?"}x a typical post across ${h ? size(h) : `${analysis.posts} posts`}.${analysis.earlyRead ? " This is an early read: there aren't many on-topic posts yet." : ""}`);
      parts.push(`\n### What's working\n${(analysis.hooks || []).slice(0, 3).map((g) => `- **${hookLabel(g.hook)}**: ${g.reach ?? "?"}x typical reach (${size(g)}${g.accountsBeatingNormPct != null ? `, ${g.accountsBeatingNormPct}% of those accounts beat the norm` : ""})${g.earlySign ? ", an early sign" : ""}`).join("\n")}${f ? `\n- **${formatLabel(f.format)}** lead the format mix at ${f.reach ?? "?"}x (${size(f)})` : ""}`);
      const top = analysis.topPosts?.[0];
      parts.push(`\n### What to post\n- Open on a ${h ? hookLabel(h.hook).toLowerCase() : "strong"} opening about ${ctx.keywords[0]}, in ${ctx.name}'s voice.${top ? ` Like [this post](${top.url}), which reached ${top.lift ?? "?"}x a typical one.` : ""}\n- Keep the first line under 10 words and promise one clear payoff.`);
    }
  }
  if (trend) {
    parts.push(`**This week on ${platformLabel(trend.platform)}:** ${trend.postsThisWeek} on-topic posts. ${(trend.topics || []).slice(0, 3).map((t) => `${t.topic} (${t.accounts} accounts)`).join(", ") || "No topic stands out"}.`);
    if (trend.hashtags?.length) parts.push(`\n### Hashtags\n${trend.hashtags.slice(0, 5).map((h) => `- #${h.tag}${h.growthPct ? ` (${h.growthPct > 0 ? "+" : ""}${h.growthPct}%)` : h.posts ? ` (${h.posts} posts)` : ""}`).join("\n")}`);
    if (trend.sounds?.length) parts.push(`\n### Sounds\n${trend.sounds.slice(0, 3).map((s) => `- "${s.title}"${s.commercial === false ? " (not cleared for brand accounts)" : ""}`).join("\n")}`);
  }
  if (account) parts.push(account.note ? `I couldn't read ${account.account}. ${account.note}` : `**${account.account}** posts about ${account.postsPerWeek ?? "?"} times a week${account.followers ? ` to ${account.followers.toLocaleString("en-US")} followers` : ""}. ${account.breakouts?.length || 0} recent posts broke out.${account.breakouts?.[0] ? ` Their best: [this post](${account.breakouts[0].url}) at ${account.breakouts[0].beat ?? account.breakouts[0].lift ?? "?"}x their normal.` : ""}`);
  if (voice) parts.push(`**What people ask about ${ctx.keywords[0]}** (from ${voice.read} comments, threads and reviews):\n${(voice.questions || []).slice(0, 4).map((q) => `- ${q.text}${q.count > 1 ? ` (${q.count})` : ""}`).join("\n") || "- Nothing clear yet"}${voice.pains?.length ? `\n\nTop frustration: ${voice.pains[0].text}` : ""}`);
  if (ads) parts.push(`**Ads running for ${ctx.keywords[0]}:**\n${ads.ads.slice(0, 4).map((a) => `- ${a.advertiser || "An advertiser"}: "${clip(a.text, 80)}"`).join("\n") || "- None found"}`);
  if (proposal) parts.push(`${parts.length ? "\n" : ""}This needs a deeper look than one answer. ${proposal.reason} You can run it below.`);
  return parts.join("\n").trim() || "I couldn't find anything useful for that yet. Try naming a platform or a topic.";
}

async function mockAgent({ question, env, send }) {
  // QA hook: "#slow" in a question holds the answer back for a few seconds.
  if (question.includes("#slow")) {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 4000);
      env.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  const plan = route(question, env.ctx, env.map);
  const results = await Promise.all(
    plan.map(async ([name, input]) => {
      try {
        const out = await execTool(name, input, env);
        return [name, out, name === "propose" ? env.collected.proposal : null];
      } catch {
        env.onStep({ id: `${name}:mock`, label: "One source didn't answer", status: "error" });
        return [name, null, null];
      }
    })
  );
  const answer = writeMockAnswer(results.filter(([, out]) => out), env.ctx);
  for (let i = 0; i < answer.length; i += 48) {
    if (env.signal?.aborted) break;
    send({ t: "text", delta: answer.slice(i, i + 48) });
    await new Promise((r) => setTimeout(r, 18));
  }
  return answer;
}

// Runs the whole answer. Throws on failure, so the route can refund.
export async function answerQuestion({ question, history, ctx, user, threadId, signal, send }) {
  const collected = { findings: [], evidence: [], recalled: [], proposal: null, sample: false, steps: [], attempted: 0, useful: 0 };
  const onStep = (step) => {
    const i = collected.steps.findIndex((s) => s.id === step.id);
    if (i >= 0) collected.steps[i] = step;
    else collected.steps.push(step);
    send({ t: "step", ...step });
  };
  onStep({ id: "map", label: "Getting to know your market", status: "running" });
  const map = await marketMap(ctx, { user });
  onStep({ id: "map", label: "Planning where to look", status: "done" });
  const env = { ctx, map, user, signal, purse: new Purse(DATA_BUDGET_USD), onStep, collected, threadId };
  const answer = isMock() ? await mockAgent({ question, env, send }) : await claudeAgent({ question, history, env, send });
  // Nothing measured and nothing known: the answer can only say so, so it's free.
  const noData = collected.attempted > 0 && collected.useful === 0 && !collected.recalled.length && !collected.proposal;
  return { answer: String(answer || "").trim(), collected, noData };
}

export const _test = { postFromUrl, route, RESEARCH_PLATFORMS };
