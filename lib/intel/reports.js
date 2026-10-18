import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS, SONNET_FALLBACK } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { fail } from "../ai/errors";
import { getSupabaseAdmin } from "../supabase/server";
import { brandBrief } from "./brand";
import { Purse, accountSnapshot, adsFor, analyzeContent, audienceVoice, findCreators, newsFor, trendingNow } from "./tools";
import { summarize, rows, strength } from "./stats";
import { solid } from "./agent";
import { findingsFromAccount, findingsFromAnalysis, findingsFromTrending, findingsFromVoice, saveFindings } from "./findings";
import { formatLabel, hookLabel, platformLabel } from "./taxonomy";
import { REPORTS } from "./kinds";

// Deep reports: each kind has a fixed data plan, so what it reads is known
// before it runs; the numbers are computed here; Sonnet only writes up what
// was measured, into a fixed shape the report page renders.

const BUDGETS = { trends: 0.12, playbook: 0.2, competitors: 0.15, audience: 0.1, creators: 0.45 };
export const REPORT_KINDS = Object.fromEntries(Object.entries(REPORTS).map(([k, v]) => [k, { label: v.label, blurb: v.blurb, budget: BUDGETS[k] }]));

const mem = new Map();
const useMemory = (user) => !getSupabaseAdmin() || user?.id === "local";

