import { analyzeContent, overlaps, Purse, trendingNow } from "../intel/tools";
import { ageDays, findingsFromAnalysis, findingsFromTrending, latestOnly, queryFindings, saveFindings } from "../intel/findings";
import { formatLabel, hookLabel, platformLabel } from "../intel/taxonomy";

// The link between what Huesy has learned and what it makes. Before any
// content is written, this checks whether the evidence it needs is already
// known, fresh, measured on the right format and broad enough; researches
// only the gaps (included in Studio, within a small budget); and hands the
// writer a grounding pack: the pattern to follow, real examples, and a proof
// score that says honestly how strong the evidence is.

// The format each content type is measured as, per platform.
export const FOCUS = {
  creative: { instagram: "image", linkedin: "image", x: "image", tiktok: "video", youtube: "short" },
  carousel: { instagram: "carousel", linkedin: "carousel", x: "image", tiktok: "video", youtube: "short" },
  reel: { instagram: "reel", tiktok: "video", youtube: "short", linkedin: "video", x: "video" },
  text: { instagram: null, linkedin: "text", x: "text", tiktok: null, youtube: null },
};

// What each content type needs to know, how fresh it must be, and how many
// accounts must show it (`minN`) before it counts as covered.
export const NEEDS = {
  creative: {
    budget: 0.08,
    items: [
      { kind: "hook", maxAge: 21, minN: 5, label: "Openings that work", required: true },
      { kind: "format", maxAge: 21, minN: 5, label: "How this format performs", required: false },
      { kind: "examples", maxAge: 21, minN: 3, label: "Standout posts to learn from", required: true },
    ],
  },
  carousel: {
    budget: 0.08,
    items: [
      { kind: "hook", maxAge: 21, minN: 5, label: "Openings that work", required: true },
      { kind: "format", maxAge: 21, minN: 5, label: "How carousels perform", required: false },
      { kind: "examples", maxAge: 21, minN: 3, label: "Standout posts to learn from", required: true },
    ],
  },
  reel: {
    budget: 0.3,
    items: [
      { kind: "hook", maxAge: 21, minN: 5, label: "Openings that work (read from captions)", required: true },
      { kind: "length", maxAge: 21, minN: 3, label: "Lengths that perform", required: false },
      { kind: "examples", maxAge: 21, minN: 3, label: "Standout reels to learn from", required: true },
      { kind: "sound", maxAge: 10, minN: 1, label: "Sounds in use right now", required: false, trending: true },
      { kind: "trend", maxAge: 10, minN: 1, label: "What's moving this week", required: false, trending: true },
    ],
  },
  text: {
    budget: 0.03,
    items: [{ kind: "hook", maxAge: 30, minN: 5, label: "Openings that work in posts", required: false, refresh: true }],
  },
};

// A pattern leads a piece only when this many accounts show it, at least
// this far above a typical post. Anything less is an early sign.
const LEAD_AUTHORS = 5;
const LEAD_STRENGTH = 1.2;
// Proof only says Strong when this many accounts stand behind the pattern.
const STRONG_AUTHORS = 8;
// Research that just ran and came back thin isn't repeated within this long.
const RETRY_DAYS = 2;

// How many accounts (or standout posts) stand behind a finding.
const breadth = (f) => f?.metrics?.authors ?? f?.metrics?.standouts ?? (Array.isArray(f?.evidence) ? f.evidence.length : 0);
const rank = (f) => f?.metrics?.score ?? f?.metrics?.strength ?? 0;

