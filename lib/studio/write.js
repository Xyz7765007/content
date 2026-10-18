import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS, SONNET_FALLBACK } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { fail } from "../ai/errors";
import { brandBrief } from "../intel/brand";
import { packBrief } from "./ground";
import { hookLabel, platformLabel } from "../intel/taxonomy";
import { CREATIVE_LAYOUTS as LAYOUTS, REEL_STYLES as REEL_STYLE_OPTIONS, SLIDE_LAYOUTS as SLIDES } from "./options";

// Everything the studio writes: text posts, creative concepts, carousel
// outlines and reel briefs. Each starts from the grounding pack, so it follows
// a pattern that is measured to work in the customer's niche, and says why.
// Real posts are references for structure and angle; their words are never
// copied.

const RULES = `How you write:
- Write as the brand, in its voice. Plain, human language. No stock phrases (game changer, elevate, unlock, dive in).
- Follow the proven pattern: its kind of opening, its structure. Use the examples only to understand why they work; never copy or closely paraphrase their words.
- Use the audience's own words where they fit.
- Never invent facts, numbers, prices, results or reviews about the brand. If a claim needs a number you don't have, write around it.
- The evidence numbers (reach multiples, sample sizes, percentages) are for you. They go only in "why" fields, never into the content people will see.
- Never use hyphens or dashes; write around them.`;

// Word limits the screens are designed for, kept in code too.
const words = (text, max) => {
  const w = String(text || "").trim().split(/\s+/).filter(Boolean);
  return w.length <= max ? w.join(" ") : w.slice(0, max).join(" ").replace(/[,;:]$/, "");
};

const SYSTEM = (ctx) => [
  { type: "text", text: `You are Huesy, the brand's social media writer. You make content built on what is proven to work in its niche right now.\n\n${RULES}` },
  { type: "text", text: brandBrief(ctx), cache_control: { type: "ephemeral" } },
];

async function structured({ ctx, user, kind, prompt, schema, maxTokens = 4000 }) {
  const message = await anthropic().beta.messages.create({
    model: MODELS.write.id,
    max_tokens: maxTokens,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    ...SONNET_FALLBACK,
    system: SYSTEM(ctx),
    messages: [{ role: "user", content: prompt }],
  });
  await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind, model: message.model, usage: message.usage });
  if (message.stop_reason === "refusal") throw fail("declined", 422);
  try {
    return JSON.parse(textOf(message) || "{}");
  } catch {
    throw fail("failed", 502);
  }
}

const brief = (pack, topic, goal) =>
  `${packBrief(pack)}\n\n${topic ? `Topic: ${topic}\n` : "Topic: pick the strongest one from the evidence for this brand.\n"}${goal ? `Goal: ${goal}\n` : ""}`;

/* ------------------------------------------------------------------ text -- */

const TEXT_TASKS = {
  instagram: `Write an Instagram caption. Return one section:

===CAPTION===
A hook in the first line that follows the proven opening, short paragraphs with line breaks, a natural call to action, then three to eight relevant hashtags on the last line.`,
  linkedin: `Write a LinkedIn post. Return one section:

===POST===
Under 1,300 characters. A first line that follows the proven opening, the insight, what it means for the reader, and a closing line that invites a reply. Short paragraphs. Three hashtags at most, or none.`,
  twitter: `Write for X. Return two sections:

===TWEET===
One post, 280 characters at most, opening the proven way. Punchy and specific.

===THREAD===
Up to three follow up posts that add something, each 280 characters at most, numbered 1/ 2/ 3/. If the single post is stronger alone, write exactly: none`,
  email: `Write a short newsletter email with merge fields such as {{first_name}}. Return two sections:

===SUBJECT===
A subject line that opens the proven way.

===BODY===
The email body with {{merge_fields}} in double braces, one clear point and one call to action.`,
};

export const TEXT_PLATFORMS = Object.keys(TEXT_TASKS);