export async function createReport(user, { kind, title, params, credits }) {
  const row = { user_id: user.id, kind, title, params, credits, status: "running" };
  if (useMemory(user)) {
    const r = { ...row, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mem.set(r.id, r);
    return r;
  }
  const { data, error } = await getSupabaseAdmin().from("intel_reports").insert(row).select("*").single();
  if (error) throw fail("failed", 500);
  return data;
}

export async function updateReport(user, id, patch) {
  if (useMemory(user)) {
    const r = mem.get(id);
    if (r) mem.set(id, { ...r, ...patch, updated_at: new Date().toISOString() });
    return;
  }
  const { error } = await getSupabaseAdmin().from("intel_reports").update(patch).eq("id", id).eq("user_id", user.id);
  if (error) console.error("[huesy:reports] update", error.message);
}

export async function getReport(user, id) {
  if (useMemory(user)) {
    const r = mem.get(id);
    return r && r.user_id === user.id ? r : null;
  }
  const { data } = await getSupabaseAdmin().from("intel_reports").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  return data || null;
}

export async function listReports(user, limit = 50) {
  if (useMemory(user)) return [...mem.values()].filter((r) => r.user_id === user.id && r.kind !== "briefing").sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
  const { data } = await getSupabaseAdmin()
    .from("intel_reports")
    .select("id, kind, title, params, credits, status, created_at, updated_at")
    .eq("user_id", user.id)
    .neq("kind", "briefing")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

export function reportTitle(kind, params, ctx) {
  const where = params.platform ? ` on ${platformLabel(params.platform)}` : "";
  switch (kind) {
    case "trends":
      return `Trend radar${where}`;
    case "playbook":
      return `${params.format ? `${formatLabel(params.format)} playbook` : "Content playbook"}${params.topic ? ` for ${params.topic}` : ""}${where}`;
    case "competitors":
      return `Competitors: ${(params.handles || []).map((h) => `@${h}`).join(", ") || ctx.niche}`;
    case "audience":
      return `Audience voice: ${params.topic || ctx.keywords[0]}`;
    case "creators":
      return `Creators in ${params.topic || ctx.keywords[0]}${where}`;
    default:
      return "Report";
  }
}

const merge = (analyses) => {
  const seen = new Set();
  const posts = analyses.flatMap((a) => a.posts || []).filter((p) => {
    const k = `${p.platform}:${p.id || p.url}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { posts, summary: summarize(posts, { top: 10 }) };
};

// Charts show only groups seen in at least three accounts.
const chart = (groups, labelOf) =>
  (groups || [])
    .filter((g) => (g.authors ?? g.n) >= 3)
    .slice(0, 6)
    .map((g) => ({ label: labelOf(g.key), value: g.medianStrength, n: g.n, accounts: g.authors ?? null }));

// Gathers the data for a report. Returns { data, findings, evidence }.
async function gather(kind, params, ctx, env) {
  const { onStep } = env;
  const platform = params.platform || ctx.platforms[0];
  if (kind === "trends") {
    const [t, a, n] = await Promise.all([
      trendingNow({ platform, ctx }, env),
      analyzeContent({ platform, ctx, days: 7 }, env),
      newsFor({ query: ctx.keywords[0], ctx }, env),
    ]);
    return {
      data: { platform, trending: t, recent: { n: a.summary.n, formats: solid(a.summary.formats, 4), hooks: solid(a.summary.hooks, 5), top: rows(a.summary.top, 6) }, news: n.items.slice(0, 6) },
      findings: [...findingsFromTrending(t, ctx), ...findingsFromAnalysis(a, ctx)],
      evidence: rows(a.summary.top, 6),
      charts: { hooks: chart(a.summary.hooks, hookLabel), formats: chart(a.summary.formats, formatLabel) },
      sample: t.sample || a.sample,
    };
  }
  if (kind === "playbook") {
    const queries = [...new Set([params.topic, ...ctx.keywords].filter(Boolean))].slice(0, 3);
    const analyses = await Promise.all(queries.map((q) => analyzeContent({ platform, query: q, ctx, days: 30, focus: params.format || null }, env)));
    const { posts, summary } = merge(analyses);
    const competitors = (ctx.competitors?.[platform] || []).slice(0, 2);
    const snaps = await Promise.all(competitors.map((h) => accountSnapshot({ platform, handle: h }, { ...env, ctx })));
    const focusApplied = analyses.every((a) => a.focus) ? params.format || null : null;
    const combined = { platform, days: 30, query: queries[0], topic: params.topic || null, focus: focusApplied, requestedFocus: params.format || null, thin: summary.n < 10, summary, posts };
    return {
      data: {
        platform,
        posts: summary.n,
        format: focusApplied || "all formats",
        earlyRead: summary.n < 20 ? `Only ${summary.n} on-topic posts: treat this as an early read.` : undefined,
        medianEngagementPct: summary.medianErPct,
        formats: solid(summary.formats, 5),
        hooks: solid(summary.hooks, 8),
        lengths: solid(summary.lengths, 4),
        sounds: summary.sounds.slice(0, 4),
        hashtags: summary.hashtags.slice(0, 10),
        top: rows(summary.top, 10),
        competitors: snaps.filter((s) => !s.missing && !s.unsupported).map((s) => ({ handle: s.handle, cadence: s.cadence, breakouts: s.breakouts?.slice(0, 2) })),
      },
      findings: [...findingsFromAnalysis(combined, ctx), ...snaps.flatMap((s) => findingsFromAccount(s, ctx))],
      evidence: rows(summary.top, 8),
      charts: { hooks: chart(summary.hooks, hookLabel), formats: chart(summary.formats, formatLabel), lengths: chart(summary.lengths, (k) => k) },
      sample: analyses.some((a) => a.sample),
    };
  }
  if (kind === "competitors") {
    const handles = (params.handles?.length ? params.handles : ctx.competitors?.[platform] || ctx.competitors?.instagram || []).slice(0, 4);
    if (!handles.length) throw fail("bad_request", 400);
    const snaps = await Promise.all(handles.map((h) => accountSnapshot({ platform: platform === "tiktok" ? "tiktok" : "instagram", handle: h }, { ...env, ctx })));
    // The niche as a whole, so "gaps" means what works in the niche that
    // these accounts don't do.
    const [niche, ads] = await Promise.all([analyzeContent({ platform: platform === "tiktok" ? "tiktok" : "instagram", ctx, days: 30 }, env).catch(() => null), adsFor({ query: ctx.keywords[0] }, env)]);
    return {
      data: {
        accounts: snaps.map((s) =>
          s.missing || s.unsupported
            ? { handle: s.handle, note: "Couldn't read this account." }
            : {
                handle: s.handle,
                followers: s.profile?.followers ?? null,
                postsPerWeek: s.cadence?.perWeek ?? null,
                normalViews: s.normal?.views ?? null,
                normalLikes: s.normal?.likes ?? null,
                formats: s.summary?.formats?.slice(0, 3),
                hooks: s.summary?.hooks?.slice(0, 3),
                breakouts: s.breakouts?.slice(0, 3),
              }
        ),
        niche: niche?.summary?.n ? { posts: niche.summary.n, hooks: solid(niche.summary.hooks, 5), formats: solid(niche.summary.formats, 4) } : null,
        adsInCategory: ads.ads.slice(0, 6),
      },
      findings: [...snaps.flatMap((s) => findingsFromAccount(s, ctx)), ...(niche ? findingsFromAnalysis(niche, ctx) : [])],
      evidence: snaps.flatMap((s) => (s.breakouts || []).slice(0, 2)),
      charts: { cadence: snaps.filter((s) => s.cadence).map((s) => ({ label: `@${s.handle}`, value: s.cadence.perWeek, n: s.cadence.posts })) },
      sample: snaps.some((s) => s.sample),
    };
  }
  if (kind === "audience") {
    const voice = await audienceVoice({ platform: platform === "tiktok" ? "instagram" : platform, query: params.topic || ctx.keywords[0], ctx }, env);
    return {
      data: { read: voice.read, questions: voice.questions, pains: voice.pains, desires: voice.desires, phrases: voice.phrases, threads: voice.threads },
      findings: findingsFromVoice(voice, ctx),
      evidence: [],
      charts: { questions: (voice.questions || []).slice(0, 6).map((q) => ({ label: q.text, value: q.count, n: q.count })) },
      sample: voice.sample,
    };
  }
  if (kind === "creators") {
    const r = await findCreators({ platform: platform === "tiktok" ? "tiktok" : "instagram", keywords: params.topic ? [params.topic] : [], followers: params.followers || {}, ctx }, env);
    if (r.error && !r.creators.length) throw fail("data_unavailable", 503);
    return { data: { creators: r.creators }, findings: [], evidence: [], charts: {}, sample: r.sample };
  }
  throw fail("bad_request", 400);
}

const BODY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    sections: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"], additionalProperties: false },
    },
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, format: { type: "string" }, hook: { type: "string" }, why: { type: "string" } },
        required: ["title", "format", "hook", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "sections", "ideas"],
  additionalProperties: false,
};

const GUIDE = {
  trends: "Sections: What's rising (hashtags and topics with growth), Sounds to use (say which are cleared for brand accounts), Formats moving this week, In the news, What to post this week.",
  playbook: "Sections: The patterns that win (each with its reach number and sample size), Formulas (hook line pattern + structure for the top 3 patterns, written as fill-in-the-blank templates), Length and pacing, Sounds and tags, What competitors do (if any), What to avoid.",
  competitors: "Sections: one per account (cadence, normal reach, what breaks out for them), Side by side, Ads in your category (these are ads for the niche's keywords, not necessarily these accounts' ads), Gaps you can own (openings and formats that work across the niche data that these accounts don't use; only if the niche data shows them).",
  audience: "Sections: Top questions (with counts), Frustrations, What they want, Words to borrow (their exact phrases), Content that answers them.",
};

async function writeUp(kind, data, ctx, user) {
  if (isMock()) return mockWriteUp(kind, data, ctx);
  const prompt = `${brandBrief(ctx)}

Write a ${REPORT_KINDS[kind].label} for this brand from the measured data below.
${GUIDE[kind]}
Rules: use only this data. Quote numbers with their sample sizes as posts and accounts. "strength" or "reach" is how many times a typical post a group gets. Groups marked early are seen in fewer than five accounts: call them early signs, never lead with them. If the data has an earlyRead note, say so in the summary. Plain words, short paragraphs and bullets, markdown allowed inside section bodies, links to example posts as markdown links. Never name data providers or tools. The summary is 2-3 sentences: the single most useful takeaway first. Give up to 5 ideas, one per measured pattern seen in at least 5 accounts (fewer ideas when there are fewer such patterns; none is fine), each a concrete post they can make: title, format (reel, carousel, image, text or video), the hook line, and why it should work (cite the number and sample).

Data:
${JSON.stringify(data).slice(0, 60000)}`;
  const message = await anthropic().beta.messages.create({
    model: MODELS.write.id,
    max_tokens: 6000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: BODY_SCHEMA } },
    ...SONNET_FALLBACK,
    messages: [{ role: "user", content: prompt }],
  });
  await recordUsage({ userId: user.id !== "local" ? user.id : null, kind: `report:${kind}`, model: message.model, usage: message.usage });
  if (message.stop_reason === "refusal") throw fail("declined", 422);
  return JSON.parse(textOf(message) || "{}");
}

function mockWriteUp(kind, data, ctx) {
  const ideas = (data.hooks || data.recent?.hooks || []).filter((h) => (h.authors ?? h.n) >= 5).slice(0, 5).map((h, i) => ({
    title: `${hookLabel(h.key)} about ${ctx.keywords[0]}`,
    format: (data.formats || data.recent?.formats || [])[0]?.key || "reel",
    hook: [`Day 1 vs day 30 of my ${ctx.keywords[0]} reset`, `Why does your ${ctx.keywords[0]} stop working?`, `5 ${ctx.keywords[0]} mistakes to stop today`, `POV: your ${ctx.keywords[0]} finally works`, `${ctx.keywords[0]} myth: more is better`][i % 5],
    why: `${hookLabel(h.key)} posts reach ${h.medianStrength ?? "?"}x a typical post (${h.n} posts).`,
  }));

  const sections = {
    trends: [
      { title: "What's rising", body: (data.trending?.hashtags || []).slice(0, 5).map((h) => `- #${h.tag}${h.growthPct != null ? ` (${h.growthPct > 0 ? "+" : ""}${h.growthPct}%)` : ""}`).join("\n") || "Nothing clear this week." },
      { title: "Sounds to use", body: (data.trending?.sounds || []).slice(0, 4).map((s) => `- "${s.title}"${s.commercial === false ? " (not cleared for brand accounts)" : ""}`).join("\n") || "No sound stands out." },
      { title: "What to post this week", body: `Lean into ${hookLabel(data.recent?.hooks?.[0]?.key)} openings: they reach ${data.recent?.hooks?.[0]?.medianStrength ?? "?"}x a typical post across ${data.recent?.n ?? 0} posts from the last 7 days.` },
    ],
    playbook: [
      { title: "The patterns that win", body: (data.hooks || []).slice(0, 4).map((h) => `- **${hookLabel(h.key)}**: ${h.medianStrength ?? "?"}x typical reach (${h.n} posts)`).join("\n") },
      { title: "Formulas", body: `1. Day 1 vs day 30 of [routine]. Show the start, the middle, the result.\n2. Why does your [thing] stop working? Name the cause, give the fix.\n3. [Number] [topic] mistakes. One per slide, the fix on the last.` },
      { title: "Length and pacing", body: (data.lengths || []).slice(0, 3).map((l) => `- ${l.key}: ${l.medianStrength ?? "?"}x (${l.n})`).join("\n") || "Not enough videos to say." },
    ],
    competitors: (data.accounts || []).map((a) => ({ title: `@${a.handle}`, body: a.note || `Posts ${a.postsPerWeek ?? "?"} times a week. ${(a.breakouts || []).length} recent breakouts.` })),
    audience: [
      { title: "Top questions", body: (data.questions || []).slice(0, 6).map((q) => `- ${q.text} (${q.count})`).join("\n") || "No clear questions yet." },
      { title: "Frustrations", body: (data.pains || []).slice(0, 5).map((q) => `- ${q.text} (${q.count})`).join("\n") || "None stood out." },
    ],
  }[kind] || [];
  return { summary: `Sample report for ${ctx.name}. ${sections[0]?.body?.split("\n")[0]?.replace(/^- /, "") || ""}`.trim(), sections, ideas };
}

// A report with nothing measured in it isn't worth its credits.
const isEmpty = (kind, d) => {
  switch (kind) {
    case "trends":
      return !d.trending?.hashtags?.length && !d.trending?.sounds?.length && !d.trending?.interest?.length && !d.recent?.n && !d.news?.length;
    case "playbook":
      return (d.posts || 0) < 8;
    case "competitors":
      return !(d.accounts || []).some((a) => !a.note);
    case "audience":
      return !d.read;
    case "creators":
      return !d.creators?.length;
    default:
      return false;
  }
};

// Runs a report from start to finish. Saves progress so the page can show it.
export async function runReport({ user, report, kind, params, ctx, onStep }) {
  const env = { user, purse: new Purse(REPORT_KINDS[kind].budget), onStep };
  const gathered = await gather(kind, params, ctx, env);
  if (isEmpty(kind, gathered.data)) throw fail("no_data", 404);
  onStep({ id: "write", label: kind === "creators" ? "Ranking creators" : "Writing it up", status: "running" });
  const body = kind === "creators" ? { summary: `${gathered.data.creators.length} creators found.`, sections: [], ideas: [] } : await writeUp(kind, gathered.data, ctx, user);
  onStep({ id: "write", label: kind === "creators" ? "Ranked" : "Written", status: "done" });
  const saved = await saveFindings(user, gathered.findings, { type: "report", id: report.id });
  const full = {
    ...body,
    data: gathered.data,
    charts: gathered.charts,
    evidence: gathered.evidence,
    findingIds: saved.map((f) => f.id),
    sample: Boolean(gathered.sample),
  };
  await updateReport(user, report.id, { status: "ready", body: full });
  return full;
}
