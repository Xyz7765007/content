import { REGION_COUNTRY } from "../constants";

// What the analysis needs to know about a brand, built from the profile the
// browser sends: the niche and the words to search it by, the platforms the
// brand cares about, its market, and the competitors to compare against.

const clean = (v, max = 120) => String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
const handle = (v) => clean(v, 60).replace(/^@/, "").replace(/^https?:\/\/(www\.)?[^/]+\//, "").replace(/\/.*$/, "");

export const PLATFORM_IDS = ["instagram", "tiktok", "youtube", "linkedin", "x"];

const list = (v) => (Array.isArray(v) ? v : []);

// Tolerant of anything the browser sends: wrong types become empty, never errors.
export function brandContext(brand = {}, targets = {}) {
  brand = brand && typeof brand === "object" ? brand : {};
  targets = targets && typeof targets === "object" ? targets : {};
  const intel = brand.intel && typeof brand.intel === "object" ? brand.intel : {};
  const niche = clean([targets.niche, targets.subNiches].filter(Boolean).join(", ") || brand.product || brand.brandDescription, 200);
  const fromNiche = niche
    .split(/[,;/]| and /)
    .map((w) => clean(w, 40).toLowerCase())
    .filter((w) => w.length > 2);
  const keywords = [...new Set((list(intel.keywords).length ? list(intel.keywords) : fromNiche).map((w) => clean(w, 40).toLowerCase()).filter(Boolean))].slice(0, 6);
  const platforms = [...new Set(list(intel.platforms).filter((p) => PLATFORM_IDS.includes(p)))];
  const region = clean(intel.region || "Global", 40);
  const competitors = {};
  for (const id of PLATFORM_IDS) {
    const handles = list(intel.competitors?.[id]).map(handle).filter(Boolean);
    if (handles.length) competitors[id] = [...new Set(handles)].slice(0, 5);
  }
  // Brands typed into the old "brands to watch" box count as Instagram competitors.
  if (!competitors.instagram && targets.accountList) {
    const old = String(targets.accountList).split(/[\n,]/).map(handle).filter((h) => /^[\w.]{2,30}$/.test(h));
    if (old.length) competitors.instagram = old.slice(0, 5);
  }
  return {
    name: clean(brand.brandName, 80) || "the brand",
    product: clean(brand.product, 200),
    description: clean(brand.brandDescription, 600),
    audience: clean(brand.targetAudience, 300),
    voice: clean(brand.brandPersona, 300),
    niche: niche || keywords.join(", "),
    keywords: keywords.length ? keywords : ["marketing"],
    platforms: platforms.length ? platforms : ["instagram", "tiktok"],
    region,
    country: REGION_COUNTRY[region] || null,
    competitors,
    goal: clean(intel.goal, 80),
  };
}

// Hashtags people actually use: "skincare routine" becomes #skincareroutine.
export const asTag = (keyword) => String(keyword || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// The brand block every intelligence prompt starts with.
export function brandBrief(ctx) {
  return [
    `Brand: ${ctx.name}${ctx.product ? ` (${ctx.product})` : ""}`,
    ctx.description && `What it does: ${ctx.description}`,
    ctx.audience && `Audience: ${ctx.audience}`,
    ctx.voice && `Voice: ${ctx.voice}`,
    `Niche: ${ctx.niche}`,
    `Search words: ${ctx.keywords.join(", ")}`,
    `Platforms they care about: ${ctx.platforms.join(", ")}`,
    `Market: ${ctx.region}`,
    Object.keys(ctx.competitors).length &&
      `Competitors: ${Object.entries(ctx.competitors).map(([p, l]) => `${p}: ${l.map((h) => `@${h}`).join(", ")}`).join("; ")}`,
    ctx.goal && `Goal: ${ctx.goal}`,
  ]
    .filter(Boolean)
    .join("\n");
}