function mockText(platform, pack, ctx, topic) {
  const t = topic || ctx.keywords[0];
  const hook = pack.pattern?.hook === "before_after" ? `Day 1 vs day 30 of a real ${t} routine` : pack.pattern?.hook === "question" ? `Why does your ${t} stop working after a month?` : `3 things nobody tells you about ${t}`;
  const sample = "(Sample text written by the stand-in.)";
  if (platform === "linkedin") return `===POST===\n${hook}.\n\nMost people quit before the results show. The ones who stick with it keep it simple.\n\nAt ${ctx.name}, we built for exactly that.\n\nWhat would you add?\n\n${sample}`;
  if (platform === "twitter") return `===TWEET===\n${hook}. The answer is simpler than you think.\n\n===THREAD===\n1/ Start with less.\n2/ Give it 30 days.\n3/ Keep what works.`;
  if (platform === "email") return `===SUBJECT===\n${hook}\n\n===BODY===\nHi {{first_name}},\n\n${hook}. Here is what we learned. ${sample}`;
  return `===CAPTION===\n${hook} ✨\n\nWe asked, you answered. Here's what actually worked.\n\nSave this for your next reset.\n\n#${t.replace(/\s+/g, "")} #routine #${ctx.name.replace(/\W+/g, "").toLowerCase()}`;
}

export async function writeText({ platform, pack, ctx, topic, goal, user, previous, feedback }) {
  if (!TEXT_TASKS[platform]) throw fail("bad_request", 400);
  if (isMock()) {
    await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind: `text:${platform}`, model: MODELS.write.id, mock: true });
    const text = mockText(platform, pack, ctx, topic);
    return feedback ? text.replace(/\n\n/, `\n\n(${String(feedback).split(".")[0]}.)\n\n`) : text;
  }
  const change = previous && feedback ? `\n\nThe current draft:\n${String(previous).slice(0, 4000)}\n\nRewrite it with this change: ${feedback}\nKeep the proven opening unless the change asks otherwise.` : "";
  const message = await anthropic().beta.messages.create({
    model: MODELS.write.id,
    max_tokens: 2000,
    output_config: { effort: "low" },
    ...SONNET_FALLBACK,
    system: SYSTEM(ctx),
    messages: [{ role: "user", content: `${brief(pack, topic, goal)}\n${TEXT_TASKS[platform]}${change}\n\nReturn exactly the sections asked for, with nothing before the first marker.` }],
  });
  await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind: `text:${platform}`, model: message.model, usage: message.usage });
  if (message.stop_reason === "refusal") throw fail("declined", 422);
  return textOf(message).trim();
}

/* ------------------------------------------------------------- creatives -- */

export const CREATIVE_LAYOUTS = LAYOUTS;

const CONCEPTS_SCHEMA = {
  type: "object",
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          headline: { type: "string" },
          subline: { type: "string" },
          visual: { type: "string" },
          layout: { type: "string", enum: CREATIVE_LAYOUTS },
          caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          why: { type: "string" },
        },
        required: ["headline", "subline", "visual", "layout", "caption", "hashtags", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["concepts"],
  additionalProperties: false,
};

function mockConcepts(pack, ctx, topic, count, avoid = []) {
  const t = topic || ctx.keywords[0];
  const pool = [
    { headline: `Day 1 vs day 30`, subline: `What a simple ${t} routine really does`, visual: `Two soft daylight close ups of the same bathroom shelf, before and after, calm neutral tones`, layout: "split" },
    { headline: `Why it stops working`, subline: `The ${t} mistake almost everyone makes`, visual: `A single product on a stone surface in warm morning light, lots of empty space`, layout: "statement" },
    { headline: `Less, but better`, subline: `3 steps. 30 days. Real results.`, visual: `Flat lay of three items on linen, top down, soft shadows`, layout: "frame" },
    { headline: `Save this for later`, subline: `Your ${t} reset, simplified`, visual: `Hands holding a small jar against a pastel wall`, layout: "minimal" },
    { headline: `Is your routine too long?`, subline: `Most people need half the steps`, visual: `A crowded shelf beside a nearly empty one, soft side light`, layout: "split" },
    { headline: `The 2-minute fix`, subline: `For days your ${t} goes wrong`, visual: `A timer and one product on a clean counter, morning light`, layout: "statement" },
    { headline: `"I wish I'd known sooner"`, subline: `What our customers tell us most`, visual: `Brand colour background, no photo`, layout: "quote" },
    { headline: `POV: it finally works`, subline: `No 10-step routine needed`, visual: `Relaxed hands on a towel by a sunny window, calm tones`, layout: "minimal" },
    { headline: `3 myths to drop today`, subline: `About ${t}, debunked`, visual: `Three small objects in a row on paper, top down, crisp light`, layout: "frame" },
  ];
  const seen = new Set(avoid.map((h) => String(h).toLowerCase()));
  const fresh = pool.filter((c) => !seen.has(c.headline.toLowerCase()));
  return (fresh.length >= count ? fresh : pool).slice(0, count).map((c) => ({
    ...c,
    caption: `${c.headline}. ${c.subline}.\n\nSave this and try it this week.\n\n(Sample concept from the stand-in.)`,
    hashtags: [t.replace(/\s+/g, ""), "routine", "selfcare"],
    why: pack.pattern ? `${pack.pattern.hookLabel} openings reach about ${pack.pattern.strength ?? "?"}x a typical post here (${pack.pattern.n} posts).` : "Built on general best practice: one clear promise, one image.",
  }));
}

