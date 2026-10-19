import { isMock } from "../ai/client";
import { getSupabaseAdmin } from "../supabase/server";
import { formatLabel, hookLabel, lengthBucket, platformLabel } from "./taxonomy";
import { strength } from "./stats";

// What Huesy knows about a customer's market, one fact at a time: "Before and
// after reels get 3.1x typical reach in skincare on Instagram (24 posts, last
// 14 days)". Every finding is derived by code from measured stats and keeps
// the posts that prove it, so content can be grounded in it and anyone can
// check it. The studio reads findings; the chat recalls them for free.

const memory = new Map();
const useMemory = () => !getSupabaseAdmin();

const x = (n) => (n == null ? "?" : `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10}x`);
const pct = (n) => (n == null ? null : `${Math.round(n * 1000) / 10}%`);

export const evidenceOf = (posts, limit = 3) =>
  posts.slice(0, limit).map((p) => ({
    url: p.url,
    handle: p.author?.handle || null,
    platform: p.platform,
    format: p.format,
    caption: String(p.caption || "").replace(/\s+/g, " ").slice(0, 160),
    views: p.metrics?.views ?? null,
    likes: p.metrics?.likes ?? null,
    strength: strength(p),
    hook: p.tags?.hook || null,
    postedAt: p.postedAt || null,
    thumbnail: p.thumbnail || null,
  }));

// Confidence from how many accounts show the pattern and how reliably they
// beat the norm (the cautious lower bound).
const confidence = (authors, consistencyLow) => Math.round(Math.min(1, (Math.min(authors || 0, 20) / 20) * 0.6 + (consistencyLow ?? 0.3) * 0.4) * 100) / 100;

const sizeWords = (g) => `${g.n} ${g.n === 1 ? "post" : "posts"} from ${g.authors} ${g.authors === 1 ? "account" : "accounts"}`;
const metricsOf = (g) => ({ key: g.key, n: g.n, authors: g.authors, strength: g.medianStrength, score: g.score, consistency: g.consistency, consistencyLow: g.consistencyLow, er: g.medianEr });

