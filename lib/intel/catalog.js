import * as N from "./normalize";

// Every data job Huesy can run: which endpoint answers it, what one call
// costs, how long an answer stays fresh, how long to wait, and how to read
// the answer. Prices are list prices per call (USD), used for the cost ledger.

const H = 3600000;

export const CAPS = {
  "instagram.hashtag": {
    id: "treg.instagram.hashtag.posts",
    usd: 0.0019,
    ttl: 12 * H,
    timeout: 30000,
    build: ({ tag }) => ({ body: { hashtag: String(tag).replace(/^#/, "") } }),
    parse: (raw) => N.igPosts(raw),
  },
  "instagram.profile": {
    id: "treg.instagram.user.profile",
    usd: 0.0009,
    ttl: 24 * H,
    build: ({ handle }) => ({ body: { username: handle } }),
    parse: (raw) => N.igProfile(raw),
  },
  "instagram.posts": {
    id: "treg.instagram.user.posts",
    usd: 0.0009,
    ttl: 12 * H,
    build: ({ handle }) => ({ body: { username: handle } }),
    parse: (raw) => N.igUserPosts(raw),
  },
  "instagram.reels": {
    id: "treg.instagram.user.reels",
    usd: 0.0009,
    ttl: 12 * H,
    timeout: 35000,
    build: ({ handle, limit = 12 }) => ({ body: { username: handle, limit } }),
    parse: (raw, { handle }) => N.igReels(raw, handle),
  },
  "instagram.comments": {
    id: "treg.instagram.post.comments",
    usd: 0.00144,
    ttl: 24 * H,
    build: ({ shortcode, url }) => ({ body: shortcode ? { shortcode } : { url } }),
    parse: (raw) => N.igComments(raw),
  },
  "instagram.post": {
    id: "treg.instagram.post.detail",
    usd: 0.001,
    ttl: 6 * H,
    build: ({ shortcode, url }) => ({ body: shortcode ? { shortcode } : { url } }),
    parse: (raw) => N.igPostDetail(raw),
  },
  "instagram.searchUsers": {
    id: "treg.instagram.search.users",
    usd: 0.0019,
    ttl: 24 * H,
    timeout: 30000,
    build: ({ q }) => ({ body: { q } }),
    parse: (raw) => N.igUsers(raw),
  },
  "instagram.similar": {
    id: "anyapi.instagram.similar_profiles",
    usd: 0.00175,
    ttl: 72 * H,
    build: ({ handle }) => ({ body: { handle } }),
    parse: (raw) => N.igSimilar(raw),
  },
  "instagram.contact": {
    id: "anyapi.instagram.profile_contact",
    usd: 0.0072,
    ttl: 168 * H,
    build: ({ handle }) => ({ body: { handle } }),
    parse: (raw) => N.contact(raw),
  },
  "tiktok.search": {
    id: "treg.tiktok.search.videos",
    usd: 0.001,
    ttl: 12 * H,
    build: ({ q, limit = 20 }) => ({ body: { q, limit } }),
    parse: (raw) => N.ttSearch(raw),
  },
  "tiktok.trending": {
    id: "anyapi.tiktok.trending_hashtags",
    usd: 0.0012,
    ttl: 6 * H,
    build: ({ region = "US", industry, period = 7, limit = 3 }) => ({
      body: { region, period, limit, ...(industry ? { industry } : {}) },
    }),
    parse: (raw) => N.ttTrending(raw),
  },
  "tiktok.music": {
    id: "tikhub.x.tiktok-app-v3-fetch-music-chart-list",
    method: "GET",
    usd: 0.001,
    ttl: 6 * H,
    // scene 1 is the Viral 50, scene 0 the Top 50.
    build: ({ scene = 1 }) => ({ query: { scene, count: 30, cursor: 0 } }),
    parse: (raw) => N.ttMusic(raw),
  },
  "tiktok.profile": {
    id: "treg.tiktok.user.profile",
    usd: 0.00035,
    ttl: 24 * H,
    build: ({ handle }) => ({ body: { username: handle } }),
    parse: (raw) => N.ttProfile(raw),
  },
  "tiktok.videos": {
    id: "treg.tiktok.user.videos",
    usd: 0.0005,
    ttl: 12 * H,
    build: ({ secUid, limit = 20 }) => ({ body: { sec_uid: secUid, limit } }),
    parse: (raw) => N.ttUserVideos(raw),
  },
  "tiktok.ads": {
    id: "anyapi.tiktok.top_ads_search",
    usd: 0.0012,
    ttl: 24 * H,
    build: ({ query, period = 30, limit = 10 }) => ({ body: { query, period, limit } }),
    parse: (raw) => N.ttAds(raw),
  },
  "youtube.search": {
    id: "treg.youtube.search.videos",
    usd: 0.001,
    ttl: 12 * H,
    build: ({ q }) => ({ body: { q } }),
    parse: (raw) => N.ytSearch(raw),
  },
  "youtube.shorts": {
    id: "anyapi.youtube.trending_shorts",
    usd: 0.0012,
    ttl: 6 * H,
    timeout: 30000,
    build: () => ({ body: {} }),
    parse: (raw) => N.ytShorts(raw),
  },
  "youtube.comments": {
    id: "treg.youtube.video.comments",
    usd: 0.0009,
    ttl: 24 * H,
    build: ({ videoId }) => ({ body: { video_id: videoId } }),
    parse: (raw) => N.ytComments(raw),
  },
  "x.search": {
    id: "treg.x.search.posts",
    usd: 0.00075,
    ttl: 6 * H,
    build: ({ q }) => ({ body: { q } }),
    parse: (raw) => N.xPosts(raw),
  },
  "linkedin.search": {
    id: "anyapi.linkedin.search.posts",
    usd: 0.002,
    ttl: 12 * H,
    timeout: 30000,
    build: ({ q, window = "last-week" }) => ({ body: { query: q, datePosted: window } }),
    parse: (raw) => N.liPosts(raw),
  },
  "google.trends": {
    id: "treg.google.keywords.trends",
    usd: 0.0012,
    ttl: 72 * H,
    build: ({ keywords, country }) => ({ body: { keywords: keywords.slice(0, 5), ...(country ? { country } : {}) } }),
    parse: (raw) => N.gTrends(raw),
  },
  "google.news": {
    id: "treg.google.serp.news",
    usd: 0.00015,
    ttl: 6 * H,
    build: ({ q, country, limit = 10 }) => ({ body: { q, limit, ...(country ? { country: country.toLowerCase() } : {}) } }),
    parse: (raw) => N.gNews(raw),
  },
  "reddit.search": {
    id: "scrapecreators.reddit.search.posts",
    method: "GET",
    usd: 0.00188,
    ttl: 24 * H,
    build: ({ q }) => ({ query: { query: q } }),
    parse: (raw) => N.redditPosts(raw),
  },
  "pinterest.search": {
    id: "scrapecreators.x.v1-pinterest-search",
    method: "GET",
    usd: 0.00188,
    ttl: 24 * H,
    build: ({ q }) => ({ query: { query: q } }),
    parse: (raw) => N.pinterestPins(raw),
  },
  "creators.search": {
    id: "influencersclub.creators.search",
    // Billed per creator returned.
    usd: 0.00598,
    perResult: true,
    ttl: 72 * H,
    timeout: 40000,
    build: ({ platform = "instagram", filters = {}, limit = 30 }) => ({
      body: { platform, filters, paging: { limit, page: 0 } },
    }),
    maxCost: ({ limit = 30 }) => Math.min(0.5, limit * 0.006 * 1.3),
    parse: (raw, { platform = "instagram" }) => N.creators(raw, platform),
  },
};

export const capPrice = (name, params = {}, count = 1) => {
  const cap = CAPS[name];
  if (!cap) return 0;
  return cap.perResult ? cap.usd * (params.limit || count || 1) : cap.usd;
};

// TikTok publishes trending boards for these markets only.
export const TIKTOK_REGIONS = ["US", "FR", "DE", "IT", "ES", "GB", "AR", "AU", "BR", "CA", "CO", "EG", "ID", "IL", "JP", "KR", "MY", "MX", "PH", "SA", "SG", "ZA", "TW", "TH", "TR", "AE", "VN"];

export const TIKTOK_INDUSTRIES = {
  beauty: "beauty_personal_care",
  skincare: "beauty_personal_care",
  fashion: "apparel_accessories",
  apparel: "apparel_accessories",
  baby: "baby_kids_maternity",
  education: "education",
  food: "food_beverage",
  drink: "food_beverage",
  beverage: "food_beverage",
  games: "games",
  gaming: "games",
  health: "health",
  fitness: "sports_outdoor",
  sport: "sports_outdoor",
  home: "home_improvement",
  pets: "pets",
  tech: "tech_electronics",
  software: "tech_electronics",
  saas: "tech_electronics",
  travel: "travel",
  auto: "vehicle_transportation",
  car: "vehicle_transportation",
};

export const industryFor = (niche = "") => {
  const words = String(niche).toLowerCase();
  for (const [word, id] of Object.entries(TIKTOK_INDUSTRIES)) if (words.includes(word)) return id;
  return null;
};
