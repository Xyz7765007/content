import { anthropic, isMock, textOf } from "../ai/client";
import { MODELS, SONNET_FALLBACK } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { fail } from "../ai/errors";
import { getSupabaseAdmin } from "../supabase/server";
import { brandBrief } from "./brand";
import { Purse, accountSnapshot, adsFor, analyzeContent, audienceVoice, findCreators, mentionsOf, newsFor, resolveCompetitor, reviewsFor, trendingNow } from "./tools";
import { rows, strength } from "./stats";
import { groupRow, readSummary, solid } from "./groups";
import { marketMap, platformsFor, isPostingPlatform } from "./market";
import { findingsFromAccount, findingsFromAnalysis, findingsFromTrending, findingsFromVoice, saveFindings } from "./findings";
import { formatLabel, hookLabel, platformLabel, ctaLabel } from "./taxonomy";
import { REPORTS } from "./kinds";

// Deep reports. Each kind has a fixed plan built from the market map, so what
// it reads is decided by the market, not guessed; the numbers are computed
// here; Sonnet only writes up what was measured, into a fixed shape the
// report page renders, and every report says exactly what it read.

const BUDGETS = { trends: 0.12, playbook: 0.15, competitors: 0.25, audience: 0.12, creators: 0.4 };
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
  const where = params.platform && params.platform !== "all" ? ` on ${platformLabel(params.platform)}` : params.platform === "all" ? " across platforms" : "";
  switch (kind) {
    case "trends":
      return `Trend radar${where}`;
    case "playbook":
      return `${params.format ? `${formatLabel(params.format)} playbook` : "Content playbook"}${params.topic ? ` for ${params.topic}` : ""}${where}`;
    case "competitors":
      return `Competitors: ${(params.handles || []).map((h) => String(h).replace(/^https?:\/\/(www\.)?/, "")).join(", ") || "your market"}`;
    case "audience":
      return `Audience voice: ${params.topic || ctx.keywords[0]}`;
    case "creators":
      return `Creators in ${params.topic || ctx.keywords[0]}${where}`;
    default:
      return "Report";
  }
}

// Charts show only groups seen in at least three accounts.
const chart = (groups, labelOf) =>
  (groups || [])
    .filter((g) => (g.authors ?? g.n) >= 3)
    .slice(0, 6)
    .map((g) => ({ label: labelOf(g.key), value: g.medianStrength, n: g.n, accounts: g.authors ?? null }));

const example = (p) => ({ url: p.url, handle: p.author?.handle, caption: String(p.caption || "").replace(/\s+/g, " ").slice(0, 220), likes: p.metrics.likes, views: p.metrics.views, reach: strength(p) });

// The competitors a report covers: the ones asked for, matched to the map
// when the map knows them, otherwise the brand's own list, then the map's.
function competitorList(params, map) {
  const asked = (params.handles || []).map((h) => String(h).trim()).filter(Boolean);
  const known = map.competitors || [];
  const norm = (s) => String(s || "").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
  if (asked.length) {
    return asked.slice(0, 4).map((h) => {
      const k = norm(h.replace(/^https?:\/\/(www\.)?[^/]+\/(company\/|in\/)?/i, ""));
      const hit = known.find((c) => [c.name, c.instagram, c.x, c.tiktok, c.website].some((v) => v && (norm(v) === k || norm(v).includes(k) || k.includes(norm(v)))));
      if (hit) return hit;
      if (/linkedin\.com/i.test(h)) return { name: h.split("/").filter(Boolean).pop(), linkedin: h };
      if (/^https?:\/\//i.test(h)) {
        const domain = h.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
        if (/instagram\.com/i.test(domain)) return { name: h.split("/").filter(Boolean).pop(), instagram: h.split("/").filter(Boolean).pop() };
        if (/(x|twitter)\.com/i.test(domain)) return { name: h.split("/").filter(Boolean).pop(), x: h.split("/").filter(Boolean).pop() };
        return { name: domain.split(".")[0], website: domain };
      }
      // "@handle" is an Instagram handle unless said otherwise; a plain name is a name.
      return h.startsWith("@") ? { name: h.slice(1), instagram: h.slice(1) } : { name: h };
    });
  }
  return [...known.filter((c) => !c.suggested), ...known.filter((c) => c.suggested)].slice(0, 3);
}

