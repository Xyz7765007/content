import { Purse, newsFor, trendingNow } from "./tools";
import { findingsFromTrending, saveFindings } from "./findings";
import { marketMap, platformsFor } from "./market";
import { createReport, updateReport } from "./reports";
import { platformLabel } from "./taxonomy";
import { getSupabaseAdmin } from "../supabase/server";
import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { brandBrief } from "./brand";

// The weekly briefing on Today: what moved this week on every platform where
// the brand's market talks, and the week's news. Built from this week's posts
// with no model writing anything (only the tagger labels posts), so it is free
// to the customer, cheap to run, and can't invent anything.

export const BRIEFING_DAYS = 7;
const BUDGET_USD = 0.08;

const day = (iso) => (iso ? String(iso).slice(0, 10) : null);

// The posts taking off this week, shown by what they did, never against a
// "typical post": a week's sample is too small to say what typical is.
const hotRow = (r) => ({ ...r, lift: null, beat: null });

export function composeBriefing({ ctx, map, per = [], news = { items: [] } }) {
  // A topic read off hashtags comes squashed ("skincareroutine"); the market's own phrase reads better.
  const spaced = new Map([...(map?.terms || []), ...(ctx?.keywords || [])].filter((t) => /\s/.test(String(t).trim())).map((t) => [String(t).replace(/\s+/g, "").toLowerCase(), String(t).trim().toLowerCase()]));
  const nice = (topic) => spaced.get(String(topic || "").toLowerCase()) || topic;
  const platforms = per
    .filter(Boolean)
    .map((t) => {
      // A tag in one or two posts isn't "most used" of anything.
      const tags = (t.hashtags || []).filter((h) => h.growthPct != null || h.board || (h.posts ?? 0) >= 3).slice(0, 6);
      const sounds = (t.sounds || []).filter((s) => s.title).slice(0, 4);
      return {
        platform: t.platform,
        posts: t.n || 0,
        topics: (t.topics || []).filter((x) => x.accounts >= 2).slice(0, 4).map((x) => ({ ...x, topic: nice(x.topic) })),
        hot: (t.hot || []).slice(0, 4).map(hotRow),
        hashtags: tags,
        sounds,
        note: t.regionNote || null,
      };
    })
    .filter((p) => p.posts || p.hashtags.length || p.sounds.length);

  const moves = [];
  // The biggest topic on each platform, by how many accounts are on it.
  for (const p of platforms) {
    const t = p.topics[0];
    if (t) moves.push({ kind: "topic", platform: p.platform, text: `On ${platformLabel(p.platform)}, the most talked-about topic in your niche this week is ${t.topic}: ${t.accounts} accounts, ${t.posts} posts.` });
  }
  for (const p of platforms) {
    const rising = p.hashtags.filter((h) => h.growthPct != null && h.growthPct > 0).slice(0, 2);
    if (rising.length) moves.push({ kind: "trend", platform: p.platform, text: `Rising on ${platformLabel(p.platform)}: ${rising.map((h) => `#${h.tag} (up ${h.growthPct}%)`).join(", ")}.` });
  }
  const interest = per.find((t) => t?.interest?.length)?.interest || [];
  const moved = interest.find((k) => k.growthPct != null && Math.abs(k.growthPct) >= 5);
  if (moved) moves.push({ kind: "interest", text: `Searches for "${moved.keyword}" are ${moved.growthPct > 0 ? "up" : "down"} ${Math.abs(moved.growthPct)}% over 4 weeks.` });

  // Ideas from what most accounts are posting about, without claims about reach.
  const ideas = platforms
    .flatMap((p) => p.topics.slice(0, 1).map((t) => ({ platform: p.platform, topic: t.topic, accounts: t.accounts })))
    .slice(0, 3)
    .map((x) => ({
      title: `Your take on ${x.topic}`,
      type: x.platform === "linkedin" || x.platform === "x" || x.platform === "reddit" ? "text" : "reel",
      why: `${x.accounts} accounts in your niche posted about ${x.topic} on ${platformLabel(x.platform)} this week.`,
      platform: x.platform,
    }));

  const total = platforms.reduce((s, p) => s + p.posts, 0);
  return {
    v: 2,
    market: map?.summary || ctx?.niche || null,
    platforms,
    posts: total,
    moves: moves.slice(0, 5),
    ideas,
    news: (news.items || []).slice(0, 6).map((a) => ({ title: a.title, source: a.source, url: a.url, date: day(a.postedAt) })),
    // Kept for briefings read by older screens.
    platform: platforms[0]?.platform || ctx?.platforms?.[0] || null,
    evidence: platforms.flatMap((p) => p.hot.slice(0, 1)),
    thin: total < 10,
    sample: Boolean(per.some((t) => t?.sample) || news.sample),
  };
}

const IDEAS_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, platform: { type: "string" }, type: { type: "string", enum: ["reel", "carousel", "creative", "text"] }, why: { type: "string" } },
        required: ["title", "platform", "type", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["ideas"],
  additionalProperties: false,
};

// Three things to post this week, written from what actually moved: each one
// names the topic and how many accounts are on it. Haiku, about $0.002.
async function writeIdeas(body, ctx, user) {
  const moving = body.platforms.filter((p) => p.topics.length || p.hot.length);
  if (!moving.length) return body.ideas;
  const evidence = moving
    .map((p) => `${platformLabel(p.platform)}: topics ${p.topics.map((t) => `${t.topic} (${t.accounts} accounts, ${t.posts} posts)`).join(", ") || "none clear"}; posts taking off: ${p.hot.slice(0, 3).map((h) => `"${String(h.caption || "").slice(0, 120)}"`).join(" / ") || "none"}`)
    .join("\n");
  const message = await anthropic().messages.create({
    model: MODELS.quick.id,
    max_tokens: 2000,
    output_config: { effort: "low", format: { type: "json_schema", schema: IDEAS_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `${brandBrief(ctx)}

This week in this brand's market:
${evidence}

Suggest 3 posts this brand could make this week that ride what's moving above, in its voice. For each: title (the post's angle in under 12 words, specific, not "your take on X"), platform (one of: ${moving.map((p) => p.platform).join(", ")}), type (reel, carousel, creative or text), why (one sentence citing the topic and how many accounts are on it, only numbers given above). Skip deals and giveaways.`,
      },
    ],
  });
  await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind: "briefing-ideas", model: message.model, usage: message.usage });
  const ideas = (JSON.parse(textOf(message) || "{}").ideas || []).filter((i) => moving.some((p) => p.platform === i.platform)).slice(0, 3);
  return ideas.length ? ideas.map((i) => ({ title: String(i.title).slice(0, 120), platform: i.platform, type: i.type, why: String(i.why).slice(0, 200) })) : body.ideas;
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
    .limit(5);
  // Stand-in briefings and real ones share a table; each side reads its own.
  const mine = (data || []).filter((b) => Boolean(b.body?.sample) === isMock());
  return mine[0] || null;
}

