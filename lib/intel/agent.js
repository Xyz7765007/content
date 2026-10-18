import { anthropic, isMock } from "../ai/client";
import { MODELS, SONNET_FALLBACK } from "../ai/models";
import { recordUsage } from "../ai/usage";
import { fail } from "../ai/errors";
import { PRICES } from "../plans";
import { brandBrief } from "./brand";
import { Purse, accountSnapshot, adsFor, analyzeContent, audienceVoice, newsFor, overlaps, trendingNow } from "./tools";
import { getSupabaseAdmin } from "../supabase/server";
import { reportLabel } from "./kinds";
import { fetchCap } from "./source";
import { rows, trendGrowth } from "./stats";
import {
  ageDays,
  findingsFromAccount,
  findingsFromAnalysis,
  findingsFromTrending,
  findingsFromVoice,
  latestOnly,
  queryFindings,
  saveFindings,
} from "./findings";
import { formatLabel, hookLabel, platformLabel } from "./taxonomy";
import { PLATFORM_IDS } from "./brand";

// Ask: one question, answered from real data. Sonnet 5.5 works as the analyst
// with the tools below; the stand-in routes the question to the same tools by
// keywords and writes the answer from the measured numbers, so every part of
// the pipeline runs in QA without a model.

export const MAX_CALLS = 6;
export const DATA_BUDGET_USD = 0.06;

const pct = (n) => (n == null ? null : Math.round(n * 1000) / 10);
// One rounding rule for every multiple shown: one decimal place.
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// A group seen in fewer than five accounts is an early sign, not a pattern;
// under three it's left out unless nothing bigger exists. Groups are ranked
// by a score that pulls small groups towards typical, so a lucky trio never
// outranks a pattern seen across twenty accounts.
const EARLY_BELOW = 5;
export const solid = (groups, take) => {
  const list = (groups || []).filter((g) => g.key !== "other");
  const big = list.filter((g) => (g.authors ?? g.n) >= 3);
  return (big.length ? big : list)
    .map((g) => ((g.authors ?? g.n) < EARLY_BELOW ? { ...g, early: true } : g))
    .sort((x, y) => (y.score ?? y.medianStrength ?? 0) - (x.score ?? x.medianStrength ?? 0))
    .slice(0, take);
};

const groupRow = (g, name) => ({
  [name]: g.key,
  posts: g.n,
  accounts: g.authors ?? null,
  reach: r1(g.medianStrength),
  ...(g.consistency != null ? { accountsBeatingNormPct: Math.round(g.consistency * 100) } : {}),
  ...(g.early ? { earlySign: true } : {}),
});

const compactAnalysis = (a) => ({
  platform: a.platform,
  searchedFor: a.query,
  topicFound: a.topic ? Boolean(a.topicFound) : undefined,
  days: a.days,
  format: a.focus || (a.requestedFocus ? `mixed (too few ${a.requestedFocus} posts to measure on their own)` : "all"),
  posts: a.summary?.n || 0,
  earlyRead: a.thin ? "Fewer than 10 on-topic posts: treat everything here as an early read" : undefined,
  medianEngagementPct: a.summary?.medianErPct ?? null,
  medianViews: a.summary?.medianViews ?? null,
  formats: solid(a.summary?.formats, 4).map((g) => ({ ...groupRow(g, "format"), engagementPct: pct(g.medianEr) })),
  hooks: solid(a.summary?.hooks, 5).map((g) => groupRow(g, "hook")),
  lengths: solid(a.summary?.lengths, 3).map((g) => groupRow(g, "length")),
  sounds: (a.summary?.sounds || []).slice(0, 3).map((g) => g.key),
  hashtags: (a.summary?.hashtags || []).slice(0, 8).map((h) => h.tag),
  topPosts: rows(a.summary?.top || [], 8),
  note: a.empty ? "No recent posts found for this search." : undefined,
});

