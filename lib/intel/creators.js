import { collect } from "./collect";
import { fetchCap } from "./source";
import { marketMap, countryName } from "./market";
import { postJobs } from "./plan";
import { enrich, rows } from "./stats";
import { platformLabel } from "./taxonomy";
import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { fail } from "../ai/errors";

// Creators who fit a brand, on any platform, checked on what they actually
// post. Instagram, TikTok and YouTube come from the creator index; X and
// LinkedIn creators are the people whose posts about the niche do best, found
// through search. Every candidate is then checked in one pass: how on-topic
// their recent posts and bio are, how engaged their audience is, and how
// recently they posted.

const DAY = 86400000;
const noop = () => {};
const INDEX = { instagram: "instagram", tiktok: "tiktok", youtube: "youtube" };

const FIT_SCHEMA = {
  type: "object",
  properties: {
    fits: {
      type: "array",
      items: {
        type: "object",
        properties: { i: { type: "integer" }, relevance: { type: "integer" }, why: { type: "string" }, kind: { type: "string", enum: ["creator", "brand", "media", "expert", "other"] } },
        required: ["i", "relevance", "why", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["fits"],
  additionalProperties: false,
};

const emailIn = (text) => String(text || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]?.toLowerCase() || null;

// Rules for the stand-in and as a fallback: words of the niche in the bio and posts.
function ruleFit(c, niche) {
  const words = String(niche || "").toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const textBody = `${c.bio || ""} ${(c.recent || []).map((p) => p.caption).join(" ")}`.toLowerCase();
  const hits = words.filter((w) => textBody.includes(w)).length;
  return { relevance: Math.min(5, 2 + hits), why: hits ? "Posts about the niche." : "Few posts about the niche.", kind: "creator" };
}

async function judgeFit(cands, { ctx, user }) {
  if (!cands.length) return [];
  if (isMock()) return cands.map((c) => ruleFit(c, ctx?.niche));
  const lines = cands.map((c, i) => `${i}. @${c.handle} (${platformLabel(c.platform)}, ${c.followers ?? "?"} followers) bio: ${String(c.bio || "").replace(/\s+/g, " ").slice(0, 160)} | recent: ${(c.recent || []).slice(0, 3).map((p) => String(p.caption || "").replace(/\s+/g, " ").slice(0, 110)).join(" / ")}`);
  try {
    const message = await anthropic().messages.create({
      model: MODELS.quick.id,
      max_tokens: 5000,
      output_config: { effort: "low", format: { type: "json_schema", schema: FIT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: `A brand wants creators to work with. Brand: ${ctx?.name || "the brand"}. Niche: ${ctx?.niche}. Market: ${ctx?.region || "global"}.
For each account below give: relevance 1-5 (5 = a creator whose content is squarely in this niche and who would fit a collaboration; 1 = unrelated), kind (creator, brand, media, expert or other — brands and media pages are not creators), and why in under 12 words.

${lines.join("\n")}`,
        },
      ],
    });
    await recordUsage({ userId: user?.id && user.id !== "local" ? user.id : null, kind: "creator-fit", model: message.model, usage: message.usage });
    const fits = new Map((JSON.parse(textOf(message) || "{}").fits || []).map((f) => [f.i, f]));
    return cands.map((c, i) => {
      const f = fits.get(i);
      return f ? { relevance: Math.max(1, Math.min(5, f.relevance)), why: String(f.why || "").slice(0, 120), kind: f.kind } : ruleFit(c, ctx?.niche);
    });
  } catch (err) {
    console.error("[huesy:creators] fit check failed", err?.status || "", String(err?.message || err).slice(0, 300));
    return cands.map((c) => ruleFit(c, ctx?.niche));
  }
}

// Authors of the best niche posts on a platform, grouped into creators.
function authorsOf(posts, { min = 1, platform }) {
  const by = new Map();
  for (const p of posts) {
    const h = String(p.author?.handle || "").toLowerCase();
    if (!h) continue;
    if (!by.has(h)) by.set(h, { platform, handle: p.author.handle, name: p.author.name, followers: p.author.followers, url: p.author.url, posts: [], engagement: 0 });
    const a = by.get(h);
    a.posts.push(p);
    a.engagement += (p.metrics.likes || 0) + (p.metrics.comments || 0) * 2 + (p.metrics.shares || 0) * 2;
    a.followers ??= p.author.followers;
  }
  return [...by.values()].filter((a) => a.posts.length >= min);
}

export async function findCreators({ platform = "instagram", topic = null, followers = {}, ctx, map = null, limit = 25 }, { user, signal, purse, onStep = noop } = {}) {
  map ||= await marketMap(ctx, { user });
  const lo = followers.min ?? 5000;
  const hi = followers.max ?? 250000;
  const about = topic || map.terms?.[0] || ctx?.keywords?.[0];
  const place = countryName(map.country || ctx?.country);
  onStep({ id: "creators", label: `Looking for ${platformLabel(platform)} creators in ${about}`, status: "running" });

  let cands = [];
  if (INDEX[platform]) {
    const filters = { number_of_followers: { min: lo, max: hi } };
    if (platform === "instagram" && place) filters.location = [place];
    const brief = `${about} creators${place ? ` in ${place}` : ""}${ctx?.audience ? ` for ${String(ctx.audience).slice(0, 80)}` : ""}`;
    let r;
    try {
      r = await fetchCap("creators.search", { platform: INDEX[platform], filters, brief, limit }, { user, signal });
      purse?.add(r.usd);
    } catch (err) {
      if (signal?.aborted) throw err;
      onStep({ id: "creators", label: "The creator index didn't answer", status: "error" });
      throw fail("data_unavailable", 503);
    }
    cands = (r.data || []).filter((c) => c.followers == null || (c.followers >= lo * 0.8 && c.followers <= hi * 1.25));
    // Their recent posts, to check what they actually make.
    onStep({ id: "creators", label: `Found ${cands.length}. Checking what they post`, status: "running" });
    const top = cands.slice(0, 20);
    const jobs = [];
    for (const c of top) {
      if (platform === "instagram") jobs.push({ cap: "instagram.posts", params: { handle: c.handle } });
      if (platform === "tiktok") jobs.push({ cap: "tiktok.profile", params: { handle: c.handle } });
    }
    const got = jobs.length ? await collect(jobs, { purse, user, signal, concurrency: 8 }) : { items: [] };
    if (platform === "tiktok") {
      const profiles = got.items.filter((x) => x.kind === "profile" && x.secUid);
      const vids = await collect(profiles.map((p) => ({ cap: "tiktok.videos", params: { secUid: p.secUid, limit: 12 } })), { purse, user, signal, concurrency: 8 });
      for (const c of top) {
        const p = profiles.find((x) => String(x.handle).toLowerCase() === String(c.handle).toLowerCase());
        c.bio ||= p?.bio;
        c.recentPosts = vids.items.filter((v) => v.kind === "post" && String(v.author?.handle || "").toLowerCase() === String(c.handle).toLowerCase());
      }
    } else if (platform === "youtube") {
      // The index gives no videos for YouTube creators: find each one's recent
      // videos through search, by channel name, and keep the channel id.
      const vids = await collect(top.map((c) => ({ cap: "youtube.search", params: { q: c.name || c.handle } })), { purse, user, signal, concurrency: 8 });
      const key = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const c of top) {
        const want = key(c.name || c.handle).slice(0, 12);
        c.recentPosts = want ? vids.items.filter((v) => v.kind === "post" && key(v.author?.name).includes(want)) : [];
        if (c.recentPosts[0]?.author?.handle) c.channelId = c.recentPosts[0].author.handle;
      }
    } else {
      for (const c of top) c.recentPosts = got.items.filter((v) => v.kind === "post" && String(v.author?.handle || "").toLowerCase() === String(c.handle).toLowerCase());
    }
  } else if (platform === "x" || platform === "linkedin") {
    // Creators here are the people whose niche posts do best.
    const jobs = postJobs(platform, map, ctx, { days: 30, depth: "standard", topic, mode: "top" });
    const { items } = await collect(jobs, { purse, user, signal });
    const posts = items.filter((p) => p.kind === "post" && p.platform === platform && (platform !== "linkedin" || p.where !== "company"));
    cands = authorsOf(posts, { platform })
      .filter((a) => platform === "linkedin" || a.followers == null || (a.followers >= lo * 0.5 && a.followers <= hi * 2))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, limit)
      .map((a) => ({ kind: "creator", platform, handle: a.handle, name: a.name, followers: a.followers, url: a.url || (platform === "x" ? `https://x.com/${a.handle}` : null), bio: null, recentPosts: a.posts, source: "search" }));
    if (platform === "x" && cands.length) {
      const profiles = await collect(cands.slice(0, 15).map((c) => ({ cap: "x.profile", params: { handle: c.handle } })), { purse, user, signal, concurrency: 8 });
      for (const c of cands) {
        const p = profiles.items.find((x) => x.kind === "profile" && String(x.handle).toLowerCase() === String(c.handle).toLowerCase());
        if (p) Object.assign(c, { bio: p.bio, followers: p.followers ?? c.followers, name: p.name || c.name });
      }
    }
  } else {
    throw fail("bad_request", 400);
  }

  // The check: relevance in one pass, then engagement and recency.
  const withRecent = cands.map((c) => {
    const recent = enrich((c.recentPosts || []).slice(0, 12));
    return { ...c, recent };
  });
  const fits = await judgeFit(withRecent.slice(0, 30), { ctx, user });
  const scored = withRecent.map((c, i) => {
    const fit = fits[i] || null;
    const last = c.recent.map((p) => p.postedAt).filter(Boolean).sort().pop() || null;
    const daysQuiet = last ? Math.round((Date.now() - new Date(last).getTime()) / DAY) : null;
    const avgEng = c.recent.length ? c.recent.reduce((s, p) => s + (p.metrics.likes || 0) + (p.metrics.comments || 0), 0) / c.recent.length : null;
    const er = c.engagement ?? (avgEng != null && c.followers ? Math.round((avgEng / c.followers) * 1000) / 10 : null);
    const rel = fit?.relevance ?? null;
    const score = Math.round(Math.min(100, (rel ? (rel / 5) * 55 : 25) + Math.min(25, (er || 0) * 5) + (daysQuiet == null ? 5 : daysQuiet <= 7 ? 20 : daysQuiet <= 30 ? 10 : 0)));
    const { recentPosts, ...rest } = c;
    return {
      ...rest,
      engagement: er,
      relevance: rel,
      why: fit?.why || null,
      accountKind: fit?.kind || "creator",
      lastPost: last,
      daysQuiet,
      fit: fit ? score : null,
      email: emailIn(c.bio),
      recent: rows(c.recent, 3),
    };
  });
  // Brands and media pages are not creators; unrelated accounts drop out.
  const ranked = scored
    .filter((c) => c.accountKind === "creator" || c.accountKind === "expert")
    // Loosely related accounts (2) aren't a shortlist; on-topic ones (3+) are.
    .filter((c) => c.relevance == null || c.relevance >= 3)
    .sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0));
  onStep({ id: "creators", label: `Ranked ${ranked.length} ${platformLabel(platform)} creators by fit`, status: "done" });
  return { platform, creators: ranked, sample: isMock() };
}

