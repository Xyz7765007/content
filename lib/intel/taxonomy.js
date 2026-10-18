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

export const FORMATS = {
  reel: "Reels",
  carousel: "Carousels",
  image: "Single images",
  video: "Videos",
  short: "Shorts",
  text: "Text posts",
};

export const PLATFORMS = [
  { id: "instagram", label: "Instagram", formats: ["reel", "carousel", "image"] },
  { id: "tiktok", label: "TikTok", formats: ["video"] },
  { id: "youtube", label: "YouTube", formats: ["short", "video"] },
  { id: "linkedin", label: "LinkedIn", formats: ["text", "carousel", "image", "video"] },
  { id: "x", label: "X", formats: ["text", "image", "video"] },
];

export const hookLabel = (id) => HOOKS.find((h) => h.id === id)?.label || "Other";
export const angleLabel = (id) => ANGLES.find((a) => a.id === id)?.label || "Other";
export const formatLabel = (id) => FORMATS[id] || id;
export const platformLabel = (id) => PLATFORMS.find((p) => p.id === id)?.label || id;

// Video lengths grouped the way people plan them.
export const lengthBucket = (s) => {
  if (s == null) return null;
  if (s < 15) return "under 15s";
  if (s < 30) return "15-30s";
  if (s < 60) return "30-60s";
  if (s < 180) return "1-3 min";
  return "over 3 min";
};