export const TOOLS = [
  {
    name: "recall",
    description: "What you already know about this brand's market from earlier analyses, newest first: each fact's age in days, the format it was measured on, and how many accounts stand behind it. Also lists deep reports run in the last 14 days. Free and instant. Use it first, with a topic when the question has one.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: [...PLATFORM_IDS, "google"] },
        kind: { type: "string", enum: ["format", "hook", "length", "sound", "hashtag", "examples", "trend", "interest", "competitor", "audience"] },
        topic: { type: "string", description: "Words the facts should be about, e.g. 'sunscreen'. Leave empty for everything." },
      },
    },
  },
  {
    name: "analyze_content",
    description: "Reads recent posts for a search on one platform and measures what works: formats, hooks, lengths, sounds, hashtags and the standout posts, with sample sizes. reach = how many times a typical post a group reaches.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: PLATFORM_IDS },
        query: { type: "string", description: "A short search, 1-3 words, e.g. 'skincare routine'" },
        days: { type: "integer", enum: [7, 14, 30] },
        format: { type: "string", enum: ["reel", "carousel", "image", "video", "short", "text"] },
      },
      required: ["platform", "query"],
    },
  },
  {
    name: "trending_now",
    description: "What is rising this week on a platform: hashtags with growth, sounds (with whether brand accounts may use them), and search interest for the brand's keywords.",
    input_schema: { type: "object", properties: { platform: { type: "string", enum: PLATFORM_IDS } }, required: ["platform"] },
  },
  {
    name: "search_interest",
    description: "Google search interest over the last year for up to 5 keywords, with growth over the last 4 weeks.",
    input_schema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" }, maxItems: 5 } }, required: ["keywords"] },
  },
  {
    name: "account_snapshot",
    description: "One account's recent performance: followers, how often it posts, its normal reach, what it posts, and its breakout posts. Instagram or TikTok.",
    input_schema: { type: "object", properties: { platform: { type: "string", enum: ["instagram", "tiktok"] }, handle: { type: "string" } }, required: ["platform", "handle"] },
  },
  {
    name: "audience_voice",
    description: "What people ask, complain about and want, from comments on top posts and forum threads, with counts.",
    input_schema: { type: "object", properties: { platform: { type: "string", enum: ["instagram", "youtube", "tiktok"] }, query: { type: "string" } }, required: ["platform", "query"] },
  },
  {
    name: "ads_running",
    description: "Top performing ads currently running for a topic (TikTok), with click-through rates.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "news",
    description: "Recent news stories for a topic in the brand's market.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "propose",
    description: "Offer a deep piece of work this question really needs, instead of attempting it here. The person sees a button with its price and decides. kinds: trends (full trend report), playbook (what works, formula by formula), competitors (several accounts compared), audience (full audience voice), creators (creator shortlist with contacts).",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["trends", "playbook", "competitors", "audience", "creators"] },
        platform: { type: "string", enum: PLATFORM_IDS },
        format: { type: "string", enum: ["reel", "carousel", "image", "video", "short", "text"], description: "Playbook only: one format to focus on" },
        topic: { type: "string", description: "What it should be about, one to three words" },
        handles: { type: "array", items: { type: "string" } },
        reason: { type: "string", description: "One sentence: what it will give them" },
      },
      required: ["kind", "reason"],
    },
  },
];

export const PROPOSAL_PRICE = { trends: PRICES.report, playbook: PRICES.report, competitors: PRICES.report, audience: PRICES.report, creators: PRICES.creators };

