import { anthropic, assertUsable, isMock, textOf } from "./client";
import { fail } from "./errors";
import { MODELS, SONNET_FALLBACK, estimateUsd } from "./models";
import { recordUsage } from "./usage";
import {
  delay,
  mockHosts,
  mockQueries,
  mockQuick,
  mockRanks,
  mockRewrite,
  mockSearchText,
  mockWrite,
} from "./mock";
import {
  brandDraftJob,
  buildRewriteRequest,
  buildSearchPrompt,
  buildWriteRequest,
  parseSearchBlock,
  rankJob,
  searchInstructionJob,
  tidyBriefJob,
} from "../prompts";
import { REGION_COUNTRY, normaliseRegions } from "../constants";

// The most one search may spend before it stops continuing. A typical search
// costs $0.20 to $0.40.
const searchCeilingUsd = () => Number(process.env.HUESY_SEARCH_USD_CAP) || 0.6;

const sum = (a, b) => ({
  input_tokens: (a.input_tokens || 0) + (b?.input_tokens || 0),
  output_tokens: (a.output_tokens || 0) + (b?.output_tokens || 0),
  cache_read_input_tokens: (a.cache_read_input_tokens || 0) + (b?.cache_read_input_tokens || 0),
  cache_creation_input_tokens: (a.cache_creation_input_tokens || 0) + (b?.cache_creation_input_tokens || 0),
  server_tool_use: {
    web_search_requests:
      (a.server_tool_use?.web_search_requests || 0) + (b?.server_tool_use?.web_search_requests || 0),
  },
});

/* ================================================================ writing == */

export async function runWrite({ platform, signal, brand, options, images }, user) {
  const req = buildWriteRequest({ platform, signal, brand, options, images });
  if (!req) throw fail("bad_request", 400);

  if (isMock()) {
    await delay(platform === "instagram" ? 1400 : 800);
    await recordUsage({ userId: user?.id, kind: `write:${platform}`, model: MODELS.write.id, mock: true });
    return { text: mockWrite(platform, signal, brand) };
  }

  const message = await anthropic().beta.messages.create({
    model: MODELS.write.id,
    max_tokens: platform === "instagram" ? 8000 : 4000,
    output_config: { effort: MODELS.write.effort },
    ...SONNET_FALLBACK,
    system: req.system,
    messages: [{ role: "user", content: req.content }],
  });
  assertUsable(message);
  await recordUsage({ userId: user?.id, kind: `write:${platform}`, model: message.model, usage: message.usage });
  return { text: textOf(message).trim() };
}

export async function runRewrite(input, user) {
  const req = buildRewriteRequest(input);

  if (isMock()) {
    await delay(700);
    await recordUsage({ userId: user?.id, kind: "rewrite", model: MODELS.write.id, mock: true });
    return { text: mockRewrite(input) };
  }

  const message = await anthropic().beta.messages.create({
    model: MODELS.write.id,
    max_tokens: 6000,
    output_config: { effort: MODELS.write.effort },
    ...SONNET_FALLBACK,
    system: req.system,
    messages: [{ role: "user", content: req.content }],
  });
  assertUsable(message);
  await recordUsage({ userId: user?.id, kind: "rewrite", model: message.model, usage: message.usage });
  return { text: textOf(message).trim() };
}

/* ============================================================ quick jobs == */

const QUICK_JOBS = {
  tidy: (input) => tidyBriefJob(input),
  "brand-draft": (input) => brandDraftJob(input || {}),
  instruction: (input) => searchInstructionJob(input || {}),
};

export async function runQuick(job, input, user) {
  const build = QUICK_JOBS[job];
  if (!build) throw fail("bad_request", 400);
  const { prompt, schema } = build(input);

  if (isMock()) {
    await delay(job === "brand-draft" ? 1100 : 600);
    await recordUsage({ userId: user?.id, kind: job, model: MODELS.quick.id, mock: true });
    const out = mockQuick(job, input);
    return schema ? { data: out } : { text: out };
  }

  const message = await anthropic().messages.create({
    model: MODELS.quick.id,
    max_tokens: 4000,
    output_config: schema
      ? { effort: MODELS.quick.effort, format: { type: "json_schema", schema } }
      : { effort: MODELS.quick.effort },
    messages: [{ role: "user", content: prompt }],
  });
  assertUsable(message);
  await recordUsage({ userId: user?.id, kind: job, model: message.model, usage: message.usage });
  const text = textOf(message).trim();
  if (!schema) return { text };
  try {
    return { data: JSON.parse(text) };
  } catch {
    throw fail("failed", 502);
  }
}

/* ================================================================ ranking == */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(n) || lo)));