// Gathers the data for a report. Returns { data, findings, evidence, charts, sources }.
async function gather(kind, params, ctx, env) {
  const map = await marketMap(ctx, { user: env.user });
  const e = { ...env, ctx, map };

  if (kind === "playbook") {
    const platform = params.platform || ctx.platforms[0];
    // X search reaches back about a week; elsewhere a month gives a fair sample.
    const days = platform === "x" ? 9 : 30;
    const a = await analyzeContent({ platform, query: params.topic || null, ctx, map, days, focus: params.format || null, depth: "deep" }, e);
    const comps = (map.competitors || []).map((c) => ({ name: c.name, handle: platform === "x" ? c.x : c[platform], url: platform === "linkedin" && /linkedin\.com/.test(c.linkedin) ? c.linkedin : null })).filter((c) => c.handle || c.url).slice(0, 2);
    const snaps = await Promise.all(comps.map((c) => accountSnapshot({ platform, handle: c.handle, url: c.url, name: c.name }, e)));
    const s = a.summary;
    const examplesFor = (key) => a.posts.filter((p) => p.tags?.hook === key && p.calc?.settled !== false).sort((x, y) => (strength(y) ?? 0) - (strength(x) ?? 0)).slice(0, 2).map(example);
    const accounts = a.read?.platforms?.[0]?.accounts || 0;
    return {
      data: {
        platform,
        window: `last ${days} days`,
        posts: s.n,
        accounts,
        read: { fetched: a.fetched, labelled: a.labelled, onTopic: s.n, note: a.fetched > s.n * 3 ? `Read ${a.fetched} posts; ${s.n} were squarely about this niche (the rest were off-topic, deals or other markets).` : undefined },
        format: a.focus || "all formats",
        earlyRead: s.n < 20 ? `Only ${s.n} on-topic posts: treat this as an early read.` : undefined,
        medianEngagementPct: s.medianErPct,
        medianViews: s.medianViews,
        formats: solid(s.formats, 5).map((g) => groupRow(g, "format")),
        hooks: solid(s.hooks, 8).map((g) => ({ ...groupRow(g, "hook"), examples: examplesFor(g.key) })),
        lengths: solid(s.lengths, 5).map((g) => groupRow(g, "length")),
        postingTimes: solid(s.times, 6).map((g) => groupRow(g, "time")),
        weekdays: solid(s.weekdays, 7).map((g) => groupRow(g, "day")),
        callsToAction: solid(s.ctas, 5).map((g) => ({ ...groupRow(g, "cta"), label: ctaLabel(g.key) })),
        sounds: (s.sounds || []).slice(0, 5).map((g) => ({ sound: g.key, posts: g.n })),
        hashtags: (s.hashtags || []).slice(0, 12).map((h) => `#${h.tag} (${h.n})`),
        top: rows(s.top, 12),
        competitors: snaps.filter((x) => !x.missing && !x.unsupported).map((x) => ({ account: x.profile?.name || x.handle, followers: x.profile?.followers ?? null, postsPerWeek: x.cadence?.perWeek ?? null, breakouts: (x.breakouts || []).slice(0, 2) })),
      },
      findings: [...findingsFromAnalysis(a, ctx), ...snaps.flatMap((x) => findingsFromAccount(x, ctx))],
      evidence: rows(s.top, 8),
      charts: { hooks: chart(s.hooks, hookLabel), formats: chart(s.formats, formatLabel), lengths: chart(s.lengths, (k) => k), times: chart(s.times, (k) => k) },
      sources: [...(a.sources || [])],
    };
  }

  if (kind === "trends") {
    const platforms = params.platform && params.platform !== "all" ? [params.platform] : platformsFor(map, { include: ctx.platforms, max: 3 });
    const [per, news] = await Promise.all([Promise.all(platforms.map((p) => trendingNow({ platform: p, ctx, map, depth: "standard" }, e))), newsFor({ ctx, map, days: 7 }, e)]);
    return {
      data: {
        week: `the 7 days to ${new Date().toISOString().slice(0, 10)}`,
        platforms: per.map((t) => ({
          platform: t.platform,
          postsThisWeek: t.n,
          note: t.regionNote || undefined,
          takingOff: t.hot.slice(0, 6),
          topics: t.topics.slice(0, 8),
          hashtags: t.hashtags.slice(0, 10),
          sounds: t.sounds.slice(0, 6),
          formats: solid(t.formats, 4).map((g) => groupRow(g, "format")),
        })),
        news: news.items.slice(0, 10).map((a) => ({ title: a.title, source: a.source, url: a.url, date: a.postedAt?.slice(0, 10) })),
        searchInterest: per.find((t) => t.interest?.length)?.interest || [],
      },
      findings: per.flatMap((t) => findingsFromTrending(t, ctx)),
      evidence: per.flatMap((t) => t.hot.slice(0, 3)),
      charts: { topics: per.flatMap((t) => t.topics.slice(0, 3).map((x) => ({ label: `${x.topic} (${platformLabel(t.platform)})`, value: x.accounts, n: x.posts }))).slice(0, 8) },
      sources: [...per.flatMap((t) => t.sources || []), ...(news.sources || [])],
    };
  }

  if (kind === "competitors") {
    const list = competitorList(params, map);
    if (!list.length) throw fail("no_competitors", 400);
    const readable = platformsFor(map, { include: ctx.platforms, max: 5 }).filter(isPostingPlatform);
    const results = await Promise.all(
      list.map(async (c) => {
        const resolved = await resolveCompetitor({ ...c, lookForTiktok: readable.includes("tiktok") }, e, { platforms: readable });
        const accounts = Object.entries(resolved.accounts).filter(([p]) => readable.includes(p)).slice(0, 3);
        const [snaps, ads, reviews, mentions] = await Promise.all([
          Promise.all(accounts.map(([p, acc]) => accountSnapshot({ platform: p, handle: acc.handle || acc.channelId, url: acc.url, name: resolved.name }, e))),
          adsFor({ advertiser: resolved.name, website: resolved.website, instagram: resolved.accounts.instagram?.handle, ctx, map }, e).catch(() => ({ ads: [], sources: [] })),
          (map.reviewSources || []).length ? reviewsFor({ target: { name: resolved.name, brand: true, domain: resolved.website, amazonQuery: c.amazonQuery || resolved.name }, ctx, map }, e).catch(() => ({ reviews: [], products: [], sources: [] })) : Promise.resolve({ reviews: [], products: [], sources: [] }),
          mentionsOf({ name: resolved.name, handles: { x: resolved.accounts.x?.handle }, ctx, map, days: 30 }, e).catch(() => ({ posts: [], articles: [], sources: [] })),
        ]);
        return { c, resolved, snaps, ads, reviews, mentions };
      })
    );
    const mainPlatform = ctx.platforms[0];
    const niche = await analyzeContent({ platform: mainPlatform, ctx, map, days: 30, depth: "quick" }, e).catch(() => null);
    const shown = results.map(({ resolved, snaps, ads, reviews, mentions }) => {
      const ratings = reviews.reviews.filter((r) => r.rating != null);
      return {
        name: resolved.name,
        website: resolved.website,
        accounts: snaps.map((x) =>
          x.missing || x.unsupported
            ? { platform: x.platform, note: "Couldn't read this account." }
            : {
                platform: x.platform,
                account: x.platform === "linkedin" ? x.profile?.name || x.handle : `@${x.handle}`,
                followers: x.profile?.followers ?? null,
                postsPerWeek: x.cadence?.perWeek ?? null,
                normalViews: x.normal?.views ?? null,
                normalLikes: x.normal?.likes ?? null,
                formats: (x.summary?.formats || []).slice(0, 3).map((g) => ({ format: g.key, posts: g.n })),
                hooks: (x.summary?.hooks || []).filter((g) => g.key !== "other").slice(0, 3).map((g) => ({ hook: g.key, posts: g.n })),
                breakouts: (x.breakouts || []).slice(0, 3),
                latest: (x.recent || []).slice(0, 2),
              }
        ),
        notFound: Object.entries(resolved.checked).filter(([p, ok]) => !ok && !resolved.accounts[p]).map(([p]) => p),
        // 30 is as many as one look returns: "30+" rather than a count it isn't.
        ads: { running: ads.ads.length, more: ads.ads.length >= 30, examples: ads.ads.slice(0, 4).map((a) => ({ platform: a.platform, text: String(a.text || a.title || "").slice(0, 200), cta: a.cta, started: a.startedAt?.slice(0, 10), url: a.url })) },
        reviews: ratings.length ? { count: ratings.length, average: Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10, complaints: ratings.filter((r) => r.rating <= 2).slice(0, 3).map((r) => ({ text: r.text.slice(0, 200), source: r.source, url: r.url })), praise: ratings.filter((r) => r.rating >= 5).slice(0, 2).map((r) => ({ text: r.text.slice(0, 160), source: r.source })) } : null,
        products: (reviews.products || []).slice(0, 3).map((p) => ({ title: p.title, rating: p.rating, reviews: p.reviews, price: p.price, url: p.url })),
        mentions: { last30Days: mentions.posts.length + mentions.articles.length, examples: [...mentions.articles.slice(0, 2).map((a) => ({ type: "news", title: a.title, url: a.url, date: a.postedAt?.slice(0, 10) })), ...mentions.posts.sort((a, b) => (b.metrics.likes || 0) - (a.metrics.likes || 0)).slice(0, 3).map((p) => ({ type: p.platform, text: String(p.caption).slice(0, 180), url: p.url, date: p.postedAt?.slice(0, 10) }))] },
      };
    });
    return {
      data: {
        competitors: shown,
        niche: niche?.summary?.n ? { platform: mainPlatform, posts: niche.summary.n, hooks: solid(niche.summary.hooks, 5).map((g) => groupRow(g, "hook")), formats: solid(niche.summary.formats, 4).map((g) => groupRow(g, "format")) } : null,
      },
      findings: [...results.flatMap((r) => r.snaps.flatMap((x) => findingsFromAccount(x, ctx))), ...(niche ? findingsFromAnalysis(niche, ctx) : [])],
      evidence: results.flatMap((r) => r.snaps.flatMap((x) => (x.breakouts || []).slice(0, 2))),
      charts: { followers: results.flatMap((r) => r.snaps.filter((x) => x.profile?.followers).map((x) => ({ label: `${r.resolved.name} (${platformLabel(x.platform)})`, value: x.profile.followers, n: x.posts?.length || 0 }))).slice(0, 8) },
      sources: [...results.flatMap((r) => [...r.ads.sources, ...r.reviews.sources, ...r.mentions.sources]), ...(niche?.sources || [])],
    };
  }

  if (kind === "audience") {
    const v = await audienceVoice({ query: params.topic || null, ctx, map }, e);
    return {
      data: { read: v.read, bySource: v.bySource, questions: v.questions, pains: v.pains, desires: v.desires, objections: v.objections, phrases: v.phrases, threads: v.threads, reviews: v.reviews, products: v.products },
      findings: findingsFromVoice(v, ctx),
      evidence: [],
      charts: { questions: (v.questions || []).slice(0, 6).map((q) => ({ label: q.text, value: q.count, n: q.count })) },
      sources: v.sources || [],
    };
  }

  if (kind === "creators") {
    const platform = params.platform || ctx.platforms[0];
    const r = await findCreators({ platform, topic: params.topic || null, followers: params.followers || {}, ctx, map, limit: 25 }, e);
    return { data: { platform, creators: r.creators }, findings: [], evidence: [], charts: {}, sources: [] };
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
  trends:
    "Sections: one per platform (what's taking off this week: the topics most accounts are posting about, with counts, and the posts moving fastest, linked), Hashtags and sounds (say which sounds are cleared for brand accounts; where a platform publishes no trend growth, say these are the most used, not rising), In the news (dated, linked), What to post this week (3 to 5 concrete posts riding what's moving).",
  playbook:
    "Sections: The patterns that win (each opening with its reach multiple and sample size, and a linked example), Formulas (3 to 5 fill-in-the-blank templates, each modelled on a real example post from the data and linked to it), Length and pacing (what length works on this platform: seconds for video, words or characters for text, slides for carousels), When to post (times and days, only from the data), Calls to action, Hashtags and sounds, What competitors do (if the data has them), What to avoid.",
  competitors:
    "Sections: one per competitor (their accounts platform by platform: size, how often they post, their normal and what breaks out for them, linked; the ads they run; what reviewers praise and complain about; who is talking about them), Side by side (a markdown table: competitor, platforms, posts a week, followers, ads running, review average), Gaps you can own (openings, formats, platforms or customer complaints they leave open, only from the data).",
  audience:
    "Sections: Top questions (with counts and where they were asked), Frustrations, What they want, Objections to answer, Words to borrow (their exact phrases), What reviews say (if the data has reviews), Content that answers them (5 concrete post ideas, each answering a counted question or pain).",
};

async function writeUp(kind, data, ctx, map, user) {
  if (isMock()) return mockWriteUp(kind, data, ctx);
  const prompt = `${brandBrief(ctx)}
Market: ${map.summary || ctx.niche}${map.country ? ` (${map.country})` : ""}. Today is ${new Date().toISOString().slice(0, 10)}.

Write a ${REPORT_KINDS[kind].label} for this brand from the measured data below.
${GUIDE[kind]}
Rules:
- Use only this data. Every number with its sample size in posts and accounts. "reach" is how many times a typical post a group gets.
- Groups marked earlySign are seen in fewer than five accounts: call them early signs, never lead with them. If the data has an earlyRead note, say so in the summary.
- Every section must give the reader something to act on. When a measure is missing or thin for a section, say so in one short line, then describe what the top posts in the data actually do for that section (their openings, length, timing, asks), labelled "from the top posts".
- Plain words, short paragraphs and bullets; markdown allowed in section bodies; link example posts and sources as markdown links. Never name data providers or tools.
- The summary is 2 to 3 sentences, the single most useful takeaway first.
- Ideas: up to 5 concrete posts they can make this week, each grounded in a measured pattern or a counted audience need from the data (fewer is fine): title, format (reel, carousel, image, text, video or short), the hook line, and why it should work (cite the number and sample).

Data:
${JSON.stringify(data).slice(0, 70000)}`;
  const message = await anthropic().beta.messages.create({
    model: MODELS.write.id,
    max_tokens: 9000,
    thinking: { type: "between_tools" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: BODY_SCHEMA } },
    ...SONNET_FALLBACK,
    messages: [{ role: "user", content: prompt }],
  });
  await recordUsage({ userId: user.id !== "local" ? user.id : null, kind: `report:${kind}`, model: message.model, usage: message.usage });
  if (message.stop_reason === "refusal") throw fail("declined", 422);
  if (message.stop_reason === "max_tokens") throw fail("failed", 502);
  return JSON.parse(textOf(message) || "{}");
}