const system = (ctx) => `You are Huesy, a market intelligence analyst for one brand's social media. You find out what is working right now in their market and tell them exactly what to post.

${brandBrief(ctx)}

How you work:
- Use tools to get real data before saying anything about trends, performance, competitors, audiences or creators. Never invent numbers, posts, accounts or trends. If a tool finds nothing, say so plainly.
- Call recall first. Reuse what you already know when it is fresh enough: under 10 days old for trends and sounds, under 30 days for content patterns.
- Choose the platform from the question; otherwise use the brand's platforms, the first one first.
- You may make at most ${MAX_CALLS} data calls per question. When a question needs more depth than that (a full trend report, several competitors compared, a creator shortlist, a full content playbook), call propose instead and keep your answer short.
- Do not write anything before or between tool calls. Write once, at the end.
- Numbers: reach is how many times a typical post a group gets. Always give sample sizes as posts and accounts ("24 reels from 15 accounts"). Engagement as a percentage. A group marked earlySign is seen in fewer than five accounts: never lead with it, and call it an early sign. An analysis marked earlyRead is thin: say so. If an analysis's format is "mixed", don't describe its patterns as belonging to one format.
- When you use something you already knew (recall), say how old it is ("from 12 days ago").
- If a recent deep report already covers the question, point to it by name (it's in Insights) instead of proposing a new one.
- Answer: lead with the answer in one or two sentences. Then short sections only if they help: What's working, Why it may work (your interpretation, labelled as such), What to post (concrete hooks, formats and angles they can use this week). Link example posts inline as markdown links. Under 250 words unless asked for more. Plain words, no hype.
- Never name data providers, APIs or tools, and never describe how data was collected beyond "I read 24 recent reels".
- If the question has nothing to do with marketing, content or their market, say in one line what you can help with.`;

// Deep reports from the last two weeks, so the analyst can point to one.
async function recentReports(user) {
  const admin = getSupabaseAdmin();
  if (!admin || user?.id === "local") return [];
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data } = await admin
    .from("intel_reports")
    .select("kind, title, created_at")
    .eq("user_id", user.id)
    .eq("status", "ready")
    .neq("kind", "briefing")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(8);
  return (data || []).map((r) => ({ kind: reportLabel(r.kind), title: r.title, ageDays: Math.round((Date.now() - new Date(r.created_at).getTime()) / 86400000) }));
}

// Runs one tool and keeps what it learned: findings saved, evidence collected.
// Whether a data tool's answer had anything in it. A question whose every data
// call came back empty (and with nothing already known) is refunded.
const hasData = (name, out) => {
  switch (name) {
    case "analyze_content":
      return out.posts > 0;
    case "trending_now":
      return Boolean(out.hashtags?.length || out.sounds?.length || out.searchInterest?.length || out.formats?.length);
    case "search_interest":
      return Boolean(out.keywords?.length);
    case "account_snapshot":
      return !out.note;
    case "audience_voice":
      return out.read > 0;
    case "ads_running":
      return Boolean(out.ads?.length);
    case "news":
      return Boolean(out.stories?.length);
    default:
      return false;
  }
};
const FREE_TOOLS = ["recall", "propose"];

async function execTool(name, input, env) {
  if (FREE_TOOLS.includes(name)) return runTool(name, input, env);
  env.collected.attempted += 1;
  const out = await runTool(name, input, env);
  if (hasData(name, out)) env.collected.useful += 1;
  return out;
}