export async function rankSignals(brand, signals, user) {
  const list = (signals || []).filter((s) => s?.id && s?.headline);
  if (!list.length) return [];

  if (isMock()) {
    await delay(900);
    await recordUsage({ userId: user?.id, kind: "rank", model: MODELS.quick.id, mock: true });
    return mockRanks(list);
  }

  const { prompt, schema } = rankJob(brand, list);
  const message = await anthropic().messages.create({
    model: MODELS.quick.id,
    max_tokens: 6000,
    output_config: { effort: MODELS.quick.effort, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });
  assertUsable(message);
  await recordUsage({ userId: user?.id, kind: "rank", model: message.model, usage: message.usage });

  const parsed = JSON.parse(textOf(message) || "{}");
  return (parsed.ranks || [])
    .filter((r) => Number.isInteger(r.i) && list[r.i])
    .map((r) => ({
      id: list[r.i].id,
      fit: clamp(r.fit, 1, 5),
      angle: String(r.angle || "").trim().slice(0, 160),
    }));
}

/* ================================================================ search == */

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// Reads the model's text as it streams and hands back each finished item.
// An item is finished when the separator line after it has fully arrived.
function itemReader(onItem) {
  let buffer = "";
  const seen = new Set();
  const emit = (block) => {
    const item = parseSearchBlock(block);
    if (!item) return;
    const key = item.headline.toLowerCase().replace(/\W+/g, " ").trim();
    if (seen.has(key)) return;
    seen.add(key);
    onItem(item);
  };
  return {
    push(text) {
      buffer += text;
      let m;
      while ((m = buffer.match(/\n[ \t]*-{3,}[ \t]*\n/))) {
        emit(buffer.slice(0, m.index));
        buffer = buffer.slice(m.index + m[0].length);
      }
    },
    end() {
      if (buffer.trim()) emit(buffer);
      buffer = "";
    },
    count: () => seen.size,
  };
}

export async function runSearch({ config, brand, user, send, abort }) {
  const signals = [];
  const reader = itemReader((item) => {
    if (isMock()) item.sample = true;
    signals.push(item);
    send({ t: "signal", signal: item });
  });

  const platforms = (config?.researchPlatforms || ["google"]).length;
  send({ t: "status", text: "Planning where to look" });

  if (isMock()) {
    const niche = String(config?.niche || "");
    const slow = niche.includes("#slow") ? 3 : 1;
    for (const [i, q] of mockQueries(config).entries()) {
      await delay(500 * slow);
      send({ t: "query", q });
      send({ t: "reading", hosts: mockHosts[i % mockHosts.length] });
    }
    if (niche.includes("#fail")) throw fail("network", 503);
    if (!niche.includes("#empty")) {
      const text = mockSearchText(config, brand);
      for (let i = 0; i < text.length; i += 90) {
        if (abort?.aborted) return;
        reader.push(text.slice(i, i + 90));
        await delay(28 * slow);
      }
    }
    reader.end();
    await recordUsage({ userId: user?.id, kind: "search", model: MODELS.research.id, mock: true });
  } else {
    const regions = normaliseRegions(config?.researchLocations);
    const country = regions.length === 1 ? REGION_COUNTRY[regions[0]] : null;
    const tools = [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 6 + 3 * platforms,
        ...(country ? { user_location: { type: "approximate", country } } : {}),
      },
    ];
    const prompt = buildSearchPrompt(config, brand);
    let messages = [{ role: "user", content: prompt }];
    let usage = {};
    let model = MODELS.research.id;
    const asked = new Set();
    const sendQuery = (q) => {
      const text = String(q).slice(0, 140);
      if (asked.has(text)) return;
      asked.add(text);
      send({ t: "query", q: text });
    };

    for (let turn = 0; turn < 4; turn++) {
      const stream = anthropic().beta.messages.stream(
        {
          model: MODELS.research.id,
          max_tokens: 16000,
          output_config: { effort: MODELS.research.effort },
          ...SONNET_FALLBACK,
          tools,
          messages,
        },
        { signal: abort }
      );

      const queries = new Map();
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "server_tool_use" && block.name === "web_search") {
            // A search run from code arrives whole; a direct one streams in.
            if (block.input?.query) sendQuery(block.input.query);
            else queries.set(event.index, "");
          } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            const hosts = [...new Set(block.content.map((r) => hostOf(r.url)).filter(Boolean))].slice(0, 3);
            if (hosts.length) send({ t: "reading", hosts });
          } else if (block.type === "text") reader.push("\n");
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") reader.push(event.delta.text);
          else if (event.delta.type === "input_json_delta" && queries.has(event.index)) {
            queries.set(event.index, queries.get(event.index) + event.delta.partial_json);
          }
        } else if (event.type === "content_block_stop" && queries.has(event.index)) {
          try {
            const q = JSON.parse(queries.get(event.index) || "{}").query;
            if (q) sendQuery(q);
          } catch {
            /* a partial tool input is not worth reporting */
          }
          queries.delete(event.index);
        }
      }

      const final = await stream.finalMessage();
      usage = sum(usage, final.usage);
      model = final.model || model;
      if (final.stop_reason === "refusal") throw fail("declined", 422);
      if (final.stop_reason !== "pause_turn") break;
      // A paused search may carry on, but never past the per search ceiling:
      // what it found so far is kept.
      if (estimateUsd(model, usage) >= searchCeilingUsd()) break;
      // The server's search loop paused. Send the turn back unchanged and it
      // carries on from where it stopped.
      messages = [
        { role: "user", content: prompt },
        { role: "assistant", content: final.content },
      ];
    }
    reader.end();
    await recordUsage({ userId: user?.id, kind: "search", model, usage });
  }

  if (signals.length) {
    send({ t: "status", text: `Ranking these for ${brand?.brandName || "your brand"}` });
    try {
      const ranks = await rankSignals(brand, signals, user);
      send({ t: "ranked", ranks });
    } catch (err) {
      console.error("[huesy:rank]", err?.message || err);
    }
  }
  send({ t: "done", count: signals.length });
}
