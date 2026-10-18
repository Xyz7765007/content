// What each plan includes and what each paid action costs, in one place. The
// server enforces these; the browser shows them before every action.
//
// A credit is worth $0.0005 of what an action costs us, so a full month of
// 20,000 credits never costs more than $10. Each price below is the action's
// cost rounded up, which leaves room for the estimates being a little off.

export const PLANS = {
  tier1: {
    id: "tier1",
    name: "Intelligence",
    price: 47,
    credits: 20000,
    studio: false,
    blurb: "Trends, competitors, creators and answers for your niche.",
  },
  tier2: {
    id: "tier2",
    name: "Studio",
    price: 97,
    credits: 20000,
    studio: true,
    allowances: { creative: 10, carousel: 10, reel: 3 },
    textPerDay: 30,
    blurb: "Everything in Intelligence, plus content made from what's working.",
  },
};

export const PLAN_IDS = Object.keys(PLANS);
export const planById = (id) => PLANS[id] || null;

// Credits per action. Anything not listed is free.
export const PRICES = {
  ask: 100,
  report: 600,
  creators: 900,
  radar: 400,
  contact: 20,
  digest: 0,
};

export const ACTIONS = {
  ask: { label: "Question", unit: "a question" },
  report: { label: "Deep report", unit: "a deep report" },
  creators: { label: "Creator search", unit: "a creator search" },
  radar: { label: "Radar check", unit: "a radar check" },
  contact: { label: "Creator contact", unit: "a contact" },
  digest: { label: "Weekly briefing", unit: "a briefing" },
};

export const STUDIO_KINDS = {
  creative: { label: "Creatives", one: "creative" },
  carousel: { label: "Carousels", one: "carousel" },
  reel: { label: "Reels", one: "reel" },
};

// Read in the browser too, so it is a NEXT_PUBLIC_ variable.
export const tier2Seats = () => {
  const n = Number(process.env.NEXT_PUBLIC_TIER2_SEATS);
  return Number.isFinite(n) && n > 0 ? n : 100;
};

export const REELS = {
  dueHours: 24,
  // Past this, an undelivered reel goes back into the month's allowance.
  refundHours: 48,
  revisions: 1,
  // A reel "worked" when it passes this many views within seven days.
  successViews: 1500,
};

export const CREATIVE_VISUALS = 4;
export const CAROUSEL_IMAGE_REGENS = 3;

export const formatCredits = (n) => Number(n || 0).toLocaleString("en-US");
