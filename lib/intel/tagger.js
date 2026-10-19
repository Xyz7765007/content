import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { ANGLES, CTAS, HOOKS } from "./taxonomy";

// Labels every post: how it hooks, its angle, its topic, and how relevant it
// is to the brand's niche (1-5). The stats then group by these labels.
//
// Haiku 5.5 labels 25 posts per call. Jev (typed decisions, much cheaper)
// takes over when JEV_API_KEY and JEV_API_BASE are both set; the base is never
// assumed, because a key is only ever sent to an endpoint the owner confirmed.
// If the model can't be reached, rules read the caption instead, so an
// analysis never stops for want of labels.

const HOOK_IDS = HOOKS.map((h) => h.id);
const ANGLE_IDS = ANGLES.map((a) => a.id);
const CTA_IDS = CTAS.map((c) => c.id);

// Rules: good enough to keep going, and exactly right for the stand-in's posts.
export function ruleTags(p, niche = "") {
  const c = String(p.caption || "").toLowerCase().trim();
  const first = c.split("\n")[0];
  const has = (re) => re.test(first);
  let hook = "other";
  if (has(/\bday \d+\b.*\bvs\b|\bbefore\b.*\bafter\b|\bresults? after\b/)) hook = "before_after";
  else if (has(/^pov\b|^when you\b|^me when\b/)) hook = "pov";
  else if (has(/^\d+\s|\b\d+ (ways|tips|mistakes|things|steps|reasons)\b/)) hook = "number_list";
  else if (has(/\bmyth\b|\bthe truth\b|\bactually\b.*\bresearch\b/)) hook = "myth_busting";
  else if (has(/^(stop|don't|never|quit)\b/)) hook = "contrarian";
  else if (has(/^how (to|we|i)\b|\bstep[- ]by[- ]step\b|\btutorial\b/) && !has(/how we make/)) hook = "how_to";
  else if (has(/how we make|behind the scenes|\bbts\b|start to finish/)) hook = "behind_scenes";
  else if (has(/\bvs\b|\bversus\b|which one wins/)) hook = "comparison";
  else if (has(/\?/)) hook = "question";
  else if (has(/tell me you|\btrend\b|\bmeme\b/)) hook = "trend_meme";
  else if (has(/\breviews?\b|\bcustomers?\b|\bsold out\b/)) hook = "social_proof";
  else if (has(/\bchallenge\b/)) hook = "challenge";
  else if (has(/\bi almost\b|\bmy story\b|\bwhen i\b|\bthis happened\b/)) hook = "story";
  else if (has(/\bthis (one )?(change|product|trick)\b|\bfixed\b|\bgame.?changer\b/)) hook = "bold_claim";

  let angle = "educational";
  if (/\b(shop|sale|% off|discount|link in bio|buy now|order)\b/.test(c)) angle = "promotional";
  else if (/\b(launch|announc|new collection|teams up|expands)\b/.test(c)) angle = "news";
  else if (["pov", "trend_meme", "challenge"].includes(hook)) angle = "entertaining";
  else if (hook === "story") angle = "inspirational";
  else if (/\b(comment|tell us|your turn|community|tag a friend)\b/.test(c)) angle = "community";

  const words = String(niche).toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const hits = words.filter((w) => c.includes(w)).length + (p.hashtags || []).filter((t) => words.some((w) => t.includes(w))).length;
  const relevance = words.length ? Math.min(5, 2 + hits) : 3;
  const topic = (p.hashtags || []).find((t) => !/^(fyp|foryou|explore|trending|viral|reels?)$/.test(t)) || words[0] || "";
  const cta = /\b(link in bio|shop now|buy|order now)\b/.test(c)
    ? "buy"
    : /\bcomment\b|tell (me|us)|what do you think|\?\s*$/.test(c)
      ? "comment"
      : /\b(save|share) this\b/.test(c)
        ? "save_share"
        : /\bfollow (for|me|us)\b/.test(c)
          ? "follow"
          : /\bdm\b|send (me|us) a message/.test(c)
            ? "dm"
            : /https?:\/\//.test(c)
              ? "link"
              : "none";
  return { hook, angle, topic, relevance, cta, by: "rules" };
}

const SCHEMA = {
  type: "object",
  properties: {
    tags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          hook: { type: "string", enum: HOOK_IDS },
          angle: { type: "string", enum: ANGLE_IDS },
          topic: { type: "string" },
          relevance: { type: "integer" },
          cta: { type: "string", enum: CTA_IDS },
        },
        required: ["i", "hook", "angle", "topic", "relevance", "cta"],
        additionalProperties: false,
      },
    },
  },
  required: ["tags"],
  additionalProperties: false,
};

