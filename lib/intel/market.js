import { createHash } from "node:crypto";
import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { cacheKey, readCache, writeCache } from "./cache";
import { asTag, brandBrief, PLATFORM_IDS } from "./brand";

// The market map: how to research this brand's market, worked out once per
// brand profile and shared by every feature (Ask, reports, the briefing,
// watchlists, Studio). It says what kind of business this is, which platforms
// carry its market in its region, the words each platform should be searched
// with, the communities where its buyers talk, its competitors on every
// platform, and where its buyers leave reviews.
//
// Built by Sonnet 5.5 from the brand profile (about $0.02), cached for 30
// days per profile, with a rule-based map when the model can't be reached,
// so research never stops for want of a plan.

export const RESEARCH_PLATFORMS = ["instagram", "tiktok", "youtube", "x", "linkedin", "reddit", "facebook"];
export const REVIEW_SOURCES = ["amazon", "trustpilot", "google_maps", "app_stores"];
export const BUSINESS_TYPES = ["d2c_product", "retail_marketplace", "app", "saas_b2b", "b2b_service", "agency", "local_business", "creator", "media", "education", "nonprofit", "other"];

const TTL = 30 * 24 * 3600000;
const memory = new Map();

const str = { type: "string" };
const strs = { type: "array", items: str };
const SCHEMA = {
  type: "object",
  properties: {
    businessType: { type: "string", enum: BUSINESS_TYPES },
    summary: str,
    country: str,
    language: str,
    platforms: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string", enum: RESEARCH_PLATFORMS }, fit: { type: "string", enum: ["core", "useful", "weak", "skip"] }, why: str },
        required: ["id", "fit", "why"],
        additionalProperties: false,
      },
    },
    terms: strs,
    hashtags: strs,
    xQueries: strs,
    linkedinQueries: strs,
    youtubeQueries: strs,
    tiktokQueries: strs,
    subreddits: strs,
    redditQueries: strs,
    newsQueries: strs,
    voiceQueries: strs,
    competitors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: str,
          website: str,
          instagram: str,
          tiktok: str,
          youtube: str,
          x: str,
          linkedin: str,
          facebook: str,
          amazonQuery: str,
          suggested: { type: "boolean" },
        },
        required: ["name", "website", "instagram", "tiktok", "youtube", "x", "linkedin", "facebook", "amazonQuery", "suggested"],
        additionalProperties: false,
      },
    },
    reviewSources: { type: "array", items: { type: "string", enum: REVIEW_SOURCES } },
    notes: str,
  },
  required: ["businessType", "summary", "country", "language", "platforms", "terms", "hashtags", "xQueries", "linkedinQueries", "youtubeQueries", "tiktokQueries", "subreddits", "redditQueries", "newsQueries", "voiceQueries", "competitors", "reviewSources", "notes"],
  additionalProperties: false,
};

const COUNTRY_NAMES = { IN: "India", US: "United States", GB: "United Kingdom", AE: "UAE", AU: "Australia", SG: "Singapore", CA: "Canada", DE: "Germany", FR: "France", SA: "Saudi Arabia", ID: "Indonesia", MY: "Malaysia", PH: "Philippines", BR: "Brazil", MX: "Mexico", JP: "Japan" };
export const countryName = (cc) => COUNTRY_NAMES[String(cc || "").toUpperCase()] || null;

// Everything in the profile that changes the map.
export function brandKey(ctx) {
  const basis = JSON.stringify({ n: ctx.name, p: ctx.product, d: String(ctx.description || "").slice(0, 300), a: ctx.audience, ni: ctx.niche, k: ctx.keywords, pl: ctx.platforms, r: ctx.region, c: ctx.competitors });
  return createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

const clean = (v, max = 80) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
const handle = (v) => clean(v, 80).replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com\/@?|x\.com|twitter\.com|facebook\.com)\//i, "").replace(/[/?#].*$/, "");
const uniq = (list, max) => [...new Set((list || []).map((x) => clean(x, 120)).filter(Boolean))].slice(0, max);

