// The studio's choices, shared by the server (which validates them) and the
// screens (which offer them), so the two can never disagree.

export const STUDIO_TYPES = {
  creative: {
    label: "Creative",
    plural: "Creatives",
    blurb: "One image post with words on it, built on an opening that works.",
    platforms: ["instagram", "linkedin", "x"],
  },
  carousel: {
    label: "Carousel",
    plural: "Carousels",
    blurb: "A swipeable set of slides, shaped like the carousels that get saved.",
    platforms: ["instagram", "linkedin"],
  },
  reel: {
    label: "Reel",
    plural: "Reels",
    blurb: "A short video, briefed from proven reels and made for you in 24 hours.",
    platforms: ["instagram", "tiktok", "youtube"],
  },
  text: {
    label: "Post",
    plural: "Posts",
    blurb: "A caption, post, thread or newsletter, opening the way your niche responds to.",
    platforms: ["instagram", "linkedin", "twitter", "email"],
  },
};

// Text platforms keep the ids the writer has always used.
export const TEXT_PLATFORM_LABELS = {
  instagram: "Instagram caption",
  linkedin: "LinkedIn post",
  twitter: "X post",
  email: "Newsletter",
};

// Where a text post's evidence comes from: the platform it is measured on.
export const TEXT_EVIDENCE_PLATFORM = { instagram: "instagram", linkedin: "linkedin", twitter: "x", email: "linkedin" };

export const REEL_STYLES = {
  faceless: { label: "Faceless", desc: "B-roll and product shots with a voiceover", prompt: "Faceless: b-roll and product shots with a voiceover" },
  talking: { label: "Talking head", desc: "A script you film yourself", prompt: "Talking head: a script the brand films itself" },
  ugc: { label: "UGC style", desc: "A real person's honest take", prompt: "UGC style: a real person's honest take" },
  text: { label: "Text on screen", desc: "Captions and visuals, little or no voice", prompt: "Text on screen: captions and visuals, little or no voice" },
  tutorial: { label: "Tutorial", desc: "Step by step, hands and product", prompt: "Tutorial: step by step, hands and product" },
};

export const REEL_GOALS = ["Reach new people", "Sales", "Followers", "Saves and shares", "Launch something"];

export const CREATIVE_LAYOUTS = ["statement", "split", "frame", "quote", "minimal"];
export const LAYOUT_LABELS = {
  statement: "Headline on photo",
  split: "Photo and panel",
  frame: "Framed photo",
  quote: "Words only",
  minimal: "Quiet",
};

export const SLIDE_LAYOUTS = ["hook", "list", "tip", "stat", "quote", "compare", "image", "cta"];
export const SLIDE_LABELS = {
  hook: "Opening",
  list: "List",
  tip: "Point",
  stat: "Number",
  quote: "Quote",
  compare: "Before and after",
  image: "Photo",
  cta: "Call to action",
};

export const ASPECTS = {
  "4:5": { w: 1080, h: 1350, label: "Portrait 4:5" },
  "1:1": { w: 1080, h: 1080, label: "Square 1:1" },
  "9:16": { w: 1080, h: 1920, label: "Story 9:16" },
};

// Colour themes for creatives and carousels: background, text, accent, soft.
export const THEMES = {
  blush: { label: "Blush", bg: "#fbe7ec", ink: "#1d1a19", accent: "#e8577a", soft: "#ffffff" },
  ink: { label: "Ink", bg: "#1b1918", ink: "#fcf5ef", accent: "#ffc2d1", soft: "#2a2725" },
  paper: { label: "Paper", bg: "#f7f3ee", ink: "#1d1a19", accent: "#3d6b5f", soft: "#ffffff" },
  mist: { label: "Mist", bg: "#e5edf3", ink: "#17212b", accent: "#2f6d9e", soft: "#ffffff" },
  sun: { label: "Sun", bg: "#ffd84d", ink: "#1d1a19", accent: "#1d1a19", soft: "#fff3c4" },
};
export const themeOf = (id) => THEMES[id] || THEMES.blush;
