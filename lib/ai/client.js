import Anthropic from "@anthropic-ai/sdk";
import { fail } from "./errors";

// HUESY_AI_MOCK=1 swaps every model call for the stand-in in ./mock.js: the
// same shapes, realistic timing, no network and no spend. QA runs on it.
export const isMock = () => process.env.HUESY_AI_MOCK === "1";

let cached = null;

// Text clipped from posts can cut an emoji in half, and half an emoji makes the
// request body invalid (a 400 for the whole call). JSON.stringify writes such a
// half as a \udXXX escape while whole emoji stay literal, so every such escape
// in an outgoing body is a broken half and is dropped here, for every call.
const LONE = /\\u[dD][89a-fA-F][0-9a-fA-F]{2}/g;
export const cleanBody = (body) => (typeof body === "string" && LONE.test(body) ? body.replace(LONE, "") : body);
const cleanFetch = (url, init = {}) => fetch(url, init?.body ? { ...init, body: cleanBody(init.body) } : init);

export function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw fail("not_connected", 503);
  if (!cached) {
    cached = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 2,
      timeout: 240_000,
      fetch: cleanFetch,
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
