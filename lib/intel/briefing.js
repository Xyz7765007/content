import { Purse, analyzeContent, trendingNow } from "./tools";
import { findingsFromAnalysis, findingsFromTrending, saveFindings } from "./findings";
import { rows } from "./stats";
import { formatLabel, hookLabel, platformLabel } from "./taxonomy";
import { createReport, updateReport } from "./reports";
import { getSupabaseAdmin } from "../supabase/server";

// The weekly briefing on Today: three moves in the market and three ideas to
// post, built from this week's measured posts with no model in between, so
// it is free to the customer, cheap to run, and can't invent anything.

export const BRIEFING_DAYS = 7;
const BUDGET_USD = 0.05;

// A first line for each kind of opening, filled with the brand's topic.
const OPENERS = {
  question: (k) => `Why does your ${k} stop working?`,
  bold_claim: (k) => `The one ${k} change that matters most`,
  contrarian: (k) => `Stop doing this with your ${k}`,
  number_list: (k) => `5 ${k} mistakes to stop today`,
  story: (k) => `How we got ${k} wrong for a year`,
  how_to: (k) => `How to start ${k} in 3 steps`,
  before_after: (k) => `Day 1 vs day 30 of a real ${k} routine`,
  pov: (k) => `POV: your ${k} finally works`,
  myth_busting: (k) => `${k} myth: more is better`,
  social_proof: (k) => `What our customers say about ${k}`,
  trend_meme: (k) => `${k}, explained with this week's trend`,
  behind_scenes: (k) => `How our ${k} is made`,
  comparison: (k) => `${k}: this vs that`,
  challenge: (k) => `Try this ${k} for 7 days`,
  other: (k) => `What nobody tells you about ${k}`,
};

const ideaType = (format) => (format === "carousel" ? "carousel" : format === "image" ? "creative" : format === "text" ? "text" : "reel");

export function composeBriefing({ platform, ctx, trending, analysis }) {
  const keyword = ctx.keywords[0];
  const where = platformLabel(trending.platform || platform);
  const moves = [];
  // "Rising" only where the platform publishes growth; otherwise "most used".
  const rising = (trending.hashtags || []).filter((x) => x.growthPct != null && x.growthPct > 0).slice(0, 2);
  for (const h of rising) moves.push({ kind: "trend", text: `#${h.tag} is rising on ${where}, up ${h.growthPct}% this week.` });
  if (!rising.length) {
    const used = (trending.hashtags || []).filter((x) => x.growthPct == null).slice(0, 2);
    if (used.length) moves.push({ kind: "trend", text: `Most used tags in your niche on ${where} this week: ${used.map((h) => `#${h.tag}${h.posts ? ` (${h.posts} posts)` : ""}`).join(", ")}.` });
  }
  const sound = (trending.sounds || []).find((s) => s.commercial === true && s.title);
  if (sound) moves.push({ kind: "sound", text: `"${sound.title}" is ${trending.platform === "tiktok" ? "climbing the chart" : "in use in your niche"} and is cleared for brand accounts.` });
  const interest = (trending.interest || []).find((k) => k.growthPct != null && Math.abs(k.growthPct) >= 5);
  if (interest) moves.push({ kind: "interest", text: `Searches for "${interest.keyword}" are ${interest.growthPct > 0 ? "up" : "down"} ${Math.abs(interest.growthPct)}% over 4 weeks.` });
  // The leading format needs five accounts behind it; one viral post can't decide it.
  const format = (analysis.summary?.formats || []).find((g) => (g.authors ?? g.n) >= 5);
  if (format && moves.length < 3) moves.push({ kind: "format", text: `${formatLabel(format.key)} lead on ${platformLabel(platform)} this week, at ${format.medianStrength ?? "?"}x a typical post's reach (${format.authors ?? format.n} accounts).` });

  // Only openings seen across five accounts that clearly beat a typical post:
  // better two strong ideas than three where one is luck.
  const hooks = (analysis.summary?.hooks || [])
    .filter((h) => h.key !== "other" && (h.authors ?? h.n) >= 5 && (h.medianStrength ?? 0) >= 1.2)
    .sort((a, b) => (b.score ?? b.medianStrength ?? 0) - (a.score ?? a.medianStrength ?? 0))
    .slice(0, 3);
  const ideas = hooks.map((h) => ({
    title: OPENERS[h.key]?.(keyword) || OPENERS.other(keyword),
    hook: h.key,
    hookLabel: hookLabel(h.key),
    type: ideaType(format?.key),
    why: `${hookLabel(h.key)} posts reach ${h.medianStrength ?? "?"}x a typical post this week (${h.n} posts from ${h.authors ?? "?"} accounts).`,
  }));
  return {
    platform,
    posts: analysis.summary?.n || 0,
    moves: moves.slice(0, 3),
    ideas,
    evidence: rows(analysis.summary?.top || [], 3),
    sample: Boolean(trending.sample || analysis.sample),
  };
}

export async function latestBriefing(user) {
  const admin = getSupabaseAdmin();
  if (!admin || user?.id === "local") return null;
  const { data } = await admin
    .from("intel_reports")
    .select("id, kind, title, body, status, created_at")
    .eq("user_id", user.id)
    .eq("kind", "briefing")
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

export const isFresh = (b) => Boolean(b) && Date.now() - new Date(b.created_at).getTime() < BRIEFING_DAYS * 86400000;

export async function buildBriefing({ user, ctx }) {
  const platform = ctx.platforms[0];
  const purse = new Purse(BUDGET_USD);
  const env = { user, purse };
  const [trending, analysis] = await Promise.all([
    trendingNow({ platform, ctx }, env).catch(() => ({ platform, hashtags: [], sounds: [], interest: [] })),
    analyzeContent({ platform, ctx, days: 7 }, env).catch(() => ({ summary: null })),
  ]);
  const body = composeBriefing({ platform, ctx, trending, analysis });
  const report = await createReport(user, { kind: "briefing", title: `Week of ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, params: { platform }, credits: 0 });
  const saved = await saveFindings(user, [...findingsFromTrending(trending, ctx), ...(analysis.summary ? findingsFromAnalysis({ ...analysis, platform }, ctx) : [])], { type: "briefing", id: report.id });
  const full = { ...body, findingIds: saved.map((f) => f.id) };
  await updateReport(user, report.id, { status: "ready", body: full });
  return { ...report, status: "ready", body: full };
}
