import * as N from "./normalize";

// Every data job Huesy can run: which endpoint answers it, how to ask, how to
// read the answer, how to ask for the next page, what one call costs, how
// long an answer stays fresh and how long to wait.
//
// Each entry was checked against a real reply (18-19 Oct 2026); the shapes
// they return are in normalize.js. `usd` is the list price per call, used
// when the reply doesn't carry its own charge. `next(raw, params)` returns
// the params for the following page, or null when there is none.
//
// kind: posts | profiles | profile | comments | reviews | articles | ads |
//       products | places | results | trends | contact | creators

const H = 3600000;
const D = 24 * H;

const cursorNext = (raw) => {
  const c = raw?.output?.data?.nextCursor ?? raw?.output?.nextCursor ?? raw?.output?.next_cursor ?? null;
  return c ? String(c) : null;
};
const withCursor = (raw, params) => {
  const c = cursorNext(raw);
  return c && c !== params.cursor ? { ...params, cursor: c } : null;
};

export const CAPS = {
  /* -------------------------------------------------------------- news, web */
  "news.search": {
    id: "anyapi.google.serp.news",
    label: "News",
    kind: "articles",
    usd: 0.001,
    ttl: 2 * H,
    // timeframe: "1d", "7d", "30d"; gl a two-letter country.
    build: ({ q, country, days = 7, limit = 20 }) => ({
      body: { query: q, timeframe: `${Math.max(1, Math.min(365, days))}d`, limit, hl: "en", ...(country ? { gl: country.toLowerCase() } : {}) },
    }),
    parse: (raw) => N.articles(raw),
  },
  "web.search": {
    id: "treg.google.serp.organic",
    label: "Web search",
    kind: "results",
    usd: 0.00015,
    ttl: 24 * H,
    build: ({ q, country, limit = 10 }) => ({ body: { q, limit, ...(country ? { country: country.toLowerCase() } : {}) } }),
    parse: (raw) => N.webResults(raw),
  },
  "google.trends": {
    id: "treg.google.keywords.trends",
    label: "Search interest",
    kind: "trends",
    usd: 0.0012,
    ttl: 72 * H,
    build: ({ keywords, country }) => ({ body: { keywords: keywords.slice(0, 5), ...(country ? { country } : {}) } }),
    parse: (raw) => N.gTrends(raw),
  },

  /* -------------------------------------------------------------- Instagram */
  "instagram.reelsSearch": {
    id: "anyapi.instagram.search.reels",
    label: "Instagram reels",
    platform: "instagram",
    kind: "posts",
    usd: 0.0011,
    ttl: 12 * H,
    timeout: 30000,
    build: ({ q, cursor }) => ({ body: { query: q, ...(cursor ? { cursor } : {}) } }),
    parse: (raw) => N.igReelRows(raw),
    next: withCursor,
  },
  "instagram.hashtag": {
    id: "treg.instagram.hashtag.posts",
    label: "Instagram hashtag",
    platform: "instagram",
    kind: "posts",
    usd: 0.00188,
    ttl: 12 * H,
    timeout: 30000,
    build: ({ tag }) => ({ body: { hashtag: String(tag).replace(/^#/, "") } }),
    parse: (raw) => N.igPosts(raw),
  },
  "instagram.usersSearch": {
    id: "treg.instagram.search.users",
    label: "Instagram accounts",
    platform: "instagram",
    kind: "profiles",
    usd: 0.00188,
    ttl: 72 * H,
    timeout: 30000,
    build: ({ q }) => ({ body: { q } }),
    parse: (raw) => N.igUsers(raw),
  },
  "instagram.profile": {
    id: "treg.instagram.user.profile",
    label: "Instagram profile",
    platform: "instagram",
    kind: "profile",
    usd: 0.0009,
    ttl: 48 * H,
    timeout: 25000,
    build: ({ handle }) => ({ body: { username: handle } }),
    parse: (raw) => N.igProfile(raw),
  },
  "instagram.posts": {
    id: "treg.instagram.user.posts",
    label: "Instagram posts",
    platform: "instagram",
    kind: "posts",
    usd: 0.0009,
    ttl: 12 * H,
    timeout: 30000,
    build: ({ handle }) => ({ body: { username: handle } }),
    parse: (raw, p) => N.igPosts(raw, p.handle),
  },
  "instagram.reels": {
    id: "treg.instagram.user.reels",
    label: "Instagram reels",
    platform: "instagram",
    kind: "posts",
    usd: 0.0009,
    ttl: 12 * H,
    timeout: 30000,
    build: ({ handle, limit = 12 }) => ({ body: { username: handle, limit } }),
    parse: (raw, { handle }) => N.igReels(raw, handle),
  },
  "instagram.comments": {
    id: "treg.instagram.post.comments",
    label: "Instagram comments",
    platform: "instagram",
    kind: "comments",
    usd: 0.002,
    ttl: 24 * H,
    build: ({ shortcode, url }) => ({ body: shortcode ? { shortcode } : { url } }),
    parse: (raw, p) => N.igComments(raw, p),
  },
  "instagram.contact": {
    id: "anyapi.instagram.profile_contact",
    label: "Instagram contact",
    platform: "instagram",
    kind: "contact",
    usd: 0.00175,
    ttl: 14 * D,
    build: ({ handle }) => ({ body: { handle } }),
    parse: (raw) => N.contact(raw),
  },
  "instagram.similar": {
    id: "anyapi.instagram.similar_profiles",
    label: "Similar Instagram accounts",
    platform: "instagram",
    kind: "profiles",
    usd: 0.00175,
    ttl: 7 * D,
    build: ({ handle }) => ({ body: { handle } }),
    parse: (raw) => N.igSimilar(raw),
  },

  /* ----------------------------------------------------------------- TikTok */
  "tiktok.search": {
    id: "anyapi.tiktok.search.videos",
    label: "TikTok search",
    platform: "tiktok",
    kind: "posts",
    usd: 0.0006,
    ttl: 12 * H,
    // sortBy 0 relevance, 1 most liked, 2 newest; datePosted 0, 1, 7, 30 days.
    build: ({ q, sort = 0, days = 30, cursor }) => ({ body: { query: q, sortBy: sort, datePosted: days >= 30 ? 30 : days >= 7 ? 7 : days >= 1 ? 1 : 0, ...(cursor ? { cursor } : {}) } }),
    parse: (raw) => N.ttRows(raw),
    next: withCursor,
  },
  "tiktok.usersSearch": {
    id: "treg.tiktok.search.users",
    label: "TikTok accounts",
    platform: "tiktok",
    kind: "profiles",
    usd: 0.0006,
    ttl: 72 * H,
    build: ({ q }) => ({ body: { q } }),
    parse: (raw) => N.ttUsers(raw),
  },
  "tiktok.profile": {
    id: "treg.tiktok.user.profile",
    label: "TikTok profile",
    platform: "tiktok",
    kind: "profile",
    usd: 0.00035,
    ttl: 48 * H,
    build: ({ handle }) => ({ body: { username: handle } }),
    parse: (raw) => N.ttProfile(raw),
  },
  "tiktok.videos": {
    id: "treg.tiktok.user.videos",
    label: "TikTok videos",
    platform: "tiktok",
    kind: "posts",
    usd: 0.0005,
    ttl: 12 * H,
    build: ({ secUid, limit = 20 }) => ({ body: { sec_uid: secUid, limit } }),
    parse: (raw) => N.ttUserVideos(raw),
  },
  "tiktok.comments": {
    id: "treg.tiktok.video.comments",
    label: "TikTok comments",
    platform: "tiktok",
    kind: "comments",
    usd: 0.001,
    ttl: 24 * H,
    build: ({ videoId, limit = 50 }) => ({ body: { video_id: videoId, limit } }),
    parse: (raw, p) => N.ttComments(raw, p),
  },
  "tiktok.contact": {
    id: "anyapi.tiktok.profile_contact",
    label: "TikTok contact",
    platform: "tiktok",
    kind: "contact",
    usd: 0.00187,
    ttl: 14 * D,
    build: ({ handle }) => ({ body: { handle } }),
    parse: (raw) => N.contact(raw),
  },
  "tiktok.trending": {
    id: "anyapi.tiktok.trending_hashtags",
    label: "TikTok trending hashtags",
    platform: "tiktok",
    kind: "trends",
    usd: 0.0012,
    ttl: 6 * H,
    build: ({ region = "US", industry, period = 7, limit = 20 }) => ({ body: { region, period, limit, ...(industry ? { industry } : {}) } }),
    parse: (raw) => N.ttTrending(raw),
  },
  "tiktok.music": {
    id: "tikhub.x.tiktok-app-v3-fetch-music-chart-list",
    method: "GET",
    label: "TikTok sounds chart",
    platform: "tiktok",
    kind: "trends",
    usd: 0.001,
    ttl: 6 * H,
    // scene 1 is the Viral 50, scene 0 the Top 50.
    build: ({ scene = 1 }) => ({ query: { scene, count: 30, cursor: 0 } }),
    parse: (raw) => N.ttMusic(raw),
  },
  "tiktok.ads": {
    id: "anyapi.tiktok.top_ads_search",
    label: "TikTok top ads",
    platform: "tiktok",
    kind: "ads",
    usd: 0.0012,
    ttl: 24 * H,
    build: ({ query, region = "US", period = 30, limit = 20 }) => ({ body: { query, region, period, limit } }),
    parse: (raw) => N.ttAds(raw),
  },

  /* ---------------------------------------------------------------- YouTube */
  "youtube.search": {
    id: "treg.youtube.search.videos",
    label: "YouTube search",
    platform: "youtube",
    kind: "posts",
    usd: 0.001,
    ttl: 12 * H,
    build: ({ q }) => ({ body: { q } }),
    parse: (raw) => N.ytSearch(raw),
  },
  "youtube.channel": {
    id: "treg.youtube.channel.profile",
    label: "YouTube channel",
    platform: "youtube",
    kind: "profile",
    usd: 0.0009,
    ttl: 48 * H,
    build: ({ channelId }) => ({ body: { channel_id: channelId } }),
    parse: (raw) => N.ytChannel(raw),
  },
  "youtube.videos": {
    id: "treg.youtube.channel.videos",
    label: "YouTube channel videos",
    platform: "youtube",
    kind: "posts",
    usd: 0.001,
    ttl: 12 * H,
    build: ({ channelId }) => ({ body: { channel_id: channelId } }),
    parse: (raw, p) => N.ytChannelVideos(raw, p),
  },
  "youtube.comments": {
    id: "treg.youtube.video.comments",
    label: "YouTube comments",
    platform: "youtube",
    kind: "comments",
    usd: 0.0009,
    ttl: 24 * H,
    build: ({ videoId }) => ({ body: { video_id: videoId } }),
    parse: (raw, p) => N.ytComments(raw, p),
  },
  "youtube.shorts": {
    id: "anyapi.youtube.trending_shorts",
    label: "YouTube trending Shorts",
    platform: "youtube",
    kind: "posts",
    usd: 0.0012,
    ttl: 6 * H,
    timeout: 30000,
    build: () => ({ body: {} }),
    parse: (raw) => N.ytShorts(raw),
  },

  /* ---------------------------------------------------------------------- X */
  "x.search": {
    id: "anyapi.x.search.posts",
    label: "X search",
    platform: "x",
    kind: "posts",
    usd: 0.0006,
    ttl: 3 * H,
    // Bare words are ANDed; use OR groups. sort: Top or Latest. Search covers
    // about the last week.
    build: ({ q, sort = "Top", limit = 50, cursor }) => ({ body: { query: q, queryType: sort, limit, ...(cursor ? { cursor } : {}) } }),
    parse: (raw) => N.xRows(raw),
    next: withCursor,
  },
  "x.profile": {
    id: "treg.x.user.profile",
    label: "X profile",
    platform: "x",
    kind: "profile",
    usd: 0.0002,
    ttl: 48 * H,
    timeout: 35000,
    build: ({ handle }) => ({ body: { username: handle } }),
    parse: (raw) => N.xProfile(raw),
  },
  "x.replies": {
    id: "treg.x.post.comments",
    label: "X replies",
    platform: "x",
    kind: "comments",
    usd: 0.00045,
    ttl: 12 * H,
    build: ({ tweetId }) => ({ body: { tweet_id: String(tweetId) } }),
    parse: (raw, p) => N.xReplies(raw, p),
  },

  /* --------------------------------------------------------------- LinkedIn */
  "linkedin.search": {
    id: "harvestapi.linkedin.post.search",
    method: "GET",
    label: "LinkedIn posts",
    platform: "linkedin",
    kind: "posts",
    usd: 0.002,
    ttl: 6 * H,
    timeout: 30000,
    // 50 posts a page. sort: relevance or date; window: 24h, week or month.
    build: ({ q, sort = "relevance", window = "month", page = 1, contentType }) => ({
      query: { search: q, sortBy: sort, postedLimit: window, page, ...(contentType ? { contentType } : {}) },
    }),
    parse: (raw) => N.liElements(raw),
    next: (raw, params) => {
      const pg = raw?.pagination;
      const page = params.page || 1;
      return pg?.totalPages && page < pg.totalPages ? { ...params, page: page + 1 } : null;
    },
  },
  "linkedin.company": {
    id: "treg.linkedin.company.profile",
    label: "LinkedIn company",
    platform: "linkedin",
    kind: "profile",
    usd: 0.001,
    ttl: 7 * D,
    timeout: 30000,
    build: ({ url, handle }) => ({ body: url ? { linkedin_url: url } : { linkedin_handle: handle } }),
    parse: (raw) => N.liCompany(raw),
  },
  "linkedin.companyPosts": {
    id: "harvestapi.linkedin.company.posts",
    method: "GET",
    label: "LinkedIn company posts",
    platform: "linkedin",
    kind: "posts",
    usd: 0.002,
    ttl: 12 * H,
    timeout: 30000,
    build: ({ url, window = "month", page = 1 }) => ({ query: { company: url, postedLimit: window, page } }),
    parse: (raw) => N.liElements(raw),
  },
  "linkedin.profile": {
    id: "treg.linkedin.user.profile",
    label: "LinkedIn profile",
    platform: "linkedin",
    kind: "profile",
    usd: 0.0012,
    ttl: 7 * D,
    timeout: 30000,
    build: ({ url }) => ({ body: { linkedin_url: url } }),
    parse: (raw) => N.liProfile(raw),
  },
  "linkedin.userPosts": {
    id: "treg.linkedin.user.posts",
    label: "LinkedIn member posts",
    platform: "linkedin",
    kind: "posts",
    usd: 0.0015,
    ttl: 12 * H,
    timeout: 30000,
    build: ({ url, limit = 20 }) => ({ body: { linkedin_url: url, limit } }),
    parse: (raw) => N.liElements(raw),
  },
  "linkedin.comments": {
    id: "treg.linkedin.post.comments",
    label: "LinkedIn comments",
    platform: "linkedin",
    kind: "comments",
    usd: 0.0015,
    ttl: 24 * H,
    build: ({ postId, limit = 50 }) => ({ body: { post_id: String(postId), limit } }),
    parse: (raw, p) => N.liComments(raw, p),
  },
  "linkedin.ads": {
    id: "anyapi.linkedin.ads_search",
    label: "LinkedIn ads",
    platform: "linkedin",
    kind: "ads",
    usd: 0.0012,
    ttl: 24 * H,
    timeout: 30000,
    build: ({ keyword, company, country }) => ({ body: { ...(company ? { company } : { keyword }), ...(country ? { countries: [country] } : {}) } }),
    parse: (raw) => N.liAds(raw),
  },
  "people.email": {
    id: "treg.people.email.find",
    label: "Work email",
    kind: "contact",
    usd: 0.0005,
    ttl: 30 * D,
    build: ({ linkedinUrl, name, domain }) => ({ body: linkedinUrl ? { linkedin_url: linkedinUrl } : { full_name: name, domain } }),
    parse: (raw) => N.workEmail(raw),
  },

  /* ----------------------------------------------------------------- Reddit */
  "reddit.search": {
    id: "anyapi.reddit.search",
    label: "Reddit",
    platform: "reddit",
    kind: "posts",
    usd: 0.00035,
    ttl: 6 * H,
    timeout: 30000,
    // sort: relevance, hot, top, new, comments; timeframe: day, week, month, year, all.
    // `subreddit:name` scopes a search to one community.
    build: ({ q, sort = "top", timeframe = "month", cursor }) => ({ body: { query: q, sort, timeframe, ...(cursor ? { cursor } : {}) } }),
    parse: (raw) => N.redditRows(raw),
    next: withCursor,
  },
  "reddit.comments": {
    id: "tikhub.x.reddit-app-fetch-post-comments",
    method: "GET",
    label: "Reddit comments",
    platform: "reddit",
    kind: "comments",
    usd: 0.001,
    ttl: 24 * H,
    // A bare id is billed and answers nothing: the t3_ prefix is required.
    build: ({ postId }) => ({ query: { post_id: String(postId).startsWith("t3_") ? postId : `t3_${postId}`, sort_type: "TOP" } }),
    parse: (raw, p) => N.redditComments(raw, p),
  },

  /* ---------------------------------------------------------- Facebook, ads */
  "facebook.posts": {
    id: "treg.facebook.user.posts",
    label: "Facebook page",
    platform: "facebook",
    kind: "posts",
    usd: 0.00135,
    ttl: 12 * H,
    timeout: 30000,
    build: ({ url }) => ({ body: { url } }),
    parse: (raw, p) => N.fbPosts(raw, p),
  },
  "meta.ads": {
    id: "crawl4ai.meta-ads.library.search",
    label: "Meta ad library",
    platform: "facebook",
    kind: "ads",
    usd: 0.00165,
    ttl: 24 * H,
    timeout: 40000,
    build: ({ q, country, active = "active", limit = 30 }) => ({ body: { query: q, country: country || "ALL", active_status: active, limit } }),
    parse: (raw) => N.metaAds(raw),
  },
  // The ad library's pages for a name, each with its Instagram account, so a
  // brand's own page can be told from others with the same name.
  "meta.pages": {
    id: "scrapecreators.x.v1-facebook-adlibrary-search-companies",
    method: "GET",
    label: "Meta ad library",
    platform: "facebook",
    kind: "pages",
    usd: 0.00188,
    ttl: 7 * 24 * H,
    timeout: 30000,
    build: ({ q }) => ({ query: { query: q } }),
    parse: (raw) => N.metaPages(raw),
  },
  // Every ad one page is running, in one market.
  "meta.pageAds": {
    id: "crawl4ai.meta-ads.library.advertiser",
    label: "Meta ad library",
    platform: "facebook",
    kind: "ads",
    usd: 0.00165,
    ttl: 24 * H,
    timeout: 60000,
    build: ({ pageId, country, active = "active", limit = 30 }) => ({ body: { page: String(pageId), country: country || "ALL", active_status: active, limit } }),
    parse: (raw) => N.metaAds(raw),
  },

  /* ---------------------------------------------------------------- reviews */
  "reviews.trustpilot": {
    id: "crawl4ai.trustpilot.business.reviews",
    label: "Trustpilot reviews",
    kind: "reviews",
    usd: 0.00135,
    ttl: 3 * D,
    timeout: 75000,
    build: ({ domain, page = 1 }) => ({ body: { domain, page } }),
    parse: (raw, p) => N.trustpilotReviews(raw, p),
  },
  "maps.search": {
    id: "treg.google.serp.maps",
    label: "Google Maps places",
    kind: "places",
    usd: 0.00015,
    ttl: 7 * D,
    build: ({ q, country }) => ({ body: { q, ...(country ? { country: country.toLowerCase() } : {}) } }),
    parse: (raw) => N.places(raw),
  },
  "reviews.maps": {
    id: "crawl4ai.google.maps.reviews",
    label: "Google reviews",
    kind: "reviews",
    usd: 0.00015,
    ttl: 3 * D,
    timeout: 40000,
    build: ({ placeId, limit = 60, sort = "newest" }) => ({ body: { place: placeId, limit, sort } }),
    parse: (raw, p) => N.mapsReviews(raw, p),
  },
  "amazon.search": {
    id: "crawl4ai.amazon.search.products",
    label: "Amazon products",
    kind: "products",
    usd: 0.0135,
    ttl: 3 * D,
    timeout: 30000,
    build: ({ q, country = "us", limit = 20 }) => ({ body: { keywords: q, country: String(country).toLowerCase(), limit } }),
    parse: (raw, p) => N.amazonProducts(raw, p),
  },
  // amazon.com listings only.
  "reviews.amazon": {
    id: "crawl4ai.amazon.product.reviews",
    label: "Amazon reviews",
    kind: "reviews",
    usd: 0.00015,
    ttl: 3 * D,
    timeout: 40000,
    build: ({ asin, limit = 40 }) => ({ body: { product: asin, limit } }),
    parse: (raw, p) => N.amazonReviews(raw, p),
  },

  /* --------------------------------------------------------------- creators */
  "creators.search": {
    id: "influencersclub.creators.search",
    label: "Creator index",
    kind: "creators",
    // Billed per creator returned.
    usd: 0.006,
    perResult: true,
    ttl: 72 * H,
    timeout: 40000,
    build: ({ platform = "instagram", filters = {}, brief, limit = 20, page = 0 }) => ({
      body: { platform, filters, paging: { limit, page }, ...(brief ? { nlp_search: brief } : {}) },
    }),
    maxCost: ({ limit = 20 }) => Math.min(0.5, limit * 0.006 * 1.3 + 0.01),
    parse: (raw, { platform = "instagram" }) => N.creators(raw, platform),
  },
};

export const capPrice = (name, params = {}, count = 1) => {
  const cap = CAPS[name];
  if (!cap) return 0;
  return cap.perResult ? cap.usd * Math.max(count || 0, 1) : cap.usd;
};

// TikTok publishes trending boards for these markets only.
export const TIKTOK_REGIONS = ["US", "FR", "DE", "IT", "ES", "GB", "AR", "AU", "BR", "CA", "CO", "EG", "ID", "IL", "JP", "KR", "MY", "MX", "PH", "SA", "SG", "ZA", "TW", "TH", "TR", "AE", "VN"];

export const TIKTOK_INDUSTRIES = {
  beauty: "beauty_personal_care",
  skincare: "beauty_personal_care",
  makeup: "beauty_personal_care",
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