// Rates each need: covered, stale, weak (too few accounts, or not measured on
// this format) or missing. `tried` marks a need that research checked in the
// last two days, so it isn't researched again and again.
export function evaluate(type, platform, findings) {
  const focus = FOCUS[type]?.[platform] ?? null;
  return NEEDS[type].items.map((need) => {
    const all = findings.filter((f) => f.kind === need.kind && f.platform === platform);
    if (!all.length) return { ...need, status: "missing", findings: [] };
    const formatFits = (f) => (need.kind === "format" ? !focus || f.metrics?.key === focus : !focus || f.scope?.focus === focus);
    const exact = all.filter(formatFits);
    const recent = all.filter((f) => ageDays(f) < RETRY_DAYS && (f.scope?.requestedFocus ?? null) === focus);
    const tried = recent.length > 0;
    if (!exact.length) return { ...need, status: "weak", why: "format", findings: all.slice(0, 8), age: ageDays(all[0]), tried };
    const fresh = exact.filter((f) => ageDays(f) <= need.maxAge);
    if (!fresh.length) return { ...need, status: "stale", findings: exact.slice(0, 8), age: ageDays(exact[0]), tried };
    const strong = fresh.filter((f) => breadth(f) >= need.minN);
    if (!strong.length) return { ...need, status: "weak", why: "few", findings: fresh.slice(0, 8), age: ageDays(fresh[0]), tried };
    return { ...need, status: "covered", findings: strong.slice(0, 8), age: ageDays(strong[0]) };
  });
}

export const covered = (rated) => rated.filter((r) => r.required).every((r) => r.status === "covered");

// The proof: how strong the evidence behind the chosen pattern is. Caps keep
// it honest: old evidence, evidence borrowed from another platform, or too
// few accounts can't say Strong.
export function proofScore(pattern, { age = 30, maxAge = 21, fallback = false, borrowedFrom = null } = {}) {
  if (!pattern || fallback) {
    return { score: 30, label: "Thin", reasons: ["Not enough recent posts in your niche, so this draws on general best practice"] };
  }
  const authors = pattern.authors ?? pattern.n ?? 0;
  const consistency = pattern.consistencyLow ?? pattern.consistency ?? 0.3;
  const strength = Math.min(pattern.strength ?? 1, 10);
  let score = Math.round(
    Math.min(1, authors / 15) * 30 + consistency * 25 + Math.max(0, Math.min(1, (strength - 1) / 2)) * 25 + (1 - Math.min(1, age / 21)) * 10 + (pattern.confidence ?? 0.5) * 10
  );
  const capped = age > maxAge || borrowedFrom || authors < STRONG_AUTHORS;
  if (capped) score = Math.min(score, 74);
  const label = score >= 75 ? "Strong" : score >= 50 ? "Good" : "Thin";
  const reasons = [
    `${pattern.n ?? "?"} posts from ${authors} accounts`,
    `about ${Math.round(strength * 10) / 10}x a typical post's reach`,
    pattern.consistency != null ? `${Math.round(pattern.consistency * 100)}% of those accounts beat the norm` : null,
    age <= 1 ? "checked today" : `checked ${age} days ago`,
    borrowedFrom ? `measured on ${platformLabel(borrowedFrom)}` : null,
  ].filter(Boolean);
  return { score, label, reasons };
}

const exampleKey = (e) => e.url || `${e.handle}:${e.caption}`;
const hookOf = (f, chosen = false) => ({
  hook: f.metrics?.key,
  hookLabel: hookLabel(f.metrics?.key),
  strength: f.metrics?.strength,
  n: f.metrics?.n,
  authors: f.metrics?.authors ?? null,
  consistency: f.metrics?.consistency,
  consistencyLow: f.metrics?.consistencyLow ?? null,
  confidence: f.confidence,
  chosen,
  id: f.id,
  age: ageDays(f),
});

