// The stand-in model. With HUESY_AI_MOCK=1 every AI route answers from here:
// the same shapes as the real model, realistic timing, no network, no spend.
// Signals it returns are flagged `sample` so the UI labels them.
//
// QA hooks, typed into a search's niche: "#fail" errors mid-search, "#empty"
// finds nothing, "#slow" takes longer.

export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const MOVES = [
  ["Launch", "launches a limited edition line for the festive season", "The drop went live on the brand's own channels first, with a countdown post that drew heavy comments before any press picked it up."],
  ["Collab", "teams up with an independent design studio on a capsule", "The collaboration was teased in a single post two days before release and sold through its first batch within hours."],
  ["Campaign", "rolls out a campaign built entirely from customer videos", "The campaign swaps studio shoots for clips sent in by customers, and the brand is reposting the best ones daily."],
  ["Expansion", "opens its first store outside its home market", "The new store follows two years of pop ups and lands with a launch weekend of in store events."],
  ["Repositioning", "drops its old tagline and refreshes its look", "A new identity and a plainer voice arrived together, and the brand explained the change in a founder video."],
  ["Market move", "cuts prices on its best seller to undercut rivals", "The price change is permanent, and competitors have not yet responded publicly."],
  ["Controversy", "pulls an ad after a backlash over its tone", "Criticism built overnight in replies, and the brand replaced the creative the following morning with a short apology."],
];

const SOURCES = ["Google News", "Instagram", "X"];