// A creator's published contact: Instagram and TikTok publish it on the
// profile; YouTube channels and X bios often carry an email; LinkedIn members
// have work emails.
export async function creatorContact({ platform = "instagram", handle, url = null, name = null }, { user, signal } = {}) {
  const h = String(handle || "").replace(/^@/, "");
  if (platform === "instagram") return (await fetchCap("instagram.contact", { handle: h }, { user, signal })).data;
  if (platform === "tiktok") return (await fetchCap("tiktok.contact", { handle: h }, { user, signal })).data;
  if (platform === "x") {
    const p = (await fetchCap("x.profile", { handle: h }, { user, signal })).data;
    const email = emailIn(p?.bio);
    return { email, emails: email ? [email] : [], phone: null, website: p?.website || null, links: [], found: Boolean(email), how: "bio" };
  }
  if (platform === "youtube") {
    let id = /^UC[\w-]{20,}$/.test(h) ? h : String(url || "").match(/channel\/(UC[\w-]+)/)?.[1] || null;
    if (!id) {
      // A handle from the index: find its channel through search, by name.
      const found = (await fetchCap("youtube.search", { q: name || h.replace(/^@/, "") }, { user, signal })).data || [];
      const want = String(name || h).toLowerCase().replace(/[^a-z0-9]/g, "");
      id = found.find((v) => String(v.author?.name || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(want.slice(0, 8)))?.author?.handle || null;
    }
    const p = id ? (await fetchCap("youtube.channel", { channelId: id }, { user, signal })).data : null;
    const email = emailIn(p?.bio);
    return { email, emails: email ? [email] : [], phone: null, website: null, links: [], found: Boolean(email), how: "channel" };
  }
  if (platform === "linkedin") {
    const link = url || (h ? `https://www.linkedin.com/in/${h}/` : null);
    if (!link) return { email: null, emails: [], found: false };
    return (await fetchCap("people.email", { linkedinUrl: link, name }, { user, signal })).data;
  }
  throw fail("bad_request", 400);
}