async function runTool(name, input, env) {
  const { ctx, user, signal, purse, onStep, collected, threadId } = env;
  const source = { type: "ask", thread: threadId };
  const keep = async (findings) => {
    const saved = await saveFindings(user, findings, source);
    collected.findings.push(...saved);
    return saved;
  };
  const platform = PLATFORM_IDS.includes(input.platform) ? input.platform : ctx.platforms[0];
  switch (name) {
    case "recall": {
      onStep({ id: "recall", label: "Checking what I already know", status: "running" });
      let found = latestOnly(await queryFindings(user, { platform: input.platform, kinds: input.kind ? [input.kind] : undefined, sinceDays: 45, limit: 80 }));
      if (input.topic) {
        const about = found.filter((f) => overlaps(input.topic, `${f.statement} ${f.scope?.query || ""} ${f.scope?.topic || ""}`));
        found = about.length ? about : found.filter((f) => ["trend", "interest", "sound", "competitor"].includes(f.kind));
      }
      const reports = await recentReports(user);
      collected.recalled.push(...found.slice(0, 20));
      onStep({ id: "recall", label: found.length ? `Found ${Math.min(found.length, 20)} things I already know` : "Nothing known yet, so I'll look", status: "done" });
      return {
        facts: found.slice(0, 20).map((f) => ({
          id: f.id,
          kind: f.kind,
          platform: f.platform,
          fact: f.statement,
          ageDays: ageDays(f),
          format: f.scope?.focus || null,
          accounts: f.metrics?.authors ?? null,
          earlySign: (f.metrics?.authors ?? 99) < 5 || Boolean(f.scope?.thin),
        })),
        recentReports: reports.length ? reports : undefined,
        note: found.length ? undefined : input.topic ? `Nothing known yet about ${input.topic}.` : "Nothing known yet about this market.",
      };
    }
    case "analyze_content": {
      const a = await analyzeContent({ platform, query: input.query, ctx, days: input.days || 30, focus: input.format || null }, { user, signal, purse, onStep });
      await keep(findingsFromAnalysis(a, ctx));
      collected.evidence.push(...rows(a.summary?.top || [], 6));
      collected.sample ||= a.sample;
      return compactAnalysis(a);
    }
    case "trending_now": {
      const t = await trendingNow({ platform, ctx }, { user, signal, purse, onStep });
      await keep(findingsFromTrending(t, ctx));
      collected.sample ||= t.sample;
      return {
        platform,
        region: t.region || ctx.region,
        note: t.regionNote || undefined,
        hashtags: t.hashtags.slice(0, 10),
        sounds: t.sounds.slice(0, 8),
        searchInterest: t.interest,
        formats: (t.formats || []).slice(0, 3).map((g) => ({ format: g.key, posts: g.n, reach: r1(g.medianStrength) })),
      };
    }
    case "search_interest": {
      onStep({ id: "interest", label: `Checking search interest in ${input.keywords.slice(0, 3).join(", ")}`, status: "running" });
      const r = await fetchCap("google.trends", { keywords: input.keywords.slice(0, 5), country: ctx.country || undefined }, { user, signal });
      purse.add(r.usd);
      const growth = trendGrowth(r.data);
      await keep(findingsFromTrending({ platform: "google", interest: growth }, ctx));
      onStep({ id: "interest", label: "Checked search interest", status: "done" });
      return { keywords: growth };
    }
    case "account_snapshot": {
      const s = await accountSnapshot({ platform: input.platform === "tiktok" ? "tiktok" : "instagram", handle: input.handle }, { user, signal, purse, ctx, onStep });
      await keep(findingsFromAccount(s, ctx));
      collected.evidence.push(...(s.breakouts || []).slice(0, 4));
      collected.sample ||= s.sample;
      if (s.unsupported || s.missing) return { handle: s.handle, note: s.missing ? "Account not found or private." : "Not supported on this platform yet." };
      return {
        handle: s.handle,
        followers: s.profile?.followers ?? null,
        postsPerWeek: s.cadence?.perWeek ?? null,
        normalViews: s.normal?.views ?? null,
        normalLikes: s.normal?.likes ?? null,
        formats: (s.summary?.formats || []).slice(0, 3).map((g) => ({ format: g.key, posts: g.n, reach: r1(g.medianStrength) })),
        hooks: (s.summary?.hooks || []).slice(0, 3).map((g) => ({ hook: g.key, posts: g.n, reach: r1(g.medianStrength) })),
        breakouts: s.breakouts,
      };
    }
    case "audience_voice": {
      const v = await audienceVoice({ platform: input.platform || "instagram", query: input.query, ctx }, { user, signal, purse, onStep });
      await keep(findingsFromVoice(v, ctx));
      return { read: v.read, questions: v.questions, pains: v.pains, desires: v.desires, phrases: v.phrases };
    }
    case "ads_running": {
      const r = await adsFor({ query: input.query }, { user, signal, purse, onStep });
      return { ads: r.ads.slice(0, 8).map((a) => ({ brand: a.brand, title: a.title, ctrPct: a.ctr, likes: a.likes, seconds: a.durationS, objective: a.objective })) };
    }
    case "news": {
      const r = await newsFor({ query: input.query, ctx }, { user, signal, purse, onStep });
      return { stories: r.items.slice(0, 8).map((n) => ({ title: n.title, source: n.source, url: n.url, date: n.postedAt?.slice(0, 10) })) };
    }
    case "propose": {
      collected.proposal = {
        kind: input.kind,
        platform: input.platform || ctx.platforms[0],
        format: ["reel", "carousel", "image", "video", "short", "text"].includes(input.format) ? input.format : null,
        topic: String(input.topic || input.focus || "").slice(0, 80) || null,
        handles: (input.handles || []).map((h) => String(h).replace(/^@/, "")).slice(0, 5),
        reason: String(input.reason || "").slice(0, 240),
        credits: PROPOSAL_PRICE[input.kind] ?? PRICES.report,
      };
      return { ok: true, note: "They will see a button to run it, with its price. Mention it in one sentence." };
    }
    default:
      return { error: "Unknown tool" };
  }
}