// Findings from one content analysis. An early read (too few on-topic posts)
// keeps its standout posts but saves no patterns.
export function findingsFromAnalysis(a, ctx) {
  if (!a || a.empty || !a.summary?.n) return [];
  const s = a.summary;
  const where = `on ${platformLabel(a.platform)}`;
  const about = a.query || ctx?.niche || "this niche";
  const inFormat = a.focus ? ` in ${formatLabel(a.focus).toLowerCase()}` : "";
  const scope = { niche: ctx?.niche || null, query: about, topic: a.topic || null, topicFound: Boolean(a.topicFound), region: ctx?.region || null, focus: a.focus || null, requestedFocus: a.requestedFocus || null, thin: Boolean(a.thin) };
  const out = [];
  const postsOf = (test) => a.posts.filter((p) => p.calc?.settled !== false).filter(test).sort((p, q) => (strength(q) ?? 0) - (strength(p) ?? 0));

  if (!a.thin) {
    for (const g of s.formats.filter((g) => g.authors >= 3).slice(0, 3)) {
      out.push({
        kind: "format",
        platform: a.platform,
        statement: `${formatLabel(g.key)} about ${about} ${where} reach ${x(g.medianStrength)} a typical post (${sizeWords(g)}${g.medianEr != null ? `, ${pct(g.medianEr)} engagement` : ""}).`,
        metrics: { ...metricsOf(g), share: g.share },
        evidence: evidenceOf(postsOf((p) => p.format === g.key)),
        scope: { ...scope, key: g.key },
        confidence: confidence(g.authors, g.consistencyLow),
      });
    }
    for (const g of s.hooks.filter((g) => g.authors >= 3 && g.key !== "other").slice(0, 4)) {
      out.push({
        kind: "hook",
        platform: a.platform,
        statement: `${hookLabel(g.key)} openings about ${about}${inFormat} ${where} reach ${x(g.medianStrength)} a typical post (${sizeWords(g)}, ${Math.round((g.consistency ?? 0) * 100)}% of those accounts beat the norm).`,
        metrics: metricsOf(g),
        evidence: evidenceOf(postsOf((p) => p.tags?.hook === g.key)),
        scope: { ...scope, key: g.key },
        confidence: confidence(g.authors, g.consistencyLow),
      });
    }
    const lengths = s.lengths.filter((g) => g.authors >= 3);
    if (lengths.length >= 2) {
      const g = lengths[0];
      out.push({
        kind: "length",
        platform: a.platform,
        statement: `${g.key} videos about ${about} ${where} perform best, at ${x(g.medianStrength)} a typical post (${sizeWords(g)}).`,
        metrics: { ...metricsOf(g), others: lengths.slice(1).map((o) => ({ key: o.key, strength: o.medianStrength, n: o.n, authors: o.authors })) },
        evidence: evidenceOf(postsOf((p) => lengthBucket(p.durationS) === g.key)),
        scope: { ...scope, key: g.key },
        confidence: confidence(g.authors, g.consistencyLow),
      });
    }
  }
  for (const g of s.sounds.slice(0, 2)) {
    out.push({
      kind: "sound",
      platform: a.platform,
      statement: `The sound "${g.key}" is used in ${sizeWords(g)} about ${about} ${where} recently. Its licence for brand accounts isn't known.`,
      metrics: { key: g.key, n: g.n, authors: g.authors, strength: g.medianStrength, sounds: [{ title: g.key, uses: g.n, commercial: null }] },
      evidence: evidenceOf(postsOf((p) => p.sound?.title === g.key)),
      scope: { ...scope, key: g.key },
      confidence: confidence(g.authors, g.consistencyLow),
    });
  }
  if (s.hashtags.length >= 3) {
    out.push({
      kind: "hashtag",
      platform: a.platform,
      statement: `Most used tags in recent ${about} posts ${where}: ${s.hashtags.slice(0, 6).map((h) => `#${h.tag}`).join(" ")}.`,
      metrics: { tags: s.hashtags.slice(0, 10), n: s.n },
      evidence: [],
      scope: { ...scope, key: "tags" },
      confidence: confidence(s.n, 0.3),
    });
  }
  if (s.top.length) {
    const best = s.top[0];
    out.push({
      kind: "examples",
      platform: a.platform,
      statement: `${s.top.length} standout posts about ${about}${inFormat} ${where}, the best at ${x(strength(best))} ${best.calc?.beat != null ? "its account's normal reach" : "a typical post's reach"}.`,
      metrics: { n: s.n, standouts: s.top.length, windowDays: a.days },
      evidence: evidenceOf(s.top, 8),
      scope: { ...scope, key: "examples" },
      confidence: confidence(new Set(s.top.map((p) => p.author?.handle)).size, 0.4),
    });
  }
  return out.map((f) => ({ ...f, window_days: a.days }));
}

