import Anthropic from "@anthropic-ai/sdk";

// Every AI failure reaches the person as one of these. The real error goes to
// the server log; the screen gets a plain sentence and, where it helps, what
// to do next. Codes are stable so the UI can offer the right button.

export class HuesyError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const MESSAGES = {
  not_connected: "My writing desk isn't switched on yet. It will be soon.",
  out_of_credit: "I've paused writing for a moment while my credit is topped up.",
  busy: "Lots of people are asking at once. Give me a minute and try again.",
  network: "I couldn't reach my sources just now. Try again.",
  declined: "I can't help with that one. Try different wording.",
  daily_limit: "That's today's allowance used. It resets at midnight UTC.",
  sign_in: "Sign in to use Huesy.",
  waitlist: "You're on the list. Huesy opens in the order people joined.",
  bad_request: "Something in that request didn't look right. Try again.",
  failed: "Something went wrong on my side. Try again.",
  no_plan: "Pick a plan to use this. Your brand and everything you've saved stay right here.",
  studio_only: "Making content is part of Studio. Upgrade to use it.",
  no_credits: "That needs more credits than you have left this month.",
  allowance_used: "You've used this month's allowance for that. It resets with your next month.",
  text_fair_use: "That's 30 posts written today. Writing opens again tomorrow.",
  seats_full: "Every Studio seat is taken. You're on the list for the next one.",
  not_found: "I couldn't find that. It may have been deleted.",
  data_unavailable: "I couldn't read that platform just now. Try again in a minute.",
  no_data: "I couldn't find enough recent posts for this, so it's free. Try a broader topic or another platform.",
  no_competitors: "I need at least one competitor to compare. Add a name, an @handle or a link, and nothing is charged until you do.",
  busy: "I'm still answering this question. It will be in this conversation in a moment, and asking again won't be charged.",
};

export const fail = (code, status) => new HuesyError(code, MESSAGES[code] || MESSAGES.failed, status);

export function toFriendly(err) {
  if (err instanceof HuesyError) return err;

  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return fail("not_connected", 503);
  }
  if (err instanceof Anthropic.RateLimitError) return fail("busy", 429);
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit balance|billing|quota/i.test(err.message || "")) return fail("out_of_credit", 503);
    return fail("bad_request", 400);
  }
  if (err instanceof Anthropic.InternalServerError) return fail("busy", 503);
  if (err instanceof Anthropic.APIConnectionError) return fail("network", 503);
  if (err instanceof Anthropic.APIError) return fail("failed", 502);
  return fail("failed", 500);
}

export function errorJson(err) {
  const f = toFriendly(err);
  if (!(err instanceof HuesyError)) console.error("[huesy:ai]", err?.status || "", err?.message || err);
  return { body: { error: { code: f.code, message: f.message } }, status: f.status };
}