// The last few turns of the conversation, starting on a question.
const condense = (history) => {
  const recent = history.slice(-12);
  while (recent.length && recent[0].role !== "user") recent.shift();
  return recent.map((m) => ({ role: m.role, content: String(m.content || "").slice(0, 4000) || "(no text)" }));
};

async function claudeAgent({ question, history, env, send }) {
  const client = anthropic();
  const sys = [{ type: "text", text: system(env.ctx), cache_control: { type: "ephemeral" } }];
  const messages = [...condense(history), { role: "user", content: question }];
  let calls = 0;
  let answer = "";
  for (let turn = 0; turn < MAX_CALLS + 2; turn++) {
    const stream = client.beta.messages.stream(
      { model: MODELS.write.id, max_tokens: 3000, output_config: { effort: "low" }, ...SONNET_FALLBACK, system: sys, tools: TOOLS, messages },
      { signal: env.signal }
    );
    let turnText = "";
    let retracted = false;
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use" && turnText && !retracted) {
        send({ t: "retract" });
        retracted = true;
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        turnText += event.delta.text;
        if (!retracted) send({ t: "text", delta: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    await recordUsage({ userId: env.user.id !== "local" ? env.user.id : null, kind: "ask", model: final.model, usage: final.usage });
    if (final.stop_reason === "refusal") throw fail("declined", 422);
    const uses = final.content.filter((b) => b.type === "tool_use");
    if (!uses.length) {
      answer = turnText;
      break;
    }
    messages.push({ role: "assistant", content: final.content });
    const results = await Promise.all(
      uses.map(async (tu) => {
        const free = tu.name === "recall" || tu.name === "propose";
        if (!free && (calls >= MAX_CALLS || env.purse.empty)) {
          return { type: "tool_result", tool_use_id: tu.id, content: "No more data calls for this question. Answer with what you have, or call propose.", is_error: true };
        }
        if (!free) calls += 1;
        try {
          const out = await execTool(tu.name, tu.input || {}, env);
          return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 24000) };
        } catch (err) {
          if (env.signal?.aborted) throw err;
          env.onStep({ id: `${tu.name}:${tu.id}`, label: "One source didn't answer", status: "error" });
          return { type: "tool_result", tool_use_id: tu.id, content: `That source failed (${err?.code || "error"}). Carry on with what you have.`, is_error: true };
        }
      })
    );
    messages.push({ role: "user", content: results });
  }
  return answer;
}

/* ------------------------------------------------------------- stand-in -- */

const FORMAT_WORDS = [["carousel", "carousel"], ["reel", "reel"], ["short", "short"], ["thread", "text"], ["video", "video"], ["image", "image"]];

