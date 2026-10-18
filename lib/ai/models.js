// Which model does which job, in one place so a model change is one line.
//
// research  finds signals with the web search tool. The quality of everything
//           downstream depends on this step, so it stays on Sonnet, at medium
//           effort because it runs several searches before it writes.
// write     every post and every rewrite. Sonnet at low effort: short creative
//           writing gains little from long thinking.
// quick     small, well defined jobs: tidy a brief, draft a brand from one
//           line, write a search instruction, rank signals for a brand.
//           Haiku is about twenty times cheaper and holds quality on these.
//
// v1 wrote with Opus 4.6 and searched with Sonnet 4.6. Sonnet 5.5 costs less
// than either ($2/$10 per million tokens against $5/$25 and $3/$15).

export const MODELS = {
  research: { id: "claude-sonnet-5-5", effort: "medium" },
  write: { id: "claude-sonnet-5-5", effort: "low" },
  quick: { id: "claude-haiku-5-5", effort: "low" },
};

// USD per million tokens. Cache writes use the five minute rate.
const PRICES = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  // Where a declined Sonnet 5.5 request is retried (see SONNET_FALLBACK).
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
};

const WEB_SEARCH_USD = 0.01;

export function estimateUsd(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return 0;
  const tokens =
    (usage.input_tokens || 0) * p.input +
    (usage.output_tokens || 0) * p.output +
    (usage.cache_creation_input_tokens || 0) * p.cacheWrite +
    (usage.cache_read_input_tokens || 0) * p.cacheRead;
  const searches = (usage.server_tool_use?.web_search_requests || 0) * WEB_SEARCH_USD;
  return tokens / 1_000_000 + searches;
}

// Sonnet 5.5 can hand a declined request to Sonnet 5 on the server. Huesy
// writes marketing copy, so a decline is rare, but when one happens the user
// still gets a result instead of an empty card. Haiku has no fallback.
export const SONNET_FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};