// Turns what the model (or the rules) said into a map every feature can trust:
// limited lengths, real platform ids, the brand's own competitors always kept.
function tidy(raw, ctx) {
  const m = raw && typeof raw === "object" ? raw : {};
  const platforms = (Array.isArray(m.platforms) ? m.platforms : [])
    .filter((p) => RESEARCH_PLATFORMS.includes(p?.id))
    .map((p) => ({ id: p.id, fit: ["core", "useful", "weak", "skip"].includes(p.fit) ? p.fit : "useful", why: clean(p.why, 160) }));
  // The brand's own platforms are always researched.
  for (const id of ctx.platforms || []) if (!platforms.some((p) => p.id === id)) platforms.unshift({ id, fit: "core", why: "You post here." });
  for (const p of platforms) if ((ctx.platforms || []).includes(p.id) && p.fit === "skip") p.fit = "useful";

  const competitors = (Array.isArray(m.competitors) ? m.competitors : []).map((c) => ({
    name: clean(c.name, 60),
    website: clean(c.website, 80).replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase(),
    instagram: handle(c.instagram),
    tiktok: handle(c.tiktok),
    youtube: clean(c.youtube, 80),
    x: handle(c.x),
    linkedin: clean(c.linkedin, 120),
    facebook: clean(c.facebook, 120),
    amazonQuery: clean(c.amazonQuery, 80),
    suggested: Boolean(c.suggested),
  })).filter((c) => c.name || c.instagram || c.x || c.website);

  // Competitors the person named are always in, never "suggested".
  for (const [platform, list] of Object.entries(ctx.competitors || {})) {
    for (const h of list) {
      const field = platform === "x" ? "x" : platform;
      const found = competitors.find((c) => String(c[field] || "").toLowerCase() === h.toLowerCase() || c.name.toLowerCase() === h.toLowerCase());
      if (found) {
        found.suggested = false;
        if (!found[field]) found[field] = h;
      } else competitors.unshift({ name: h, website: "", instagram: "", tiktok: "", youtube: "", x: "", linkedin: "", facebook: "", amazonQuery: "", suggested: false, [field]: h });
    }
  }

  const terms = uniq([...(m.terms || []), ...(ctx.keywords || [])], 8);
  return {
    v: 1,
    businessType: BUSINESS_TYPES.includes(m.businessType) ? m.businessType : "other",
    summary: clean(m.summary, 240),
    country: clean(m.country || ctx.country || "", 2).toUpperCase(),
    language: clean(m.language || "en", 5).toLowerCase(),
    platforms,
    terms,
    hashtags: uniq((m.hashtags || []).map(asTag), 12),
    xQueries: uniq(m.xQueries, 5),
    linkedinQueries: uniq(m.linkedinQueries, 4),
    youtubeQueries: uniq(m.youtubeQueries, 4),
    tiktokQueries: uniq(m.tiktokQueries, 4),
    subreddits: uniq((m.subreddits || []).map((s) => String(s).replace(/^\/?r\//i, "").replace(/[^\w]/g, "")), 6),
    redditQueries: uniq(m.redditQueries, 4),
    newsQueries: uniq(m.newsQueries, 5),
    voiceQueries: uniq(m.voiceQueries, 6),
    competitors: competitors.slice(0, 8),
    reviewSources: uniq((m.reviewSources || []).filter((r) => REVIEW_SOURCES.includes(r)), 4),
    notes: clean(m.notes, 300),
  };
}

// The rules: used by the stand-in, and whenever the model can't be reached.
export function ruleMap(ctx) {
  const kws = ctx.keywords?.length ? ctx.keywords : ["marketing"];
  const text = `${ctx.niche} ${ctx.product} ${ctx.description} ${kws.join(" ")}`.toLowerCase();
  const type = /\b(saas|software|platform|crm|api|b2b|devtools?|analytics)\b/.test(text)
    ? "saas_b2b"
    : /\b(app|mobile app)\b/.test(text)
      ? "app"
      : /\b(agency|consult|services?)\b/.test(text)
        ? "b2b_service"
        : /\b(restaurant|cafe|salon|clinic|gym|studio|bakery|hotel|spa)\b/.test(text)
          ? "local_business"
          : /\b(course|coaching|tuition|exam|school|academy|education)\b/.test(text)
            ? "education"
            : "d2c_product";
  const place = countryName(ctx.country);
  const b2b = ["saas_b2b", "b2b_service", "agency"].includes(type);
  const platforms = [
    ...(ctx.platforms || []).map((id) => ({ id, fit: "core", why: "You post here." })),
    { id: "reddit", fit: "useful", why: "Where buyers ask and compare in their own words." },
    ...(b2b ? [{ id: "linkedin", fit: "core", why: "Where business buyers follow the category." }, { id: "x", fit: "useful", why: "Fast-moving industry talk." }] : [{ id: "youtube", fit: "useful", why: "Reviews and how-tos buyers watch." }]),
  ];
  const or = (list) => (list.length > 1 ? `(${list.map((k) => (k.includes(" ") ? `"${k}"` : k)).join(" OR ")})` : list[0]);
  return tidy(
    {
      businessType: type,
      summary: `${ctx.name}: ${ctx.niche}`,
      country: ctx.country || "",
      language: "en",
      platforms,
      terms: kws,
      hashtags: [...kws.map(asTag), ...(place ? kws.slice(0, 2).map((k) => `${asTag(k)}${asTag(place)}`) : [])],
      xQueries: [`${or(kws.slice(0, 3))} lang:en -filter:replies`, `${or(kws.slice(0, 2))} (launch OR new OR collab) lang:en`],
      linkedinQueries: kws.slice(0, 3),
      youtubeQueries: kws.slice(0, 2).map((k) => (place ? `${k} ${place}` : k)),
      tiktokQueries: kws.slice(0, 3),
      subreddits: [],
      redditQueries: kws.slice(0, 3),
      newsQueries: kws.slice(0, 3).map((k) => (place ? `${k} ${place}` : k)),
      voiceQueries: kws.slice(0, 3),
      competitors: [],
      reviewSources: type === "local_business" ? ["google_maps"] : type === "app" ? ["app_stores"] : type === "saas_b2b" ? ["trustpilot"] : ["amazon", "trustpilot"],
      notes: "",
    },
    ctx
  );
}

async function modelMap(ctx, user) {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `You are planning market research for the brand below. Use what you know about this niche, its buyers and its region. Today is ${today}.

${brandBrief(ctx)}

Return a research map:
- businessType: the closest kind of business.
- summary: one line, what they sell to whom, where.
- country: ISO 3166 two-letter code of the main market ("" if global). language: the main language code.
- platforms: for each of instagram, tiktok, youtube, x, linkedin, reddit, facebook, how much of THIS market's buyer conversation and content happens there in THIS region: core, useful, weak or skip, with a short reason. Account for regional facts (for example TikTok is not available in India) and for B2B versus consumer.
- terms: 4 to 8 short search phrases (1 to 3 words) people actually use for this niche, most important first.
- hashtags: 8 to 12 real hashtags (without #) used for this niche in this region, broad and specific.
- xQueries: 3 to 5 X advanced-search strings for finding this niche's posts. Bare words are ANDed, so group alternatives with OR inside parentheses; add lang:en for English markets; add -filter:replies; no dates.
- linkedinQueries, youtubeQueries, tiktokQueries: 2 to 4 short searches each, as people would type them on that platform (add the country name where local results matter).
- subreddits: 3 to 6 real, active subreddits (names only, no r/) where this audience talks, region-specific ones first. Only ones you are confident exist.
- redditQueries: 2 to 4 short searches.
- newsQueries: 3 to 5 short news searches (2 to 5 words) for this market's news: launches, campaigns, funding, collaborations. Include the region name when the market is local.
- voiceQueries: 3 to 6 phrases buyers use when they describe their problem or what they want (for example "sunscreen for oily skin").
- competitors: the brand's named competitors first, keeping their handles exactly; then up to 4 well-known direct competitors in this region that you are confident exist (suggested: true). Give a handle or link for a platform only when you are confident of it, otherwise "". website is the bare domain. amazonQuery is how to find their products on Amazon ("" if they don't sell there).
- reviewSources: where buyers of this kind of business leave reviews: amazon, trustpilot, google_maps, app_stores.
- notes: one or two lines on anything regional or unusual that changes the research.`;

  const message = await anthropic().messages.create({
    model: MODELS.write.id,
    max_tokens: 4000,
    thinking: { type: "between_tools" },
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  });
  await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind: "market-map", model: message.model, usage: message.usage });
  if (message.stop_reason !== "end_turn") throw new Error(`market map stopped: ${message.stop_reason}`);
  return JSON.parse(textOf(message) || "{}");
}

// The map for this brand, from memory, the cache, or freshly made.
export async function marketMap(ctx, { user = null, fresh = false } = {}) {
  const bk = brandKey(ctx);
  const key = cacheKey("market.map", { u: user?.id || "anon", b: bk });
  if (!fresh) {
    const mem = memory.get(key);
    if (mem && mem.expires > Date.now()) return mem.map;
    const hit = await readCache(key).catch((err) => {
      console.error("[huesy:map] cache read", err?.message || err);
      return null;
    });
    const stored = hit?.payload?.data ?? hit?.payload;
    if (stored?.v === 1) {
      memory.set(key, { map: stored, expires: Date.now() + 3600000 });
      return stored;
    }
  }
  console.log("[huesy:map] building", key.slice(0, 10));
  let map;
  if (isMock()) map = ruleMap(ctx);
  else {
    try {
      map = tidy(await modelMap(ctx, user), ctx);
    } catch (err) {
      console.error("[huesy:map]", err?.message || err);
      map = ruleMap(ctx);
      map.fallback = true;
    }
  }
  map.builtAt = new Date().toISOString();
  memory.set(key, { map, expires: Date.now() + 3600000 });
  // A rule map from a failed call is kept only briefly, so the next run retries.
  await writeCache(key, "market.map", { b: bk }, { data: map, next: null }, map.fallback ? 3600000 : TTL).catch(() => {});
  return map;
}

// Which platforms to read for a job: the ones the map says carry the market,
// the brand's own first, never "skip".
export function platformsFor(map, { include = [], max = 4 } = {}) {
  const order = { core: 0, useful: 1, weak: 2, skip: 3 };
  const list = [...(map?.platforms || [])].filter((p) => p.fit !== "skip").sort((a, b) => order[a.fit] - order[b.fit]).map((p) => p.id);
  return [...new Set([...include.filter((p) => RESEARCH_PLATFORMS.includes(p)), ...list])].slice(0, max);
}

export const isPostingPlatform = (id) => PLATFORM_IDS.includes(id);