// Findings from what's moving on a platform. "Rising" is only said where the
// platform publishes growth; elsewhere it's "most used this week".
export function findingsFromTrending(t, ctx) {
  const out = [];
  const scope = { niche: ctx?.niche || null, region: t.region || ctx?.region || null };
  const withGrowth = (t.hashtags || []).filter((h) => h.growthPct != null);
  const rising = withGrowth.filter((h) => h.growthPct > 0).slice(0, 5);
  // A tag in one or two posts isn't "most used" of anything.
  const used = (t.hashtags || []).filter((h) => h.growthPct == null && (h.posts == null || h.posts >= 3)).slice(0, 5);
  if (rising.length) {
    out.push({
      kind: "trend",
      platform: t.platform,
      statement: `Rising on ${platformLabel(t.platform)} this week: ${rising.map((h) => `#${h.tag} (+${h.growthPct}%)`).join(", ")}.`,
      metrics: { tags: rising, rising: true },
      evidence: [],
      scope: { ...scope, key: "hashtags" },
      confidence: 0.7,
      window_days: 7,
    });
  } else if (used.length) {
    out.push({
      kind: "trend",
      platform: t.platform,
      statement: `${platformLabel(t.platform)} doesn't publish trend growth, so these are the most used tags in your niche this week: ${used.map((h) => `#${h.tag}${h.posts ? ` (${h.posts} posts)` : ""}`).join(", ")}.`,
      metrics: { tags: used, rising: false },
      evidence: [],
      scope: { ...scope, key: "hashtags" },
      confidence: 0.5,
      window_days: 7,
    });
  }
  const sounds = (t.sounds || []).filter((s) => s.title).slice(0, 6);
  if (sounds.length) {
    const cleared = sounds.filter((s) => s.commercial === true);
    const chart = t.platform === "tiktok";
    out.push({
      kind: "sound",
      platform: t.platform,
      statement: `${chart ? "Sounds climbing the chart" : "Sounds used most in your niche"} on ${platformLabel(t.platform)}: ${sounds.slice(0, 4).map((s) => `"${s.title}"`).join(", ")}. ${cleared.length ? `Cleared for brand accounts: ${cleared.slice(0, 3).map((s) => `"${s.title}"`).join(", ")}.` : "None is confirmed as cleared for brand accounts."}`,
      metrics: { sounds, chart },
      evidence: [],
      scope: { ...scope, key: "chart" },
      confidence: chart ? 0.7 : 0.5,
      window_days: 7,
    });
  }
  for (const k of (t.interest || []).filter((k) => k.growthPct != null)) {
    out.push({
      kind: "interest",
      platform: "google",
      statement: `Search interest in "${k.keyword}" is ${k.growthPct >= 0 ? "up" : "down"} ${Math.abs(k.growthPct)}% over the last 4 weeks${ctx?.region && ctx.region !== "Global" ? ` in ${ctx.region}` : ""}.`,
      metrics: k,
      evidence: [],
      scope: { ...scope, key: k.keyword },
      confidence: 0.8,
      window_days: 28,
    });
  }
  return out;
}

export function findingsFromAccount(a, ctx) {
  if (!a || a.unsupported || a.missing) return [];
  const s = a.summary || {};
  const topFormat = s.formats?.[0];
  const topHook = s.hooks?.[0];
  return [
    {
      kind: "competitor",
      platform: a.platform,
      statement: `${a.platform === "linkedin" || a.platform === "facebook" ? a.profile?.name || a.handle : `@${a.handle}`} on ${platformLabel(a.platform)} posts ${a.cadence?.perWeek ?? "?"} times a week${a.profile?.followers ? ` to ${a.profile.followers.toLocaleString("en-US")} followers` : ""}. Their breakouts: ${a.breakouts?.length || 0} of their last ${a.posts?.length || 0} posts${topFormat ? `, mostly ${formatLabel(topFormat.key).toLowerCase()}` : ""}${topHook && topHook.key !== "other" ? `, often ${hookLabel(topHook.key).toLowerCase()}` : ""}.`,
      metrics: { handle: a.handle, followers: a.profile?.followers ?? null, cadence: a.cadence, normal: a.normal, formats: s.formats?.slice(0, 3), hooks: s.hooks?.slice(0, 3) },
      evidence: (a.breakouts || []).map((r) => ({ url: r.url, handle: a.handle, platform: a.platform, format: r.format, caption: r.caption, views: r.views, likes: r.likes, strength: r.beat ?? r.lift })),
      scope: { niche: ctx?.niche || null, key: a.handle },
      confidence: confidence(a.posts?.length || 0, 0.6),
      window_days: a.cadence?.spanDays || 30,
    },
  ];
}

const VOICE_PLATFORM = { Reddit: "reddit", X: "x", YouTube: "youtube", Instagram: "instagram", TikTok: "tiktok", LinkedIn: "linkedin" };