function mockWriteUp(kind, data, ctx) {
  const hooks = data.hooks || data.platforms?.[0]?.formats || [];
  const ideas = (data.hooks || []).filter((h) => (h.accounts ?? h.posts) >= 5).slice(0, 5).map((h, i) => ({
    title: `${hookLabel(h.hook)} about ${ctx.keywords[0]}`,
    format: data.formats?.[0]?.format || "reel",
    hook: [`Day 1 vs day 30 of my ${ctx.keywords[0]} reset`, `Why does your ${ctx.keywords[0]} stop working?`, `5 ${ctx.keywords[0]} mistakes to stop today`, `POV: your ${ctx.keywords[0]} finally works`, `${ctx.keywords[0]} myth: more is better`][i % 5],
    why: `${hookLabel(h.hook)} posts reach ${h.reach ?? "?"}x a typical post (${h.posts} posts from ${h.accounts ?? "?"} accounts).`,
  }));
  const sections = {
    trends: [
      ...(data.platforms || []).map((p) => ({ title: platformLabel(p.platform), body: [`${p.postsThisWeek} on-topic posts this week.`, ...(p.topics || []).slice(0, 4).map((t) => `- **${t.topic}**: ${t.accounts} accounts, ${t.posts} posts`), ...(p.takingOff || []).slice(0, 2).map((r) => `- [Taking off](${r.url}): ${String(r.caption).slice(0, 80)}`)].join("\n") })),
      { title: "In the news", body: (data.news || []).slice(0, 4).map((n) => `- [${n.title}](${n.url}), ${n.source}, ${n.date}`).join("\n") || "Nothing this week." },
      { title: "What to post this week", body: `Ride the topics most accounts are posting about, in ${ctx.name}'s voice.` },
    ],
    playbook: [
      { title: "The patterns that win", body: (data.hooks || []).slice(0, 4).map((h) => `- **${hookLabel(h.hook)}**: ${h.reach ?? "?"}x typical reach (${h.posts} posts from ${h.accounts ?? "?"} accounts)${h.examples?.[0] ? `, like [this post](${h.examples[0].url})` : ""}`).join("\n") || "Nothing measured yet." },
      { title: "Formulas", body: "1. Day 1 vs day 30 of [routine]. Show the start, the middle, the result.\n2. Why does your [thing] stop working? Name the cause, give the fix.\n3. [Number] [topic] mistakes. One per slide, the fix on the last." },
      { title: "Length and pacing", body: (data.lengths || []).slice(0, 3).map((l) => `- ${l.length}: ${l.reach ?? "?"}x (${l.posts} posts)`).join("\n") || "From the top posts: short and to the point." },
      { title: "When to post", body: (data.postingTimes || []).slice(0, 3).map((t) => `- ${t.time}: ${t.reach ?? "?"}x (${t.posts} posts)`).join("\n") || "From the top posts: no clear timing yet." },
    ],
    competitors: [
      ...(data.competitors || []).map((c) => ({ title: c.name, body: [(c.accounts || []).map((a) => (a.note ? `- ${platformLabel(a.platform)}: ${a.note}` : `- ${platformLabel(a.platform)} ${a.account}: ${a.postsPerWeek ?? "?"} posts a week${a.followers ? `, ${a.followers.toLocaleString("en-US")} followers` : ""}`)).join("\n"), `- Ads running: ${c.ads?.running ?? 0}`, c.reviews ? `- Reviews: ${c.reviews.average}★ from ${c.reviews.count}` : null, `- Mentions in 30 days: ${c.mentions?.last30Days ?? 0}`].filter(Boolean).join("\n") })),
      { title: "Side by side", body: `| Competitor | Platforms | Ads running |\n|---|---|---|\n${(data.competitors || []).map((c) => `| ${c.name} | ${(c.accounts || []).length} | ${c.ads?.running ?? 0} |`).join("\n")}` },
      { title: "Gaps you can own", body: "Openings that work across the niche that these accounts don't use." },
    ],
    audience: [
      { title: "Top questions", body: (data.questions || []).slice(0, 6).map((q) => `- ${q.text} (${q.count}, ${Object.keys(q.from || {}).join(", ")})`).join("\n") || "No clear questions yet." },
      { title: "Frustrations", body: (data.pains || []).slice(0, 5).map((q) => `- ${q.text} (${q.count})`).join("\n") || "None stood out." },
      { title: "Objections to answer", body: (data.objections || []).slice(0, 4).map((q) => `- ${q.text} (${q.count})`).join("\n") || "None stood out." },
    ],
  }[kind] || [];
  return { summary: `Sample report for ${ctx.name}. ${sections[0]?.body?.split("\n")[0]?.replace(/^- /, "") || ""}`.trim(), sections, ideas: ideas.length ? ideas : hooks.length ? [] : [] };
}

