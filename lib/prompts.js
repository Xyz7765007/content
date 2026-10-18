// Every prompt Huesy sends, built on the server from structured inputs.
//
// Output shapes the rest of the app depends on:
// - search items: HEADLINE / BRAND / TYPE / SOURCE / URL / DATE / SUMMARY /
//   SIGNIFICANCE lines, items separated by a line of three dashes;
// - posts: ===SECTION=== markers, read by parseSections in lib/parse.js.
// Change wording freely; change those shapes only together with the parsers.
//
// Prompts are laid out for caching: the writer's rules and the brand block
// sit in `system` and never change during a run, reference images open the
// user turn, and only the signal and the task vary per call.

import {
  SIGNAL_TYPES,
  RESEARCH_PLATFORMS,
  DEFAULT_CREATIVE_DIRECTION,
  PLATFORMS,
  isGlobal,
  normaliseRegions,
} from "./constants";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const clean = (v, max = 1200) => String(v || "").trim().slice(0, max);

/* ================================================================ search == */

const PLATFORM_SEARCH = {
  google:
    "Google News: press coverage, announcements and trade publication stories.",
  instagram:
    "Instagram: campaign launches, collaborations, influencer partnerships and notable brand posts. Search for the brand and the campaign, and prefer coverage that links the post.",
  twitter:
    "X (Twitter): brand announcements, threads from brand accounts and industry voices, and moments people are talking about.",
};

export const SIGNAL_TYPE_LABELS = [
  "Launch",
  "Collab",
  "Campaign",
  "Expansion",
  "Repositioning",
  "Market move",
  "Controversy",
  "Other",
];

export function buildSearchPrompt(config, brand) {
  const {
    targetMode,
    accountList,
    niche,
    subNiches,
    selectedSignals = [],
    signalPrompts = {},
    researchPlatforms = ["google"],
    researchLocations = ["Global"],
    resultRange = [20, 40],
    lookbackDays = 7,
  } = config || {};

  const accounts = String(accountList || "")
    .split(/\n|,/)
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 40);

  const watch =
    targetMode === "accounts" && accounts.length
      ? `These brands and accounts:\n${accounts.map((a) => `- ${a}`).join("\n")}`
      : `The ${clean(niche, 200) || "brand's"} market${subNiches ? `, especially: ${clean(subNiches, 400)}` : ""}.${
          accounts.length ? `\nKeep a closer eye on these names in it: ${accounts.slice(0, 12).join(", ")}.` : ""
        }`;

  const signals = selectedSignals
    .map((id) => SIGNAL_TYPES.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => `- ${t.label}: ${clean(signalPrompts[t.id], 500) || t.desc}`);

  const regions = normaliseRegions(researchLocations);
  const where = researchPlatforms
    .map((id) => PLATFORM_SEARCH[id] || RESEARCH_PLATFORMS.find((p) => p.id === id)?.label)
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");

  const [min, max] = resultRange;
  const brandName = clean(brand?.brandName, 120) || "the brand";

  return `You are Huesy's research desk. Find real, recent market signals that ${brandName}'s social team could post about today.

Today is ${today()}. Only include things that happened or were published in the last ${lookbackDays} days, on or after ${daysAgo(lookbackDays)}.

WHO THIS IS FOR
Brand: ${brandName}${brand?.product ? ` (${clean(brand.product, 200)})` : ""}
${brand?.brandDescription ? `What it does: ${clean(brand.brandDescription, 600)}\n` : ""}${brand?.targetAudience ? `Audience: ${clean(brand.targetAudience, 400)}\n` : ""}
WHAT TO WATCH
${watch}

WHAT COUNTS AS A SIGNAL
${signals.length ? signals.join("\n") : "Any notable launch, collaboration, campaign, expansion, repositioning, market move or controversy."}

WHERE TO LOOK
${where}
${isGlobal(regions) ? "Regions: anywhere." : `Regions: focus on ${regions.join(", ")}. Say the country in the summary when it matters.`}

HOW TO WORK
- Run several focused searches: brand names, category words with launch, collab or campaign, and this month and year.
- Prefer primary sources: the brand's own announcement or post, a press release, or a reputable publication.
- Every item must come from a page you found in your search results. Never invent a story, a quote, a number or a link.
- Skip evergreen articles, listicles, opinion pieces with no news in them, and anything outside the date window.
- One item per story. If several outlets cover it, keep the best source.
- Cover every place listed under WHERE TO LOOK, not just one.
- When you call web_search from code, it returns a JSON string. Parse it with json.loads before reading title, url, page_age and content.

OUTPUT
Find between ${min} and ${max} items. More is better when they are real and relevant; fewer is fine when the window is quiet. If nothing in the window qualifies, write only NO_SIGNALS.
Write each item in exactly this shape, followed by a line with three dashes:

HEADLINE: a clear, specific headline
BRAND: the brand or company involved
TYPE: one of ${SIGNAL_TYPE_LABELS.join(", ")}
SOURCE: Google News, Instagram or X
URL: the direct https link to the page you found, or none
DATE: the date it happened or was published, as YYYY-MM-DD
SUMMARY: two or three plain sentences on what happened
SIGNIFICANCE: one or two sentences on why ${brandName}'s audience would care, and the angle worth posting
---

Start directly with the first HEADLINE. No introduction, no closing note, no markdown. Do not use hyphens or dashes inside any field; three dashes are only for the separator line.`;
}

