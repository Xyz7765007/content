// The deep reports, as the screens describe them. The server's data plans
// and budgets live in reports.js; the words and choices live here so both
// sides say the same thing.

export const REPORTS = {
  trends: {
    label: "Trend radar",
    blurb: "What's moving this week: the topics most accounts post about, the posts taking off, hashtags, sounds and the news.",
    platforms: ["all", "instagram", "tiktok", "youtube", "x", "linkedin", "reddit"],
    action: "report",
  },
  playbook: {
    label: "Content playbook",
    blurb: "What works in your niche, opening by opening: formulas from real posts, length, timing and calls to action.",
    platforms: ["instagram", "tiktok", "youtube", "x", "linkedin"],
    action: "report",
    focus: "format",
  },
  competitors: {
    label: "Competitor breakdown",
    blurb: "Each competitor across every platform they use, the ads they run, what reviewers say and who talks about them.",
    platforms: null,
    action: "report",
    handles: true,
  },
  audience: {
    label: "Audience voice",
    blurb: "What buyers ask, complain about and want, from forums, comments and reviews, counted.",
    platforms: null,
    action: "report",
    focus: "topic",
  },
  creators: {
    label: "Creator shortlist",
    blurb: "Creators in your niche on any platform, checked on what they post and ranked by fit, with contacts on request.",
    platforms: ["instagram", "tiktok", "youtube", "x", "linkedin"],
    action: "creators",
    focus: "topic",
    sizes: true,
  },
};

export const CREATOR_SIZES = {
  small: { label: "5k to 50k followers", min: 5000, max: 50000 },
  mid: { label: "50k to 250k followers", min: 50000, max: 250000 },
  large: { label: "250k to 1M followers", min: 250000, max: 1000000 },
};

export const reportLabel = (kind) => REPORTS[kind]?.label || (kind === "briefing" ? "Weekly briefing" : "Report");