function route(question, ctx) {
  const q = question.toLowerCase();
  const platform = PLATFORM_IDS.find((p) => q.includes(p === "x" ? "twitter" : p)) || (/\bx\b/.test(q) ? "x" : ctx.platforms[0]);
  const format = FORMAT_WORDS.find(([w]) => q.includes(w))?.[1] || null;
  const handle = question.match(/@([\w.]{2,30})/)?.[1];
  if (/creator|influencer|ugc/.test(q)) return [["recall", { platform }], ["propose", { kind: "creators", platform, topic: ctx.keywords[0], reason: `A ranked shortlist of ${platformLabel(platform)} creators in ${ctx.niche}, checked on their recent posts, with contacts.` }]];
  if (/full report|deep|playbook|everything/.test(q)) return [["recall", { platform }], ["propose", { kind: "playbook", platform, format, topic: ctx.keywords[0], reason: `What works in ${ctx.niche} on ${platformLabel(platform)}, formula by formula, with examples.` }]];
  if (handle || /competitor/.test(q)) {
    const h = handle || ctx.competitors?.[platform]?.[0] || ctx.competitors?.instagram?.[0];
    if (h) return [["recall", { platform }], ["account_snapshot", { platform: platform === "tiktok" ? "tiktok" : "instagram", handle: h }]];
  }
  if (/trend|rising|viral|this week|sound|hashtag/.test(q)) return [["recall", { platform }], ["trending_now", { platform }]];
  if (/ask|question|audience|comment|pain|complain/.test(q)) return [["recall", { platform }], ["audience_voice", { platform: platform === "tiktok" ? "instagram" : platform, query: ctx.keywords[0] }]];
  if (/\bads?\b|advert/.test(q)) return [["ads_running", { query: ctx.keywords[0] }]];
  if (/news|launch/.test(q)) return [["news", { query: ctx.keywords[0] }]];
  return [["recall", { platform, topic: ctx.keywords[0] }], ["analyze_content", { platform, query: ctx.keywords[0], days: 30, format }]];
}