const SEARCH_KEYS = "HEADLINE|BRAND|TYPE|SOURCE|URL|DATE|SUMMARY|SIGNIFICANCE";

const uid = () => Math.random().toString(36).slice(2, 11);

// One item from the search output, or null when the block is not an item.
export function parseSearchBlock(block) {
  const text = String(block || "").replace(/\r/g, "");
  const extract = (key) => {
    const patterns = [
      new RegExp(`(?:^|\\n)\\s*\\**${key}:?\\**:?\\s*(.+?)(?=\\n\\s*\\**(?:${SEARCH_KEYS})\\b|$)`, "s"),
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[1].trim().replace(/^\*\*|\*\*$/g, "").trim();
    }
    return "";
  };

  if (/\bNO_SIGNALS\b/.test(text)) return null;
  const headline = extract("HEADLINE");
  if (!headline || headline.length < 6) return null;

  // A note that nothing qualified is not an item. Real items name a brand.
  const brand = extract("BRAND");
  if (!brand || /^(none|n\/?a|unknown|not applicable)\.?$/i.test(brand)) return null;
  if (/^(no|nothing)\b/i.test(headline) && /\bfound\b/i.test(headline)) return null;

  const url = extract("URL");
  const type = extract("TYPE");
  return {
    id: uid(),
    headline,
    brand,
    type: SIGNAL_TYPE_LABELS.find((t) => t.toLowerCase() === type.toLowerCase()) || (type ? "Other" : ""),
    source: extract("SOURCE"),
    url: /^https?:\/\/\S+$/i.test(url) ? url : "",
    summary: extract("SUMMARY"),
    significance: extract("SIGNIFICANCE"),
    date: extract("DATE"),
    fetchedAt: Date.now(),
  };
}

export function parseSearchResult(text) {
  return String(text || "")
    .split(/\n\s*-{3,}\s*(?:\n|$)/)
    .map(parseSearchBlock)
    .filter(Boolean);
}

/* ================================================================ writing == */

