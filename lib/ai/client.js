import Anthropic from "@anthropic-ai/sdk";
import { fail } from "./errors";

// HUESY_AI_MOCK=1 swaps every model call for the stand-in in ./mock.js: the
// same shapes, realistic timing, no network and no spend. QA runs on it.
export const isMock = () => process.env.HUESY_AI_MOCK === "1";

let cached = null;

export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw fail("not_connected", 503);
  if (!cached) {
    cached = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 2,
      timeout: 240_000,
    });
  }
  return cached;
}

// Responses can start with thinking blocks, so text is read by block type.
export const textOf = (message) =>
  (message?.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

export function assertUsable(message) {
  if (message?.stop_reason === "refusal") throw fail("declined", 422);
}