function brandsFor(config) {
  const accounts = String(config?.accountList || "")
    .split(/\n|,/)
    .map((a) => a.trim())
    .filter(Boolean);
  if (config?.targetMode === "accounts" && accounts.length) return accounts;
  const niche = String(config?.niche || "consumer").replace(/#\w+/g, "").trim() || "consumer";
  const word = niche.split(/\s+/)[0];
  const cap = word.charAt(0).toUpperCase() + word.slice(1);
  return [`${cap} House`, `Studio ${cap}`, `${cap} & Co`, `Little ${cap}`, `${cap} Lab`];
}

export function mockSearchText(config, brand) {
  const brands = brandsFor(config);
  const allowed = (config?.researchPlatforms || ["google"]).map(
    (p) => ({ google: "Google News", instagram: "Instagram", twitter: "X" })[p] || "Google News"
  );
  const lookback = Number(config?.lookbackDays) || 7;
  const [min] = config?.resultRange || [12, 20];
  const count = Math.max(8, Math.min(18, Number(min) || 12));
  const name = brand?.brandName || "your brand";

  const items = [];
  for (let i = 0; i < count; i++) {
    const [type, move, summary] = MOVES[i % MOVES.length];
    const who = brands[i % brands.length];
    const source = allowed[i % allowed.length] || SOURCES[i % 3];
    const days = Math.min(lookback - 1, Math.floor((i * lookback) / count));
    items.push(
      [
        `HEADLINE: ${who} ${move}`,
        `BRAND: ${who}`,
        `TYPE: ${type}`,
        `SOURCE: ${source}`,
        `URL: https://example.com/sample/${i + 1}`,
        `DATE: ${isoDaysAgo(Math.max(0, days))}`,
        `SUMMARY: ${summary}`,
        `SIGNIFICANCE: People who follow ${name} watch moves like this closely, and a same day take puts ${name} in the conversation before the recaps arrive.`,
        "---",
      ].join("\n")
    );
  }
  return items.join("\n");
}

export const mockQueries = (config) => {
  const subject = (config?.targetMode === "accounts"
    ? String(config?.accountList || "").split(/\n|,/)[0]
    : config?.niche) || "brands";
  const s = String(subject).replace(/#\w+/g, "").trim() || "brands";
  return [`${s} launch this week`, `${s} collab announcement`, `${s} new campaign`, `${s} news`];
};

export const mockHosts = [["vogue.com", "businessoffashion.com"], ["instagram.com"], ["x.com", "techcrunch.com"]];

export function mockWrite(platform, signal, brand) {
  const name = brand?.brandName || "the brand";
  const h = signal?.headline || "a new move in the market";
  switch (platform) {
    case "instagram":
      return `===CAPTION===
${h}. That is the kind of move that changes what people expect next.

Here is our take at ${name}: the brands people remember are the ones that show up first, and show up useful.

Tell us below: would you try it?

#${name.replace(/\W+/g, "")} #NewThisWeek #BrandNews

===CREATIVE_DETAILS===
Format: single image, 1080x1350.
Layout: headline in the top third, product photograph centred, logo bottom right.
Typography: serif display for the headline, 64pt; sans serif body, 28pt.
Palette: #FCF5EF background, #141414 text, #FFC2D1 accent block behind the headline.
Text on the creative: "${h.slice(0, 60)}".
Mood: calm, editorial, confident.

===IMAGE_PROMPT===
An editorial 4:5 social media creative on a warm cream background (#FCF5EF). A soft pink block (#FFC2D1) sits behind a large serif headline that reads "${h.slice(0, 50)}". Centred product photograph with soft daylight from the left, gentle shadow. Small sans serif caption below. Calm, premium, magazine feel.`;
    case "linkedin":
      return `===POST===
${h}.

Most people will read that as a one off. It is not. It is the third move like it this quarter, and the pattern says more than the headline.

What it means for anyone building in this space: the window between a launch and the conversation about it is now measured in hours.

At ${name}, that is exactly the window we watch.

What would you do with a head start like that?`;
    case "twitter":
      return `===TWEET===
${h}. The interesting part is not the launch, it is the timing.

===THREAD===
1/ Moves like this used to take a season to land. Now it is a weekend.
2/ The brands winning it answer the same day.
3/ Watching this one closely at ${name}.`;
    case "email":
      return `===SUBJECT===
{{first_name}}, did you see this one?

===BODY===
Hi {{first_name}},

${h}. We think it says something about where the category is heading, and we wanted you to hear it from us first.

Reply and tell us what you make of it.

The ${name} team

===PERSONALISATION_EXAMPLE===
Hi Maya,

${h}. We think it says something about where the category is heading, and we wanted you to hear it from us first.

Reply and tell us what you make of it.

The ${name} team`;
    default:
      return "";
  }
}

export function mockRewrite({ value, feedback, whole }) {
  const note = String(feedback || "").trim();
  if (whole) return String(value || "").replace(/(===\w+===\s*)/, `$1(${note}) `);
  return `${String(value || "").trim()}\n\n(Rewritten: ${note})`;
}

export function mockQuick(job, input) {
  if (job === "tidy") {
    const b = input || {};
    const tidy = (s) => String(s || "").trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());
    return {
      brandName: tidy(b.brandName),
      product: tidy(b.product),
      brandDescription: tidy(b.brandDescription),
      targetAudience: tidy(b.targetAudience),
      brandPersona: tidy(b.brandPersona),
      brandValues: tidy(b.brandValues),
    };
  }
  if (job === "brand-draft") {
    const name = input?.brandName || "Your brand";
    return {
      product: "Everyday skincare",
      brandDescription: `${name} makes a small range of skincare people actually finish. Plain ingredients, honest claims and a founder who answers comments.`,
      targetAudience: "Women 22 to 35 in cities, who buy on Instagram and trust founders more than ads.",
      brandPersona: `Warm, plain spoken and a little dry. For example: "Three products. That's the routine."`,
      brandValues: "Honesty, simplicity, refill first",
      niche: "Beauty and skincare",
      subNiches: "Clean beauty, refillable packaging, founder led brands",
      accounts: ["Glossier", "Rhode", "Summer Fridays", "Laneige", "The Ordinary"],
      tones: {
        instagram: "Visual first, short lines, one emoji at most.",
        linkedin: "Founder perspective, what the move means for the category.",
        twitter: "Quick, dry, one sharp observation.",
        email: "Like a note from a friend who works in the industry.",
      },
    };
  }
  if (job === "instruction") {
    return "Count official announcements from the brand itself or coverage in trade press within the window. Prefer the brand's own post or press release, and skip rumours, listicles and resale news.";
  }
  return null;
}

export function mockRanks(signals) {
  return signals.map((s, i) => ({
    id: s.id,
    fit: [5, 4, 4, 3, 5, 2, 3][i % 7],
    angle: `A same day take on ${s.brand || "this"} puts the brand in the conversation early`,
  }));
}
