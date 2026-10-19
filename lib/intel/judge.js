import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { brandBrief } from "./brand";
import { countryName } from "./market";

// What a search brings back is judged before anyone sees it. A search for a
// market's words also returns company profiles, grant lists and other
// industries; a search for a brand called Plum or Minimalist returns recipes
// and weddings. One fast call (Haiku, under $0.001 for 100 short lines) keeps
// what is really about the market or the brand. If the call fails, the
// caller's simpler rule decides instead.

const SCHEMA = {
  type: "object",
  properties: { keep: { type: "array", items: { type: "integer" } } },
  required: ["keep"],
  additionalProperties: false,
};
const MAX = 100;

const lineOf = (x) => {
  const where = x.kind === "article" ? x.source || "news" : x.platform || "post";
  const words = String(x.title || x.caption || x.text || "").replace(/\s+/g, " ").trim().slice(0, 220);
  return `[${where}] ${words}`;
};

async function keep(items, prompt, { user, kind }) {
  const list = items.slice(0, MAX);
  const message = await anthropic().messages.create({
    model: MODELS.quick.id,
    max_tokens: 800,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: `${prompt}\n\n${list.map((x, i) => `${i + 1}. ${lineOf(x)}`).join("\n")}\n\nReturn the numbers to keep, or an empty list if none.`,
      },
    ],
  });
  await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind, model: message.model, usage: message.usage });
  const picked = new Set((JSON.parse(textOf(message) || "{}").keep || []).map((n) => Number(n) - 1));
  return list.filter((_, i) => picked.has(i));
}

// News from a search for the market's own words: kept when someone marketing
// the brand would want to know it this week.
export async function marketNews(articles, { ctx, map, user, fallback }) {
  if (!articles.length || isMock()) return fallback(articles);
  try {
    const where = map?.country ? countryName(map.country) : null;
    const prompt = `${brandBrief(ctx)}
Market: ${map?.summary || ctx?.niche || "not given"}${where ? `, in ${where}` : ""}.

These news stories came back from a search for this market. Keep the ones a person marketing this brand would want to know about this week: its category and market, products like its own, competitors, the shops and channels it sells through, its customers, or rules that affect it${where ? ` (in ${where} or worldwide)` : ""}. Leave out company profiles, stock pages, grant and job lists, and other industries.`;
    return await keep(articles, prompt, { user, kind: "news-judge" });
  } catch (err) {
    console.error("[huesy:judge] news check failed", err?.message || err);
    return fallback(articles);
  }
}

// Posts and stories that matched a brand's name: kept when they are about
// that brand, not another meaning of the word or a company with a like name.
export async function brandMentions(items, { name, alias = null, niche, user, fallback }) {
  if (!items.length || isMock()) return fallback(items);
  const prompt = `These posts and news stories matched a search for "${name}"${alias ? ` (people often call it "${alias}")` : ""}, a brand in ${niche || "its market"}. Keep the ones that are about this brand: its products, ads, deals, campaigns, news, or people talking about using it. Leave out other meanings of the word and other companies with a similar name.`;
  try {
    return await keep(items, prompt, { user, kind: "mention-judge" });
  } catch (err) {
    console.error("[huesy:judge] mention check failed", err?.message || err);
    return fallback(items);
  }
}
