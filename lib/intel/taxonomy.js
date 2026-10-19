// The words Huesy uses to describe content, shared by the tagger (which labels
// every post), the stats (which group by them) and the screens (which show
// them). Ids are stable; labels are what people read.

export const HOOKS = [
  { id: "question", label: "Question hook", desc: "Opens on a question the viewer wants answered" },
  { id: "bold_claim", label: "Bold claim", desc: "A strong statement or promise up front" },
  { id: "contrarian", label: "Contrarian take", desc: "Goes against common advice" },
  { id: "number_list", label: "Numbered list", desc: "3 ways, 5 mistakes, 7 tips" },
  { id: "story", label: "Story", desc: "A personal or customer story" },
  { id: "how_to", label: "How-to", desc: "A tutorial or step-by-step" },
  { id: "before_after", label: "Before and after", desc: "A transformation or result" },
  { id: "pov", label: "POV / relatable", desc: "A relatable moment or point of view" },
  { id: "myth_busting", label: "Myth-busting", desc: "Corrects a common belief" },
  { id: "social_proof", label: "Social proof", desc: "Reviews, testimonials, numbers from others" },
  { id: "trend_meme", label: "Trend or meme", desc: "Rides a trend, sound or meme format" },
  { id: "behind_scenes", label: "Behind the scenes", desc: "How it's made, the team, the process" },
  { id: "comparison", label: "Comparison", desc: "This versus that" },
  { id: "challenge", label: "Challenge", desc: "Invites people to try something" },
  { id: "other", label: "Other", desc: "None of the above" },
];

export const ANGLES = [
  { id: "educational", label: "Educational" },
  { id: "entertaining", label: "Entertaining" },
  { id: "inspirational", label: "Inspirational" },
  { id: "promotional", label: "Promotional" },
  { id: "community", label: "Community" },
  { id: "news", label: "News" },
];

// What a post asks the reader to do at the end.
export const CTAS = [
  { id: "none", label: "No ask" },
  { id: "comment", label: "Asks for comments" },
  { id: "follow", label: "Asks to follow" },
  { id: "link", label: "Sends to a link" },
  { id: "save_share", label: "Asks to save or share" },
  { id: "buy", label: "Asks to buy" },
  { id: "dm", label: "Asks to DM" },
];
export const ctaLabel = (id) => CTAS.find((c) => c.id === id)?.label || "Other";

export const FORMATS = {
  reel: "Reels",
  carousel: "Carousels",
  image: "Single images",
  video: "Videos",
  short: "Shorts",
  text: "Text posts",
  link: "Link posts",
};

export const PLATFORMS = [
  { id: "instagram", label: "Instagram", formats: ["reel", "carousel", "image"] },
  { id: "tiktok", label: "TikTok", formats: ["video"] },
  { id: "youtube", label: "YouTube", formats: ["short", "video"] },
  { id: "linkedin", label: "LinkedIn", formats: ["text", "carousel", "image", "video"] },
  { id: "x", label: "X", formats: ["text", "image", "video"] },
  { id: "reddit", label: "Reddit", formats: ["text", "link", "image", "video"] },
  { id: "facebook", label: "Facebook", formats: ["text", "image", "video"] },
];

export const hookLabel = (id) => HOOKS.find((h) => h.id === id)?.label || "Other";
export const angleLabel = (id) => ANGLES.find((a) => a.id === id)?.label || "Other";
export const formatLabel = (id) => FORMATS[id] || id;
export const platformLabel = (id) => (id === "all" ? "all platforms" : PLATFORMS.find((p) => p.id === id)?.label || id);

// A person's page on a platform, from their handle, for when a source gives no link.
const PROFILE = {
  instagram: (h) => `https://www.instagram.com/${h}/`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => (/^UC[\w-]{22}$/.test(h) ? `https://www.youtube.com/channel/${h}` : `https://www.youtube.com/@${h}`),
  x: (h) => `https://x.com/${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}/`,
  reddit: (h) => `https://www.reddit.com/user/${h}/`,
  facebook: (h) => `https://www.facebook.com/${h}`,
};
export const profileUrl = (platform, handle) => {
  const h = String(handle || "").trim().replace(/^@/, "");
  return h && PROFILE[platform] ? PROFILE[platform](h) : null;
};

// How long a written post is, grouped the way each platform's writers plan it.
const TEXT_PLATFORMS = ["x", "linkedin", "reddit", "facebook", "threads"];
export const textBucket = (platform, caption) => {
  const body = String(caption || "").replace(/https?:\/\/\S+/g, "").trim();
  if (!body) return null;
  if (platform === "x") {
    const n = body.length;
    if (n < 100) return "under 100 characters";
    if (n < 200) return "100-200 characters";
    if (n <= 280) return "200-280 characters";
    return "over 280 characters";
  }
  const words = body.split(/\s+/).length;
  if (platform === "linkedin") {
    if (words < 50) return "under 50 words";
    if (words < 150) return "50-150 words";
    if (words < 300) return "150-300 words";
    return "over 300 words";
  }
  if (words < 50) return "under 50 words";
  if (words < 200) return "50-200 words";
  return "over 200 words";
};

export const slideBucket = (n) => (n == null ? null : n <= 5 ? "up to 5 slides" : n <= 10 ? "6-10 slides" : "over 10 slides");

// The length that matters for a post: seconds for video, slides for
// carousels and documents, words or characters for written posts.
export const lengthOf = (p) => {
  if (p.durationS != null) return lengthBucket(p.durationS);
  if (p.format === "carousel" && p.slides) return slideBucket(p.slides);
  if (TEXT_PLATFORMS.includes(p.platform) && ["text", "link", "image"].includes(p.format)) return textBucket(p.platform, p.caption);
  return null;
};

// When a post went out, in the market's local time.
export const SLOTS = ["early morning (5-9)", "morning (9-12)", "afternoon (12-16)", "evening (16-20)", "night (20-24)", "late night (0-5)"];
export const slotOf = (hour) => (hour == null ? null : hour < 5 ? SLOTS[5] : hour < 9 ? SLOTS[0] : hour < 12 ? SLOTS[1] : hour < 16 ? SLOTS[2] : hour < 20 ? SLOTS[3] : SLOTS[4]);
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Minutes east of UTC for each market's main business time zone.
export const TZ_OFFSET = { IN: 330, US: -300, GB: 60, AE: 240, AU: 600, SG: 480, CA: -240, DE: 120, FR: 120, SA: 180, ID: 420, MY: 480, PH: 480, BR: -180, MX: -360, JP: 540 };

// Video lengths grouped the way people plan them.
export const lengthBucket = (s) => {
  if (s == null) return null;
  if (s < 15) return "under 15s";
  if (s < 30) return "15-30s";
  if (s < 60) return "30-60s";
  if (s < 180) return "1-3 min";
  return "over 3 min";
};
