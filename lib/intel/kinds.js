// The deep reports, as the screens describe them. The server's data plans
// and budgets live in reports.js; the words and choices live here so both
// sides say the same thing.

export const REPORTS = {
  trends: {
    label: "Trend radar",
    blurb: "What's rising this week: hashtags, sounds, topics and formats.",
    platforms: ["instagram", "tiktok", "youtube", "linkedin", "x"],
    action: "report",
  },
  playbook: {
    label: "Content playbook",
    blurb: "What works in your niche, opening by opening, with examples and formulas.",
    platforms: ["instagram", "tiktok", "youtube", "linkedin", "x"],
    action: "report",
    focus: "format",
  },
  competitors: {
    label: "Competitor breakdown",
    blurb: "How your competitors post, what breaks out for them, and the gaps you can own.",
    platforms: ["instagram", "tiktok"],
    action: "report",
    handles: true,
  },
  audience: {
    label: "Audience voice",
    blurb: "What people ask, complain about and want, in their own words, counted.",
    platforms: ["instagram", "youtube"],
    action: "report",
    focus: "topic",
  },
  creators: {
    label: "Creator shortlist",
    blurb: "Creators in your niche, checked on their recent posts and ranked by fit.",
    platforms: ["instagram", "tiktok"],
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