function buildPack(type, platform, ctx, rated, findings, research, { topic, chosen, borrowedFrom }) {
  const focus = FOCUS[type]?.[platform] ?? null;
  const byKind = (kind) => rated.find((r) => r.kind === kind)?.findings || [];
  const needOf = (kind) => rated.find((r) => r.kind === kind);
  // Openings: on-topic ones first, then by their (small-sample-aware) rank.
  const onTopic = (f) => (topic ? overlaps(topic, `${f.scope?.query || ""} ${f.scope?.topic || ""}`) : false);
  const seenHooks = new Set();
  const hookFindings = byKind("hook")
    .filter((f) => !f.scope?.thin)
    .sort((a, b) => Number(onTopic(b)) - Number(onTopic(a)) || rank(b) - rank(a))
    // One entry per kind of opening: its best-supported measurement.
    .filter((f) => !seenHooks.has(f.metrics?.key) && seenHooks.add(f.metrics?.key));
  const format = byKind("format")[0];
  const length = byKind("length")[0];

  // A hook the customer picked leads, when it's on this platform and broad enough.
  const picked = chosen.find((f) => f.kind === "hook" && f.platform === platform && (f.metrics?.authors ?? 0) >= 3);
  const lead = hookFindings.find((f) => (f.metrics?.authors ?? 0) >= LEAD_AUTHORS && (f.metrics?.strength ?? 0) >= LEAD_STRENGTH);
  const top = picked || lead || null;
  const pattern = top ? { ...hookOf(top, Boolean(picked)), format: focus, formatLabel: focus ? formatLabel(focus) : null, length: length?.metrics?.key || null } : null;

  const seen = new Set();
  const pool = [...byKind("examples"), ...hookFindings].flatMap((f) => f.evidence || []).filter((e) => e && !seen.has(exampleKey(e)) && seen.add(exampleKey(e)));
  const sameFormat = focus ? pool.filter((e) => e.format === focus) : pool;
  const examples = (sameFormat.length >= 2 ? sameFormat : pool).sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0)).slice(0, 5);

  const soundFindings = byKind("sound");
  const sounds = soundFindings.flatMap((f) => f.metrics?.sounds || (f.metrics?.key ? [{ title: f.metrics.key, uses: f.metrics.n, commercial: null }] : [])).slice(0, 5);
  const trendFinding = byKind("trend")[0];
  const trends = (trendFinding?.metrics?.tags || []).slice(0, 6);
  const audience = findings.find((f) => f.kind === "audience" && f.platform === platform) || findings.find((f) => f.kind === "audience");
  const used = [...new Set([...rated.flatMap((r) => r.findings), ...chosen].map((f) => f.id).filter(Boolean))];
  const hookNeed = needOf("hook");
  const age = top ? ageDays(top) : 30;

  return {
    type,
    platform,
    platformLabel: platformLabel(platform),
    focus,
    topic: topic || null,
    pattern,
    hooks: hookFindings.slice(0, 3).map((f) => ({ key: f.metrics?.key, label: hookLabel(f.metrics?.key), strength: f.metrics?.strength, n: f.metrics?.n, authors: f.metrics?.authors ?? null, statement: f.statement, early: (f.metrics?.authors ?? 0) < LEAD_AUTHORS })),
    format: format ? { statement: format.statement, strength: format.metrics?.strength, n: format.metrics?.n } : null,
    length: length ? { key: length.metrics?.key, statement: length.statement } : null,
    examples,
    examplesMixed: Boolean(focus) && sameFormat.length < 2 && pool.length > 0,
    sounds,
    trends,
    trendsRising: Boolean(trendFinding?.metrics?.rising),
    audience: audience ? { questions: (audience.metrics?.questions || []).slice(0, 5), pains: (audience.metrics?.pains || []).slice(0, 3), phrases: (audience.metrics?.phrases || []).slice(0, 8) } : null,
    chosen: chosen.slice(0, 5).map((f) => ({ id: f.id, kind: f.kind, platform: f.platform, statement: f.statement })),
    needs: rated.map((r) => ({ kind: r.kind, label: r.label, status: r.status, age: r.age ?? null, required: r.required })),
    findingIds: used,
    research,
    borrowedFrom: borrowedFrom || null,
    proof: proofScore(pattern, { age, maxAge: hookNeed?.maxAge ?? 21, fallback: !pattern, borrowedFrom }),
    niche: ctx.niche,
  };
}