export async function creativeConcepts({ pack, ctx, topic, goal, user, count = 3, avoid = [] }) {
  if (isMock()) return mockConcepts(pack, ctx, topic, count, avoid);
  const r = await structured({
    ctx,
    user,
    kind: "studio:concepts",
    schema: CONCEPTS_SCHEMA,
    prompt: `${brief(pack, topic, goal)}
Propose ${count} different concepts for a single image post on ${pack.platformLabel}, each built on the proven pattern above.
For each:
- headline: the words on the image, 8 words at most, opening the proven way
- subline: an optional second line on the image, 14 words at most (empty if not needed)
- visual: what the photo shows, for an image model: subject, setting, light, colours, composition. No text, logos or people's faces in close up unless essential.
- layout: statement (big headline over the photo), split (photo top, headline panel below), frame (photo inset, headline above), quote (text only on brand colour), minimal (small headline over full bleed photo)
- caption: the post caption for ${pack.platformLabel}, with a call to action
- hashtags: 3 to 8, without the # sign
- why: one sentence on why it should work, citing the pattern's number${avoid.length ? `\nDo not repeat these headlines: ${avoid.join(" | ")}` : ""}`,
  });
  return (r.concepts || []).slice(0, count).map((c) => ({
    ...c,
    headline: words(c.headline, 10),
    subline: words(c.subline, 16),
    layout: CREATIVE_LAYOUTS.includes(c.layout) ? c.layout : "statement",
    hashtags: (c.hashtags || []).map((h) => String(h).replace(/^#/, "")).slice(0, 8),
  }));
}

/* ------------------------------------------------------------- carousels -- */

export const SLIDE_LAYOUTS = SLIDES;

const CAROUSEL_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          layout: { type: "string", enum: SLIDE_LAYOUTS },
          headline: { type: "string" },
          body: { type: "string" },
          points: { type: "array", items: { type: "string" } },
          imagePrompt: { type: "string" },
        },
        required: ["layout", "headline", "body", "points", "imagePrompt"],
        additionalProperties: false,
      },
    },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    why: { type: "string" },
  },
  required: ["title", "slides", "caption", "hashtags", "why"],
  additionalProperties: false,
};

function mockCarousel(pack, ctx, topic, slides) {
  const t = topic || ctx.keywords[0];
  const middle = Array.from({ length: Math.max(3, slides - 2) }, (_, i) => ({
    layout: i === 1 ? "stat" : i === 2 ? "compare" : "tip",
    headline: [`Start with less`, `Give it 30 days`, `Before vs after`, `Keep what works`, `Skip the extras`, `Make it a habit`, `Track one thing`][i % 7],
    body: `One clear idea about ${t}, in two short lines that are easy to read on a phone.`,
    points: i === 2 ? ["Before: five steps, no results", "After: two steps, a routine you keep"] : [],
    imagePrompt: i === 0 ? `A calm flat lay about ${t}, soft daylight` : "",
  }));
  return {
    title: `${t}: what actually works`,
    slides: [
      { layout: "hook", headline: `5 ${t} mistakes you can stop today`, body: "Swipe for the fixes", points: [], imagePrompt: `Close up of a tidy shelf, morning light, soft neutral colours` },
      ...middle,
      { layout: "cta", headline: "Save this for your next reset", body: `Follow ${ctx.name} for more`, points: [], imagePrompt: "" },
    ].slice(0, slides),
    caption: `${t}, simplified. Save this.\n\n(Sample carousel from the stand-in.)`,
    hashtags: [t.replace(/\s+/g, ""), "tips", "routine"],
    why: pack.pattern ? `${pack.pattern.hookLabel} openings reach about ${pack.pattern.strength ?? "?"}x a typical post here (${pack.pattern.n} posts).` : "Built on general best practice for saves and shares.",
  };
}