// A briefing in the old one-platform shape is out of date whatever its age:
// the next visit rebuilds it across the market's platforms.
export const isFresh = (b) => Boolean(b) && b.body?.v === 2 && Date.now() - new Date(b.created_at).getTime() < BRIEFING_DAYS * 86400000;

// The platforms a briefing can read, in the order they're offered.
export const BRIEFING_PLATFORMS = ["instagram", "tiktok", "youtube", "x", "linkedin", "reddit"];
export const BRIEFING_MAX = 5;
export const pickedPlatforms = (list) => [...new Set((Array.isArray(list) ? list : []).filter((p) => BRIEFING_PLATFORMS.includes(p)))].slice(0, BRIEFING_MAX);

// Exactly the platforms the person picked, or else theirs plus where their
// market talks.
export async function buildBriefing({ user, ctx, picked = [] }) {
  const map = await marketMap(ctx, { user });
  const chosen = pickedPlatforms(picked);
  const platforms = chosen.length ? chosen : platformsFor(map, { include: ctx.platforms, max: 4 });
  const purse = new Purse(BUDGET_USD);
  const env = { user, purse };
  const [per, news] = await Promise.all([
    Promise.all(platforms.map((platform) => trendingNow({ platform, ctx, map, depth: "quick" }, env).catch(() => null))),
    newsFor({ ctx, map, days: 7, depth: "quick" }, env).catch(() => ({ items: [] })),
  ]);
  const body = composeBriefing({ ctx, map, per, news });
  if (!isMock()) body.ideas = await writeIdeas(body, ctx, user).catch(() => body.ideas);
  const report = await createReport(user, { kind: "briefing", title: `Week of ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, params: { platforms, picked: chosen.length > 0 }, credits: 0 });
  const saved = await saveFindings(user, per.filter(Boolean).flatMap((t) => findingsFromTrending(t, ctx)), { type: "briefing", id: report.id });
  // The platforms it was asked to read, even those quiet this week: what the picker shows as chosen.
  const full = { ...body, asked: platforms, picked: chosen.length > 0, findingIds: saved.map((f) => f.id) };
  await updateReport(user, report.id, { status: "ready", body: full });
  return { ...report, status: "ready", body: full };
}