// Grounds one piece of content. `sourceIds` are findings the person chose
// ("make this from that insight"); they're always considered. `borrowedFrom`
// says the evidence comes from another platform (a newsletter grounded on
// LinkedIn posts).
export async function ground({ type, platform, topic, ctx, user, sourceIds = [], borrowedFrom = null, onStep = () => {} }) {
  if (!NEEDS[type]) throw new Error(`unknown content type ${type}`);
  const plat = platform || ctx.platforms[0];
  const focus = FOCUS[type]?.[plat] ?? null;
  onStep({ id: "ground", label: "Checking what I already know", status: "running" });
  let findings = latestOnly(await queryFindings(user, { platform: plat, sinceDays: 60, limit: 150 }));
  const chosen = sourceIds.length ? await queryFindings(user, { ids: sourceIds }) : [];
  const known = new Set(findings.map((f) => f.id));
  findings = [...chosen.filter((f) => f.platform === plat && !known.has(f.id)), ...findings];

  let rated = evaluate(type, plat, findings);
  const research = { ran: false, reason: null, found: 0, topicFound: null, usd: 0 };
  const gaps = rated.filter(
    (r) => r.status !== "covered" && !r.tried && (r.required || r.trending || (r.refresh && (r.status === "missing" || r.status === "stale")))
  );
  // A topic counts as known when standout or opening findings on this format
  // already share a meaningful word with it.
  const topicKnown =
    !topic ||
    findings.some((f) => (f.kind === "examples" || f.kind === "hook") && (!focus || f.scope?.focus === focus) && overlaps(topic, `${f.scope?.query || ""} ${f.scope?.topic || ""}`) && ageDays(f) <= 21);
  const topicTried = topic && findings.some((f) => f.kind === "examples" && ageDays(f) < RETRY_DAYS && overlaps(topic, f.scope?.topic || ""));
  const researchTopic = Boolean(topic) && !topicKnown && !topicTried && type !== "text";

  if (gaps.length || researchTopic) {
    const purse = new Purse(NEEDS[type].budget);
    research.ran = true;
    research.reason = gaps.length
      ? gaps
          .map((g) => `${g.label.toLowerCase()} ${g.status === "stale" ? "were out of date" : g.status === "weak" ? (g.why === "format" ? `weren't measured on ${focus ? formatLabel(focus).toLowerCase() : "this format"}` : "had too few accounts") : "weren't known yet"}`)
          .join("; ")
      : `nothing yet on "${topic}"`;
    onStep({ id: "ground", label: `Checking what works for ${focus ? formatLabel(focus).toLowerCase() : "posts"} on ${platformLabel(plat)}`, status: "running" });
    const jobs = [];
    if (gaps.some((g) => !g.trending) || researchTopic) {
      jobs.push(
        analyzeContent({ platform: plat, query: topic || ctx.keywords[0], ctx, days: 30, focus }, { user, purse, onStep })
          .then((a) => {
            if (topic) research.topicFound = Boolean(a.topicFound);
            return findingsFromAnalysis(a, ctx);
          })
          .catch(() => [])
      );
    }
    if (gaps.some((g) => g.trending)) {
      jobs.push(trendingNow({ platform: plat, ctx }, { user, purse, onStep }).then((t) => findingsFromTrending(t, ctx)).catch(() => []));
    }
    const fresh = (await Promise.all(jobs)).flat().map((f) => ({ ...f, scope: { ...(f.scope || {}), requestedFocus: f.scope?.requestedFocus ?? focus } }));
    const saved = await saveFindings(user, fresh, { type: "studio", contentType: type });
    research.found = saved.length;
    findings = latestOnly([...saved, ...findings]);
    rated = evaluate(type, plat, findings);
    research.usd = Number(purse.spent.toFixed(4));
  }
  const pack = buildPack(type, plat, ctx, rated, findings, research, { topic, chosen, borrowedFrom });
  const verdict = `proof is ${pack.proof.label.toLowerCase()}`;
  onStep({
    id: "ground",
    label: !research.ran
      ? `Using what I already know: ${verdict}`
      : research.found
        ? `Checked fresh posts: ${verdict}`
        : `Couldn't find fresh posts, so this uses what I already know: ${verdict}`,
    status: "done",
  });
  return pack;
}

const str = (v, max = 300) => (v == null ? v : String(v).slice(0, max));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// A grounding pack comes back from the browser with studio calls, so it is
// trimmed to the fields the writers read, with sizes capped. (Its signature is
// checked separately; see lib/studio/seal.js.)
export function cleanPack(pack) {
  if (!pack || typeof pack !== "object") return null;
  const p = pack.pattern;
  return {
    type: str(pack.type, 20),
    platform: str(pack.platform, 20),
    platformLabel: str(pack.platformLabel, 30),
    focus: str(pack.focus, 20),
    topic: str(pack.topic, 160),
    pattern: p
      ? {
          hook: str(p.hook, 30),
          hookLabel: str(p.hookLabel, 40),
          strength: num(p.strength),
          n: num(p.n),
          authors: num(p.authors),
          consistency: num(p.consistency),
          consistencyLow: num(p.consistencyLow),
          confidence: num(p.confidence),
          chosen: Boolean(p.chosen),
          age: num(p.age),
          format: str(p.format, 20),
          formatLabel: str(p.formatLabel, 40),
          length: str(p.length, 30),
        }
      : null,
    hooks: (pack.hooks || []).slice(0, 3).map((h) => ({ key: str(h.key, 30), label: str(h.label, 40), strength: num(h.strength), n: num(h.n), authors: num(h.authors), statement: str(h.statement, 300), early: Boolean(h.early) })),
    format: pack.format ? { statement: str(pack.format.statement, 300), strength: num(pack.format.strength), n: num(pack.format.n) } : null,
    length: pack.length ? { key: str(pack.length.key, 30), statement: str(pack.length.statement, 300) } : null,
    examples: (pack.examples || []).slice(0, 5).map((e) => ({
      url: /^https?:\/\//.test(e.url || "") ? str(e.url, 400) : null,
      handle: str(e.handle, 60),
      caption: str(e.caption, 300),
      format: str(e.format, 20),
      strength: num(e.strength),
      views: num(e.views),
      likes: num(e.likes),
      postedAt: str(e.postedAt, 40),
      thumbnail: /^https?:\/\//.test(e.thumbnail || "") ? str(e.thumbnail, 600) : null,
      platform: str(e.platform, 20),
    })),
    examplesMixed: Boolean(pack.examplesMixed),
    sounds: (pack.sounds || []).slice(0, 5).map((s) => ({ title: str(s.title, 120), uses: num(s.uses), commercial: s.commercial === false ? false : s.commercial === true ? true : null })),
    trends: (pack.trends || []).slice(0, 6).map((t) => ({ tag: str(t.tag, 60), growthPct: num(t.growthPct), posts: num(t.posts) })),
    trendsRising: Boolean(pack.trendsRising),
    audience: pack.audience
      ? {
          questions: (pack.audience.questions || []).slice(0, 5).map((q) => ({ text: str(q.text, 200), count: num(q.count) })),
          pains: (pack.audience.pains || []).slice(0, 3).map((q) => ({ text: str(q.text, 200), count: num(q.count) })),
          phrases: (pack.audience.phrases || []).slice(0, 8).map((x) => str(x, 80)),
        }
      : null,
    chosen: (pack.chosen || []).slice(0, 5).map((c) => ({ id: str(c.id, 40), kind: str(c.kind, 20), platform: str(c.platform, 20), statement: str(c.statement, 300) })),
    needs: (pack.needs || []).slice(0, 6).map((n) => ({ kind: str(n.kind, 20), label: str(n.label, 60), status: str(n.status, 12), age: num(n.age), required: Boolean(n.required) })),
    findingIds: (pack.findingIds || []).slice(0, 40).map((id) => str(id, 40)),
    research: pack.research ? { ran: Boolean(pack.research.ran), reason: str(pack.research.reason, 300), found: num(pack.research.found) ?? 0, topicFound: pack.research.topicFound == null ? null : Boolean(pack.research.topicFound), usd: 0 } : null,
    borrowedFrom: str(pack.borrowedFrom, 20),
    proof: pack.proof ? { score: num(pack.proof.score), label: str(pack.proof.label, 10), reasons: (pack.proof.reasons || []).slice(0, 5).map((r) => str(r, 120)) } : null,
    niche: str(pack.niche, 200),
  };
}

// The grounding pack as plain text for the writer's prompt. It says exactly
// how sure the evidence is, so the writer never overstates it.
export function packBrief(pack) {
  const lines = [];
  const p = pack.pattern;
  const where = pack.borrowedFrom ? `${platformLabel(pack.borrowedFrom)} (the closest measured platform)` : pack.platformLabel;
  if (p) {
    lines.push(
      `${p.chosen ? "The pattern the customer picked" : "Measured pattern to follow"}: ${p.hookLabel} openings${p.formatLabel ? ` in ${p.formatLabel.toLowerCase()}` : ""} on ${where}: about ${p.strength ?? "?"}x a typical post's reach, across ${p.n ?? "?"} posts from ${p.authors ?? "?"} accounts in this niche${p.age > 21 ? `, measured ${p.age} days ago` : ""}.`
    );
  } else {
    lines.push(`No measured pattern is strong enough yet in this niche on ${where}. Use proven general practice for this format, and don't claim it's measured.`);
  }
  const others = (pack.hooks || []).filter((h) => !p || h.key !== p.hook);
  if (others.length) lines.push(`Other openings seen: ${others.map((h) => `${h.label} (${h.strength ?? "?"}x, ${h.authors ?? "?"} accounts${h.early ? ", an early sign" : ""})`).join("; ")}.`);
  if (pack.type === "reel") lines.push("Openings are measured on captions, not on what's said on camera: turn the pattern into a spoken first line and on-screen words.");
  if (pack.format) lines.push(`Format: ${pack.format.statement}`);
  lines.push(pack.length ? `Length: ${pack.length.statement}` : "Length: not measured for this niche. Use the platform's usual length for this kind of post.");
  if (pack.chosen?.length) {
    lines.push("The customer chose to build on these insights:");
    for (const c of pack.chosen) lines.push(`- ${c.statement}${c.platform && c.platform !== pack.platform ? ` (measured on ${platformLabel(c.platform)})` : ""}`);
  }
  if (pack.examples.length) {
    lines.push(`Standout posts to learn from (structure and angle only, never copy their words)${pack.examplesMixed ? ", from other formats because too few of this format stood out" : ""}:`);
    for (const e of pack.examples) lines.push(`- ${e.strength ? `${e.strength}x` : ""} ${e.format || ""} by @${e.handle || "?"}: "${e.caption}"`);
  }
  if (pack.sounds.length) {
    lines.push(
      `Sounds in use now: ${pack.sounds.map((s) => `"${s.title}" (${s.commercial === true ? "cleared for brand accounts" : s.commercial === false ? "not cleared for brand accounts" : "licence unknown"})`).join(", ")}. Only recommend a sound marked cleared; otherwise point to the platform's commercial sound library.`
    );
  }
  if (pack.trends.length) lines.push(`${pack.trendsRising ? "Rising tags" : "Most used tags this week (growth not known)"}: ${pack.trends.map((t) => `#${t.tag}`).join(" ")}.`);
  if (pack.audience) {
    if (pack.audience.questions.length) lines.push(`The audience asks: ${pack.audience.questions.map((q) => `"${q.text}"`).join(", ")}.`);
    if (pack.audience.phrases.length) lines.push(`Their words: ${pack.audience.phrases.join(", ")}.`);
  }
  lines.push("Numbers above are evidence for you. Never put reach multiples or sample sizes into the content itself; they belong only in the 'why' fields.");
  return lines.join("\n");
}
