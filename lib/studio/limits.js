import { fail } from "../ai/errors";

// Per-piece limits that keep the studio generous but bounded.
export const LIMITS = {
  ideaRounds: 5,
  creativeVisuals: 4,
  carouselImageRedos: 3,
  carouselImages: 2,
};

export const limitError = (message) => Object.assign(fail("allowance_used", 402), { message });

export const allowanceMessage = (kind, left, resetsAt) => {
  const when = resetsAt ? new Date(resetsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "your next month";
  const names = { creative: "creatives", carousel: "carousels", reel: "reels" };
  return left > 0 ? null : `You've used this month's ${names[kind]}. They reset on ${when}.`;
};