export const WRITER_SYSTEM = `You are Huesy, a social media writer. You turn one fresh market signal into a post for one brand.

How you write:
- Write as the brand, in its voice and in the tone set for the platform. When reference posts are given, match their rhythm, length and formatting, never their words.
- Lead with the news or a sharp take on it. The first line has to earn the second.
- Use only facts that are in the signal. Never invent numbers, quotes, dates, prices, or claims about the brand's own products.
- Connect the signal to the brand's audience with a real reason. If the signal is about a competitor, comment on what it means for the category rather than promoting the competitor.
- Plain, human language. Avoid stock phrases such as game changer, elevate, unlock, dive in, in today's fast paced world.
- Never use hyphens or dashes; write around them.
- Return exactly the sections asked for, with nothing before the first section marker and nothing after the last section.`;

const PLATFORM_LABEL = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label]));

export function brandBlock(brand) {
  const b = brand || {};
  const lines = [
    "THE BRAND",
    `Name: ${clean(b.brandName, 120) || "Not set"}`,
    b.product ? `Product: ${clean(b.product, 300)}` : "",
    b.brandDescription ? `What it does: ${clean(b.brandDescription, 1000)}` : "",
    b.targetAudience ? `Audience: ${clean(b.targetAudience, 600)}` : "",
    b.brandPersona ? `Voice: ${clean(b.brandPersona, 800)}` : "",
    b.brandValues ? `Values: ${clean(b.brandValues, 400)}` : "",
  ].filter(Boolean);

  const tones = Object.entries(b.platformPersonality || {})
    .filter(([, v]) => String(v || "").trim())
    .map(([k, v]) => `${PLATFORM_LABEL[k] || k}: ${clean(v, 500)}`);
  if (tones.length) lines.push("", "PLATFORM TONES", ...tones);

  const refs = [];
  for (const [platform, posts] of Object.entries(b.referencePosts || {})) {
    (posts || [])
      .filter((p) => String(p || "").trim())
      .slice(0, 4)
      .forEach((p, i) => refs.push(`${PLATFORM_LABEL[platform] || platform} reference ${i + 1}:\n${clean(p, 1500)}`));
  }
  if (refs.length) lines.push("", "REFERENCE POSTS (match the style, never copy the words)", ...refs);

  lines.push("", "CREATIVE DIRECTION", clean(b.creativeDirection, 1500) || DEFAULT_CREATIVE_DIRECTION);
  return lines.join("\n");
}