function writeMockAnswer(results, ctx) {
  const parts = [];
  const analysis = results.find(([n]) => n === "analyze_content")?.[1];
  const trend = results.find(([n]) => n === "trending_now")?.[1];
  const account = results.find(([n]) => n === "account_snapshot")?.[1];
  const voice = results.find(([n]) => n === "audience_voice")?.[1];
  const ads = results.find(([n]) => n === "ads_running")?.[1];
  const news = results.find(([n]) => n === "news")?.[1];
  const proposal = results.find(([n]) => n === "propose")?.[2];
  if (analysis) {
    const h = analysis.hooks?.find((g) => !g.earlySign) || analysis.hooks?.[0];
    const f = analysis.formats?.[0];
    const about = analysis.searchedFor;
    if (!analysis.posts) parts.push(`I couldn't find recent posts about ${about} on ${platformLabel(analysis.platform)}. Try a broader search word.`);
    else {
      const size = (g) => `${g.posts} posts from ${g.accounts ?? "?"} accounts`;
      parts.push(`**${h ? hookLabel(h.hook) : "Standout"} openings are working in ${about} on ${platformLabel(analysis.platform)}**, reaching about ${h?.reach ?? "?"}x a typical post across ${h ? size(h) : `${analysis.posts} posts`}.${analysis.earlyRead ? " This is an early read: there aren't many on-topic posts yet." : ""}`);
      parts.push(`\n### What's working\n${(analysis.hooks || []).slice(0, 3).map((g) => `- **${hookLabel(g.hook)}**: ${g.reach ?? "?"}x typical reach (${size(g)}${g.accountsBeatingNormPct != null ? `, ${g.accountsBeatingNormPct}% of those accounts beat the norm` : ""})${g.earlySign ? ", an early sign" : ""}`).join("\n")}${f ? `\n- **${formatLabel(f.format)}** lead the format mix at ${f.reach ?? "?"}x (${size(f)})` : ""}`);
      const top = analysis.topPosts?.[0];
      parts.push(`\n### What to post\n- Open on a ${h ? hookLabel(h.hook).toLowerCase() : "strong"} opening about ${ctx.keywords[0]}, in ${ctx.name}'s voice.${top ? ` Like [this post](${top.url}), which reached ${top.lift ?? "?"}x a typical one.` : ""}\n- Keep the first line under 10 words and promise one clear payoff.`);
    }
  }
  if (trend) {
    parts.push(`**This week on ${platformLabel(trend.platform)}:** ${(trend.hashtags || []).slice(0, 4).map((h) => `#${h.tag}${h.growthPct ? ` (${h.growthPct > 0 ? "+" : ""}${h.growthPct}%)` : ""}`).join(", ") || "no clear risers"}.`);
    if (trend.sounds?.length) parts.push(`\n### Sounds\n${trend.sounds.slice(0, 3).map((s) => `- "${s.title}"${s.commercial === false ? " (not cleared for brand accounts)" : ""}`).join("\n")}`);
    if (trend.searchInterest?.length) parts.push(`\n### Search interest\n${trend.searchInterest.map((k) => `- "${k.keyword}": ${k.growthPct >= 0 ? "up" : "down"} ${Math.abs(k.growthPct)}% over 4 weeks`).join("\n")}`);
  }
  if (account) parts.push(account.note ? `I couldn't read @${account.handle}. ${account.note}` : `**@${account.handle}** posts about ${account.postsPerWeek ?? "?"} times a week${account.followers ? ` to ${account.followers.toLocaleString("en-US")} followers` : ""}. ${account.breakouts?.length || 0} recent posts broke out${account.hooks?.[0] ? `, most often ${hookLabel(account.hooks[0].hook).toLowerCase()} openings` : ""}.${account.breakouts?.[0] ? ` Their best: [this post](${account.breakouts[0].url}) at ${account.breakouts[0].beat ?? account.breakouts[0].lift ?? "?"}x their normal.` : ""}`);
  if (voice) parts.push(`**What people ask about ${ctx.keywords[0]}** (from ${voice.read} comments and threads):\n${(voice.questions || []).slice(0, 4).map((q) => `- ${q.text}${q.count > 1 ? ` (${q.count})` : ""}`).join("\n") || "- Nothing clear yet"}${voice.pains?.length ? `\n\nTop frustration: ${voice.pains[0].text}` : ""}`);
  if (ads) parts.push(`**Ads running for ${ctx.keywords[0]}:**\n${ads.ads.slice(0, 4).map((a) => `- ${a.brand}: "${a.title}" (${a.ctrPct}% click-through)`).join("\n")}`);
  if (news) parts.push(`**Recent news:**\n${news.stories.slice(0, 4).map((n) => `- [${n.title}](${n.url}), ${n.source}`).join("\n")}`);
  if (proposal) parts.push(`${parts.length ? "\n" : ""}This needs a deeper look than one answer. ${proposal.reason} You can run it below.`);
  return parts.join("\n").trim() || "I couldn't find anything useful for that yet. Try naming a platform or a topic.";
}

async function mockAgent({ question, env, send }) {
  // QA hook: "#slow" in a question holds the answer back for a few seconds.
  if (question.includes("#slow")) {
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 4000);
      env.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  const plan = route(question, env.ctx);
  const results = [];
  for (const [name, input] of plan) {
    try {
      const out = await execTool(name, input, env);
      results.push([name, out, name === "propose" ? env.collected.proposal : null]);
    } catch (err) {
      env.onStep({ id: `${name}:mock`, label: "One source didn't answer", status: "error" });
    }
  }
  const answer = writeMockAnswer(results, env.ctx);
  for (let i = 0; i < answer.length; i += 48) {
    if (env.signal?.aborted) break;
    send({ t: "text", delta: answer.slice(i, i + 48) });
    await new Promise((r) => setTimeout(r, 18));
  }
  return answer;
}

// Runs the whole answer. Throws on failure, so the route can refund.
export async function answerQuestion({ question, history, ctx, user, threadId, signal, send }) {
  const collected = { findings: [], evidence: [], recalled: [], proposal: null, sample: false, steps: [], attempted: 0, useful: 0 };
  const onStep = (step) => {
    const i = collected.steps.findIndex((s) => s.id === step.id);
    if (i >= 0) collected.steps[i] = step;
    else collected.steps.push(step);
    send({ t: "step", ...step });
  };
  const env = { ctx, user, signal, purse: new Purse(DATA_BUDGET_USD), onStep, collected, threadId };
  const answer = isMock() ? await mockAgent({ question, env, send }) : await claudeAgent({ question, history, env, send });
  // Nothing measured and nothing known: the answer can only say so, so it's free.
  const noData = collected.attempted > 0 && collected.useful === 0 && !collected.recalled.length && !collected.proposal;
  return { answer: String(answer || "").trim(), collected, noData, spentUsd: env.purse.spent };
}