export function findingsFromVoice(v, ctx) {
  if (!v || !v.read) return [];
  // The lines behind the top questions and frustrations, so the finding links back to them.
  const linked = [...(v.questions || []), ...(v.pains || [])].flatMap((q) => q.examples || (q.example ? [q.example] : [])).filter((e) => e?.url);
  const evidence = [...new Map(linked.map((e) => [e.url, { url: e.url, platform: VOICE_PLATFORM[e.src] || null, source: e.src, caption: String(e.text || "").slice(0, 160) }])).values()].slice(0, 3);
  const list = (items, label) => (items || []).slice(0, 3).map((q) => `"${q.text}"${q.count > 1 ? ` (${q.count})` : ""}`).join(", ");
  return [
    {
      kind: "audience",
      platform: v.platform,
      statement: `What people ask about ${v.query}: ${list(v.questions) || "nothing clear yet"}. Top frustrations: ${list(v.pains) || "none stood out"}.`,
      metrics: { questions: v.questions, pains: v.pains, desires: v.desires, objections: v.objections || [], phrases: v.phrases, read: v.read, bySource: v.bySource || null },
      evidence,
      scope: { niche: ctx?.niche || null, query: v.query, key: "voice" },
      confidence: confidence(v.read, 0.5),
      window_days: 30,
    },
  ];
}

// Saves findings, tagged with where they came from. Returns them with ids.
export async function saveFindings(user, findings, source) {
  if (!findings.length) return [];
  const rows = findings.map((f) => ({
    user_id: user.id,
    kind: f.kind,
    platform: f.platform || null,
    statement: f.statement,
    metrics: f.metrics || null,
    evidence: f.evidence || [],
    window_days: f.window_days ?? null,
    scope: f.scope || null,
    confidence: f.confidence ?? null,
    source: source || null,
    // Facts measured on the stand-in are marked, and only ever read back by
    // stand-in runs, so practice data never passes for real evidence.
    sample: isMock(),
  }));
  if (useMemory() || user.id === "local") {
    const list = memory.get(user.id) || [];
    const saved = rows.map((r) => ({ ...r, id: `f${Math.random().toString(36).slice(2, 10)}`, fetched_at: new Date().toISOString(), created_at: new Date().toISOString() }));
    memory.set(user.id, [...saved, ...list].slice(0, 500));
    return saved;
  }
  const { data, error } = await getSupabaseAdmin()
    .from("intel_findings")
    .insert(rows)
    .select("*");
  if (error) {
    console.error("[huesy:findings] save", error.message);
    return [];
  }
  return data;
}

// The newest findings, optionally narrowed by platform, kind and age.
export async function queryFindings(user, { platform, kinds, sinceDays = 60, limit = 60, ids } = {}) {
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  if (useMemory() || user.id === "local") {
    return (memory.get(user.id) || [])
      .filter((f) => (!ids || ids.includes(f.id)) && (!platform || f.platform === platform) && (!kinds || kinds.includes(f.kind)) && f.fetched_at >= since)
      .slice(0, limit);
  }
  let q = getSupabaseAdmin().from("intel_findings").select("*").eq("user_id", user.id).eq("sample", isMock()).order("fetched_at", { ascending: false }).limit(limit);
  if (ids?.length) q = q.in("id", ids);
  else q = q.gte("fetched_at", since);
  if (platform) q = q.eq("platform", platform);
  if (kinds?.length) q = q.in("kind", kinds);
  const { data, error } = await q;
  if (error) {
    console.error("[huesy:findings] query", error.message);
    return [];
  }
  return data || [];
}

// Latest finding per (kind, platform, key): newer facts replace older ones.
export function latestOnly(findings) {
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.kind}|${f.platform}|${f.scope?.key || f.statement}|${f.scope?.query || ""}|${f.scope?.focus || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const ageDays = (f) => Math.round((Date.now() - new Date(f.fetched_at || f.created_at).getTime()) / 86400000);