const line = (p, i) => {
  const len = p.durationS ? `, ${Math.round(p.durationS)}s` : "";
  const caption = String(p.caption || "").replace(/\s+/g, " ").slice(0, 260);
  const tags = (p.hashtags || []).slice(0, 6).map((t) => `#${t}`).join(" ");
  return `${i}. [${p.platform} ${p.format}${len}] ${caption} ${tags}`.trim();
};

async function haikuBatch(batch, offset, { niche, brand, user }) {
  const hookList = HOOKS.map((h) => `${h.id}: ${h.desc}`).join("\n");
  const prompt = `Label each social media post below for a brand in this niche: ${niche || "general"}${brand ? ` (brand: ${brand})` : ""}.

For every post give:
- hook: how its first line or first seconds grab attention. One of:
${hookList}
- angle: ${ANGLE_IDS.join(", ")}
- topic: what it is about, 2 to 4 plain words
- relevance: 1 to 5, how relevant the post is to the niche above (5 = squarely in it, 1 = unrelated; a post that only shares a word with the niche is 1)
- cta: what it asks the reader to do at the end: ${CTA_IDS.join(", ")}

Posts:
${batch.map((p, k) => line(p, offset + k)).join("\n")}`;

  const message = await anthropic().messages.create({
    model: MODELS.quick.id,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  });
  await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind: "tag", model: message.model, usage: message.usage });
  return JSON.parse(textOf(message) || "{}").tags || [];
}

async function jevTag(p, { niche }) {
  const res = await fetch(`${process.env.JEV_API_BASE.replace(/\/$/, "")}/v1/systemone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.JEV_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.JEV_MODEL || "jev-1.13.0",
      state: `Niche: ${niche}\nPost (${p.platform} ${p.format}): ${String(p.caption || "").slice(0, 600)}`,
      questions: {
        hook: { type: "choice", instructions: "How does this post open?", criteria: Object.fromEntries(HOOKS.map((h) => [h.id, h.desc])) },
        angle: { type: "choice", instructions: "What is the post's angle?", criteria: Object.fromEntries(ANGLES.map((a) => [a.id, a.label])) },
        relevance: { type: "score", instructions: "How relevant is the post to the niche?", criteria: ["unrelated", "loosely related", "related", "clearly in the niche", "squarely in the niche"] },
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`jev ${res.status}`);
  const j = await res.json();
  const a = j.answers || j;
  return { hook: a.hook?.choice, angle: a.angle?.choice, relevance: (a.relevance?.score ?? 2) + 1 };
}

const jevReady = () => Boolean(process.env.JEV_API_KEY && process.env.JEV_API_BASE);

export async function tagPosts(posts, { niche = "", brand = "", user = null } = {}) {
  if (!posts.length) return posts;
  if (isMock()) return posts.map((p) => ({ ...p, tags: ruleTags(p, niche) }));

  if (jevReady()) {
    const out = [];
    for (let k = 0; k < posts.length; k += 8) {
      const slice = posts.slice(k, k + 8);
      const answers = await Promise.allSettled(slice.map((p) => jevTag(p, { niche })));
      slice.forEach((p, j) => {
        const rules = ruleTags(p, niche);
        const a = answers[j].status === "fulfilled" ? answers[j].value : null;
        out.push({ ...p, tags: a ? { ...rules, ...a, topic: rules.topic, by: "jev" } : rules });
      });
    }
    return out;
  }

  const size = 30;
  const batches = [];
  for (let k = 0; k < posts.length; k += size) batches.push([k, posts.slice(k, k + size)]);
  const labels = new Map();
  const results = await Promise.allSettled(batches.map(([offset, batch]) => haikuBatch(batch, offset, { niche, brand, user })));
  for (const r of results) if (r.status === "fulfilled") for (const t of r.value) labels.set(t.i, t);
  return posts.map((p, i) => {
    const t = labels.get(i);
    if (!t) return { ...p, tags: ruleTags(p, niche) };
    return {
      ...p,
      tags: {
        hook: HOOK_IDS.includes(t.hook) ? t.hook : "other",
        angle: ANGLE_IDS.includes(t.angle) ? t.angle : "educational",
        topic: String(t.topic || "").slice(0, 40),
        relevance: Math.max(1, Math.min(5, Number(t.relevance) || 3)),
        cta: CTA_IDS.includes(t.cta) ? t.cta : "none",
        by: "model",
      },
    };
  });
}
