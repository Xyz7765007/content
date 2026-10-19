// Domain constants carried over from v1. Signal type labels and descriptions are
// unchanged so existing Airtable records and saved prompts keep working.

export const PRODUCT_NAME = "Huesy";

export const SIGNAL_TYPES = [
  {
    id: "product_launch",
    label: "New Product Launch",
    desc: "Brand launches or announces a new product or service",
  },
  {
    id: "market_move",
    label: "Noticeable Market Move",
    desc: "Significant shifts in positioning, pricing, or strategy",
  },
  {
    id: "repositioning",
    label: "Brand Repositioning",
    desc: "Brand pivots identity, messaging, or audience",
  },
  {
    id: "expansion",
    label: "Brand Expansion",
    desc: "New markets, geographies, categories, or partnerships",
  },
  {
    id: "campaign",
    label: "Major Campaign",
    desc: "Notable campaigns or viral marketing moments",
  },
  {
    id: "controversy",
    label: "Controversy or Crisis",
    desc: "PR crises, backlash, or controversial moves",
  },
  {
    id: "collab",
    label: "Collaboration or Partnership",
    desc: "Collabs, celebrity partnerships, co branded launches",
  },
  { id: "custom", label: "Custom Signal", desc: "Define your own signal type" },
];

export const PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    desc: "Caption, creative brief and image prompt",
  },
  { id: "linkedin", label: "LinkedIn", desc: "A post with a point of view" },
  { id: "twitter", label: "X", desc: "A post, and a short thread when it helps" },
  {
    id: "email",
    label: "Newsletter",
    desc: "A short email with merge fields",
  },
];

// Where a search actually looks. Cut from seven to the three that return
// signals worth writing about; the prompt instructions for each are in
// lib/prompts.js.
// Where a watchlist looks. Ids "google" and "twitter" are kept from earlier
// versions so saved watchlists keep working.
export const RESEARCH_PLATFORMS = [
  { id: "google", label: "News", hint: "News sites and the trade press" },
  { id: "instagram", label: "Instagram", hint: "Brand accounts and reels" },
  { id: "twitter", label: "X", hint: "Announcements and what people say" },
  { id: "linkedin", label: "LinkedIn", hint: "Company and industry posts" },
  { id: "reddit", label: "Reddit", hint: "What buyers are discussing" },
  { id: "tiktok", label: "TikTok", hint: "Short videos" },
  { id: "youtube", label: "YouTube", hint: "Videos and reviews" },
  { id: "ads", label: "Ad libraries", hint: "New ads brands are running" },
];

/* --------------------------------------------------------------- regions --
   A region is stored as its label, so a user can add one that is not on this
   list ("Nordics", "Tier 2 India") and it flows straight into the prompt.
   "Global" is the sentinel meaning no geographic focus.
----------------------------------------------------------------------------- */

export const GLOBAL_REGION = "Global";

export const REGIONS = [
  GLOBAL_REGION,
  "India",
  "United States",
  "United Kingdom",
  "UAE / Gulf",
  "Australia",
  "Singapore",
  "Canada",
  "Europe",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Netherlands",
  "Nordics",
  "Ireland",
  "Switzerland",
  "Portugal",
  "Poland",
  "Turkey",
  "Saudi Arabia",
  "Egypt",
  "South Africa",
  "Nigeria",
  "Kenya",
  "Japan",
  "South Korea",
  "China",
  "Hong Kong",
  "Taiwan",
  "Indonesia",
  "Malaysia",
  "Thailand",
  "Vietnam",
  "Philippines",
  "Pakistan",
  "Bangladesh",
  "Sri Lanka",
  "New Zealand",
  "Brazil",
  "Mexico",
  "Argentina",
  "Colombia",
  "Chile",
  "Latin America",
  "Southeast Asia",
  "Middle East",
  "North America",
  "APAC",
];

// v1 and v2 stored regions by these short ids. Kept only so old drafts and
// saved searches can be read; nothing new is written with them.
const LEGACY_REGION_IDS = {
  global: GLOBAL_REGION,
  IN: "India",
  US: "United States",
  UK: "United Kingdom",
  AE: "UAE / Gulf",
  AU: "Australia",
  SG: "Singapore",
  CA: "Canada",
  EU: "Europe",
};

export const regionLabel = (value) => LEGACY_REGION_IDS[value] || value;

export const normaliseRegions = (list) => {
  const labels = (list || []).map(regionLabel).filter(Boolean);
  if (!labels.length || labels.includes(GLOBAL_REGION)) return [GLOBAL_REGION];
  return [...new Set(labels)];
};

export const isGlobal = (list) => normaliseRegions(list).includes(GLOBAL_REGION);

// When a search watches a single country, the web search runs as if from
// there, which brings up local coverage first. Groups of countries have no
// single location, so they are left to the prompt.
export const REGION_COUNTRY = {
  India: "IN",
  "United States": "US",
  "United Kingdom": "GB",
  "UAE / Gulf": "AE",
  Australia: "AU",
  Singapore: "SG",
  Canada: "CA",
  Germany: "DE",
  France: "FR",
  Spain: "ES",
  Italy: "IT",
  Netherlands: "NL",
  Ireland: "IE",
  Switzerland: "CH",
  Portugal: "PT",
  Poland: "PL",
  Turkey: "TR",
  "Saudi Arabia": "SA",
  Egypt: "EG",
  "South Africa": "ZA",
  Nigeria: "NG",
  Kenya: "KE",
  Japan: "JP",
  "South Korea": "KR",
  China: "CN",
  "Hong Kong": "HK",
  Taiwan: "TW",
  Indonesia: "ID",
  Malaysia: "MY",
  Thailand: "TH",
  Vietnam: "VN",
  Philippines: "PH",
  Pakistan: "PK",
  Bangladesh: "BD",
  "Sri Lanka": "LK",
  "New Zealand": "NZ",
  Brazil: "BR",
  Mexico: "MX",
  Argentina: "AR",
  Colombia: "CO",
  Chile: "CL",
};

export const DEFAULT_CREATIVE_DIRECTION = `Editorial, magazine style. Bold typography mixing serif display with clean sans serif body. Collage aesthetic: real photography + graphic elements. Brand aligned color palettes. High contrast text/imagery. Product shots, lifestyle photography, graphic overlays. Legible, artistic text on images. Vogue meets brand strategy. Rounded corner image grids. Strong visual hierarchy. Smart, culturally aware, visually striking, shareable.`;

// v1 fetched 10 to 20 and v2 asked for 30 to 50. Every search is now ranked
// for the brand, so a tighter list of real stories beats padding it out.
export const DEFAULT_RESULT_RANGE = [20, 40];

// How many signals to ask for, as choices instead of two number boxes.
export const RESULT_SIZES = [
  { id: "focused", label: "A focused few", range: [10, 15] },
  { id: "standard", label: "A full read", range: [20, 40] },
  { id: "wide", label: "Everything I can find", range: [40, 60] },
];

export const SORT_OPTIONS = [
  { id: "latest", label: "Latest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "brand", label: "Brand A to Z" },
];

export const signalTypeById = (id) => SIGNAL_TYPES.find((s) => s.id === id);
export const platformById = (id) => PLATFORMS.find((p) => p.id === id);
export const researchPlatformById = (id) =>
  RESEARCH_PLATFORMS.find((p) => p.id === id);