export async function carouselOutline({ pack, ctx, topic, goal, user, slides = 7 }) {
  const n = Math.max(4, Math.min(10, slides));
  if (isMock()) return mockCarousel(pack, ctx, topic, n);
  const r = await structured({
    ctx,
    user,
    kind: "studio:carousel",
    schema: CAROUSEL_SCHEMA,
    maxTokens: 5000,
    prompt: `${brief(pack, topic, goal)}
Write a ${n} slide carousel for ${pack.platformLabel} built on the proven pattern above.
- Slide 1 is the hook (layout "hook"): it opens the proven way and makes people swipe.
- The middle slides deliver: one idea per slide. Layouts: list (points), tip, stat (only with a number from the topic, the brand's details or the must include; never an evidence number), quote (the audience's words), compare (points: two items, before and after or this and that), image.
- The last slide is the call to action (layout "cta").
- headline: 8 words at most. body: 25 words at most. points: up to 4 short items, empty when not used.
- imagePrompt: only on up to 2 slides that need a photo (describe it for an image model, no text in the image); empty string on all others.
- caption and 3 to 8 hashtags without the # sign.
- why: one sentence on why it should work, citing the pattern's number.`,
  });
  let imageSlots = 0;
  return {
    ...r,
    slides: (r.slides || []).slice(0, n).map((s) => {
      const wantsImage = Boolean(s.imagePrompt) && imageSlots < 2;
      if (wantsImage) imageSlots += 1;
      return {
        ...s,
        headline: words(s.headline, 12),
        body: words(s.body, 40),
        layout: SLIDE_LAYOUTS.includes(s.layout) ? s.layout : "tip",
        points: (s.points || []).slice(0, 4).map((p) => words(p, 16)),
        imagePrompt: wantsImage ? s.imagePrompt : "",
      };
    }),
    hashtags: (r.hashtags || []).map((h) => String(h).replace(/^#/, "")).slice(0, 8),
  };
}

/* ----------------------------------------------------------- reel briefs -- */

const REEL_SCHEMA = {
  type: "object",
  properties: {
    hooks: {
      type: "array",
      items: { type: "object", properties: { line: { type: "string" }, onScreen: { type: "string" }, why: { type: "string" } }, required: ["line", "onScreen", "why"], additionalProperties: false },
    },
    length: { type: "string" },
    structure: {
      type: "array",
      items: {
        type: "object",
        properties: { beat: { type: "string" }, seconds: { type: "string" }, voiceover: { type: "string" }, onScreen: { type: "string" }, visual: { type: "string" } },
        required: ["beat", "seconds", "voiceover", "onScreen", "visual"],
        additionalProperties: false,
      },
    },
    script: { type: "string" },
    shots: { type: "array", items: { type: "string" } },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    sound: { type: "object", properties: { pick: { type: "string" }, why: { type: "string" }, fallback: { type: "string" } }, required: ["pick", "why", "fallback"], additionalProperties: false },
    postingTip: { type: "string" },
    whyItWorks: { type: "string" },
  },
  required: ["hooks", "length", "structure", "script", "shots", "caption", "hashtags", "sound", "postingTip", "whyItWorks"],
  additionalProperties: false,
};

const STYLES = Object.fromEntries(Object.entries(REEL_STYLE_OPTIONS).map(([k, v]) => [k, v.prompt]));

export const REEL_STYLES = STYLES;

function mockReel(pack, ctx, request) {
  const t = request.topic || ctx.keywords[0];
  return {
    hooks: [
      { line: `Day 1 vs day 30 of my ${t} reset`, onScreen: "DAY 1 vs DAY 30", why: "Before and after openings lead this niche in the sample." },
      { line: `Why does your ${t} stop working?`, onScreen: "WHY IT STOPS WORKING", why: "Question hooks are the next strongest." },
      { line: `5 ${t} mistakes in 20 seconds`, onScreen: "5 MISTAKES", why: "Numbered lists hold attention to the end." },
    ],
    length: pack.length?.key ? `${pack.length.key}` : "about 25 seconds",
    structure: [
      { beat: "Hook", seconds: "0-2", voiceover: `Day 1 vs day 30 of my ${t} reset.`, onScreen: "DAY 1 vs DAY 30", visual: "Split screen, same shelf before and after" },
      { beat: "Problem", seconds: "2-7", voiceover: "I was doing too much and seeing nothing.", onScreen: "Too many steps", visual: "Hands sweeping products off a shelf" },
      { beat: "Turn", seconds: "7-17", voiceover: "So I cut it to three steps and stuck with it.", onScreen: "3 steps. 30 days.", visual: "Three products, one by one" },
      { beat: "Payoff", seconds: "17-23", voiceover: "Here's day 30.", onScreen: "Day 30", visual: "The after shot, slow push in" },
      { beat: "Call to action", seconds: "23-25", voiceover: `Save this and try it with ${ctx.name}.`, onScreen: "Save for your reset", visual: "Logo end card" },
    ],
    script: `Day 1 vs day 30 of my ${t} reset. I was doing too much and seeing nothing. So I cut it to three steps and stuck with it. Here's day 30. Save this and try it with ${ctx.name}.`,
    shots: ["Before: cluttered shelf", "Hands removing extra products", "Three hero products", "After: tidy shelf, soft light", "Logo end card"],
    caption: `Day 1 vs day 30. Less really is more.\n\nSave this for your reset. (Sample brief from the stand-in.)`,
    hashtags: [t.replace(/\s+/g, ""), "routine", "glowup"],
    sound: { pick: pack.sounds?.[0]?.title || "A calm trending instrumental", why: "Climbing this week and cleared for brand accounts.", fallback: "The platform's royalty free library, soft and upbeat" },
    postingTip: "Post between 6 and 9 pm on a weekday, and reply to the first comments within an hour.",
    whyItWorks: pack.pattern ? `${pack.pattern.hookLabel} openings reach about ${pack.pattern.strength ?? "?"}x a typical post in this niche (${pack.pattern.n} posts).` : "One clear transformation, shown fast.",
  };
}

export async function reelBrief({ pack, ctx, request, history, findings = [], user }) {
  if (isMock()) return mockReel(pack, ctx, request);
  // Whole conversations only, newest first, each dated.
  let room = 36000;
  const historyText = (history || [])
    .filter((t) => {
      const fits = t.transcript.length + t.title.length + 40 <= room;
      if (fits) room -= t.transcript.length + t.title.length + 40;
      return fits;
    })
    .map((t) => `## ${t.title} [${t.ageDays === 0 ? "today" : `${t.ageDays} days ago`}]\n${t.transcript}`)
    .join("\n\n");
  const factsText = findings.map((f) => `- [${f.ageDays === 0 ? "today" : `${f.ageDays}d ago`}, ${f.platform}] ${f.fact}`).join("\n");
  return structured({
    ctx,
    user,
    kind: "studio:reel",
    schema: REEL_SCHEMA,
    maxTokens: 6000,
    prompt: `${brief(pack, request.topic, request.goal)}
The reel request:
- Style: ${STYLES[request.style] || STYLES.faceless}
- Length wanted: ${request.length || "let the data decide"}
- Call to action: ${request.cta || "pick the natural one"}
- Must include: ${request.mustInclude || "nothing specific"}
- Voice: ${request.voice || "any"}; language: ${request.language || "English"}
- Reference links: ${(request.references || []).join(", ") || "none"}

What Huesy has measured for this brand (newest first, with age):
${factsText || "(nothing yet)"}

Their conversations with Huesy (newest first, dated):
${historyText || "(nothing yet)"}

How to weigh these: the measured evidence at the top of this message wins over anything older or from another platform. Use the conversations for the brand's products, audience, offers and decisions they've made, not for performance claims.

Write the production brief for this reel on ${platformLabel(pack.platform)}, built on the measured pattern:
- hooks: 3 different first lines (what is said, and the words on screen), each with why it should work, citing a number from the evidence
- length: the recommended length, from the evidence
- structure: the beats with timings (e.g. "0-2"), voiceover, on screen text and visual for each
- script: the full voiceover or spoken script
- shots: the shot list
- caption and 3 to 8 hashtags without the # sign
- sound: the pick (only a sound marked cleared for brand accounts in the evidence; otherwise "a track from the platform's commercial library" in the style that fits), why, and a fallback
- postingTip: how to post it (cover, first comment, replies). Only give a time of day if the evidence measured one; otherwise say timing is general advice
- whyItWorks: two sentences, citing the evidence's numbers and sample size. This is the only place evidence numbers may appear.
Never put reach multiples, sample sizes or invented results into the script, on-screen text or caption.`,
  });
}

export const hookName = hookLabel;