export function signalBlock(s) {
  return [
    "THE SIGNAL",
    `Headline: ${clean(s?.headline, 300)}`,
    s?.brand ? `Brand involved: ${clean(s.brand, 120)}` : "",
    s?.date ? `Date: ${clean(s.date, 40)}` : "",
    s?.summary ? `What happened: ${clean(s.summary, 1200)}` : "",
    s?.significance ? `Why it matters: ${clean(s.significance, 800)}` : "",
    s?.url ? `Source: ${clean(s.url, 400)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const TASKS = {
  instagram: (hasImages) => `Write an Instagram post about this signal. Return three sections:

===CAPTION===
The caption. A hook in the first line, short paragraphs with line breaks, a natural call to action, then three to eight relevant hashtags on the last line.

===CREATIVE_DETAILS===
A brief a designer can follow without guessing: format (single image, or a carousel with the slide count) and size (1080x1080 or 1080x1350), layout and grid, typography (style, weight, hierarchy and placement), a colour palette as hex codes that fit the brand, the imagery and how it is cropped, every piece of text on the creative and where it sits, the focal point, and the mood.

===IMAGE_PROMPT===
One detailed prompt for an AI image generator (Nano Banana Pro) to render the main creative: every visual element, colours as hex, the exact text to render and where, composition, style, lighting, mood and aspect ratio.${
    hasImages
      ? "\n\nThe attached images are the brand's own reference posts and creatives. Match their visual style, layout, typography and palette in the brief and the image prompt."
      : ""
  }`,

  linkedin: () => `Write a LinkedIn post about this signal. Return one section:

===POST===
Under 1,300 characters. A hook line, the insight, what it means for the reader, and a closing line that invites a reply. Short paragraphs. Three hashtags at most, or none.`,

  twitter: () => `Write for X about this signal. Return two sections:

===TWEET===
One post, 280 characters at most. Punchy and specific.

===THREAD===
Up to three follow up posts that add something, each 280 characters at most, numbered 1/ 2/ 3/. If the single post is stronger alone, write exactly: none`,

  email: (_, options) => {
    const headers = options?.emailCsvHeaders?.length
      ? `\nThe contact list has these columns: ${options.emailCsvHeaders.slice(0, 30).join(", ")}.${
          options.emailFieldMap && Object.keys(options.emailFieldMap).length
            ? ` Merge tags chosen for them: ${JSON.stringify(options.emailFieldMap).slice(0, 600)}.`
            : ""
        }`
      : "";
    return `Write a short newsletter email about this signal, personalised with merge fields such as {{first_name}}.
Personalise on: ${clean(options?.emailPersonalisation, 300) || "first name"}.${headers}

Return three sections:

===SUBJECT===
The subject line.

===BODY===
The email body with {{merge_fields}} in double braces, a clear point, and one call to action.

===PERSONALISATION_EXAMPLE===
The same body filled in for one plausible example contact.`;
  },
};

// The full request body pieces for one post. `images` are data URLs.
export function buildWriteRequest({ platform, signal, brand, options, images = [] }) {
  const task = TASKS[platform];
  if (!task) return null;
  const imageBlocks = images
    .map((img) => String(img).match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/))
    .filter(Boolean)
    .slice(0, 6)
    .map((m) => ({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }));
  if (imageBlocks.length) imageBlocks[imageBlocks.length - 1].cache_control = { type: "ephemeral" };

  return {
    system: [
      { type: "text", text: WRITER_SYSTEM },
      { type: "text", text: brandBlock(brand), cache_control: { type: "ephemeral" } },
    ],
    content: [
      ...(platform === "instagram" ? imageBlocks : []),
      { type: "text", text: `${signalBlock(signal)}\n\n${task(imageBlocks.length > 0, options)}` },
    ],
  };
}

export function buildRewriteRequest({ platform, signal, brand, label, value, feedback, whole }) {
  const where = PLATFORM_LABEL[platform] || platform;
  const text = whole
    ? `${signalBlock(signal)}

Here is the current ${where} draft:

${clean(value, 8000)}

Rewrite it using this feedback: "${clean(feedback, 600)}"
Keep exactly the same ===SECTION=== markers and order.`
    : `${signalBlock(signal)}

Here is the current ${label} for ${where}:

${clean(value, 6000)}

Rewrite only this ${label} using this feedback: "${clean(feedback, 600)}"
Return only the new ${label} text, with no section marker, label or comment.`;

  return {
    system: [
      { type: "text", text: WRITER_SYSTEM },
      { type: "text", text: brandBlock(brand), cache_control: { type: "ephemeral" } },
    ],
    content: [{ type: "text", text }],
  };
}

/* ============================================================ quick jobs == */
// Small jobs on Haiku. Each returns { prompt, schema } for structured output,
// or { prompt } for plain text.

const str = { type: "string" };

export function tidyBriefJob(b) {
  return {
    prompt: `Tidy this brand brief. Fix grammar and make each field clear and specific. Keep the owner's meaning, and keep their wording where it is already good. Do not invent facts. Leave a field empty if it is empty.

Brand name: ${clean(b?.brandName, 120)}
Product: ${clean(b?.product, 300)}
What it does: ${clean(b?.brandDescription, 1200)}
Audience: ${clean(b?.targetAudience, 600)}
Voice: ${clean(b?.brandPersona, 800)}
Values: ${clean(b?.brandValues, 400)}

No hyphens or dashes in the text.`,
    schema: {
      type: "object",
      properties: {
        brandName: str,
        product: str,
        brandDescription: str,
        targetAudience: str,
        brandPersona: str,
        brandValues: str,
      },
      required: ["brandName", "product", "brandDescription", "targetAudience", "brandPersona", "brandValues"],
      additionalProperties: false,
    },
  };
}

export function brandDraftJob({ brandName, oneLiner, website }) {
  return {
    prompt: `Draft a starting brand profile for a social media team, from what the owner wrote. They will review and edit every field, so make each one specific and useful rather than safe and generic.

Brand name: ${clean(brandName, 120)}
In their words: ${clean(oneLiner, 600)}
${website ? `Website: ${clean(website, 200)}\n` : ""}
Use what you know about this brand only if you are confident it is the same company. Otherwise infer carefully from their words, and never invent facts such as founding dates, locations or numbers.

Fields:
- product: what they sell, in a few words
- brandDescription: two sentences on what the brand does and what makes it different
- targetAudience: who buys it, specifically
- brandPersona: how the brand should sound, with one example line in its voice
- brandValues: three or four values, comma separated
- niche: the market to watch, in a few words
- subNiches: three to five narrower themes, comma separated
- accounts: five to eight brands, competitors or adjacent names worth watching for news
- tones: one short line each on how the brand should sound on Instagram, LinkedIn, X and in email

No hyphens or dashes in the text.`,
    schema: {
      type: "object",
      properties: {
        product: str,
        brandDescription: str,
        targetAudience: str,
        brandPersona: str,
        brandValues: str,
        niche: str,
        subNiches: str,
        accounts: { type: "array", items: str },
        tones: {
          type: "object",
          properties: { instagram: str, linkedin: str, twitter: str, email: str },
          required: ["instagram", "linkedin", "twitter", "email"],
          additionalProperties: false,
        },
      },
      required: [
        "product",
        "brandDescription",
        "targetAudience",
        "brandPersona",
        "brandValues",
        "niche",
        "subNiches",
        "accounts",
        "tones",
      ],
      additionalProperties: false,
    },
  };
}

export function searchInstructionJob({ signalId, context }) {
  const t = SIGNAL_TYPES.find((s) => s.id === signalId) || SIGNAL_TYPES[0];
  return {
    prompt: `Write a search instruction of two or three sentences telling a research assistant exactly what counts as "${t.label}" (${t.desc}) for this market: ${clean(context, 400) || "general consumer brands"}. Say which kinds of announcements count, which sources to trust, and what to skip. Plain sentences, no list, no hyphens or dashes. Return only the instruction.`,
  };
}

// Ranks signals for one brand. Fit is 1 to 5; the angle is the specific
// reason this brand would post about it.
export function rankJob(brand, signals) {
  const list = signals
    .slice(0, 60)
    .map(
      (s, i) =>
        `${i}. ${clean(s.headline, 200)}${s.brand ? ` [${clean(s.brand, 60)}]` : ""}${s.date ? ` (${clean(s.date, 20)})` : ""}\n   ${clean(s.summary, 260)}`
    )
    .join("\n");
  return {
    prompt: `Rank these market signals for ${clean(brand?.brandName, 120) || "this brand"}'s social team.

The brand: ${clean(brand?.product, 200)}. ${clean(brand?.brandDescription, 500)}
Audience: ${clean(brand?.targetAudience, 300)}
Today: ${today()}

Signals:
${list}

For every signal give:
- i: its number
- fit: 5 when it is clearly relevant to this audience, fresh, and an obvious post; 4 when it is relevant with a clear angle; 3 when it is adjacent and needs a stretch; 2 when it is weak; 1 when it is not relevant or not real news.
- angle: the specific angle for this brand, sixteen words at most, no hyphens or dashes.`,
    schema: {
      type: "object",
      properties: {
        ranks: {
          type: "array",
          items: {
            type: "object",
            properties: { i: { type: "integer" }, fit: { type: "integer" }, angle: str },
            required: ["i", "fit", "angle"],
            additionalProperties: false,
          },
        },
      },
      required: ["ranks"],
      additionalProperties: false,
    },
  };
}