// A report with nothing measured in it isn't worth its credits.
const isEmpty = (kind, d) => {
  switch (kind) {
    case "trends":
      return !(d.platforms || []).some((p) => p.postsThisWeek || p.hashtags?.length || p.sounds?.length) && !d.news?.length;
    case "playbook":
      return (d.posts || 0) < 8;
    case "competitors":
      return !(d.competitors || []).some((c) => (c.accounts || []).some((a) => !a.note) || c.ads?.running || c.reviews || c.mentions?.last30Days);
    case "audience":
      return (d.read || 0) < 5;
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
  const map = await marketMap(ctx, { user });
  onStep({ id: "write", label: kind === "creators" ? "Ranking creators" : "Writing it up", status: "running" });
  const body = kind === "creators" ? { summary: `${gathered.data.creators.length} creators found on ${platformLabel(gathered.data.platform)}.`, sections: [], ideas: [] } : await writeUp(kind, gathered.data, ctx, map, user);
  onStep({ id: "write", label: kind === "creators" ? "Ranked" : "Written", status: "done" });
  const saved = await saveFindings(user, gathered.findings, { type: "report", id: report.id });
  const full = {
    ...body,
    data: gathered.data,
    charts: gathered.charts,
    evidence: gathered.evidence,
    read: readSummary(gathered.sources),
    findingIds: saved.map((f) => f.id),
    sample: isMock(),
  };
  await updateReport(user, report.id, { status: "ready", body: full });
  return full;
}
