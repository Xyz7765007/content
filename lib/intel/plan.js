import { asTag } from "./brand";
import { countryName } from "./market";

// Research plans: which calls answer "what's being posted about this niche on
// this platform", built from the market map so every platform is searched
// with its own words (hashtags on Instagram, OR-grouped searches on X,
// professional phrases on LinkedIn, communities on Reddit).
//
// depth  quick (Ask, the briefing) | standard (reports) | deep (playbooks)
// mode   top (what performs) | latest (what's new) | both

const PAGES = { quick: 1, standard: 2, deep: 3 };
const SPREAD = { quick: 2, standard: 3, deep: 4 };

// Case doesn't make a different search: "Sunscreen" and "sunscreen" are one query.
const uniq = (list) => {
  const seen = new Set();
  return list.map((x) => String(x || "").trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
};
const FILLER = new Set(["a", "an", "and", "the", "for", "of", "to", "in", "on", "with", "my", "your", "how", "what", "is", "are", "best", "top", "about", "latest", "new"]);

// An X search that finds posts: X ANDs bare words, so a comma list becomes an
// OR group, filler words are dropped, and a long phrase keeps its four most
// telling words. Searches that already use operators are left alone.
export function xQuery(text, { lang = "en", replies = false } = {}) {
  const t = String(text || "").trim();
  if (!t) return null;
  let base;
  if (/\bOR\b|["():]/.test(t)) base = t;
  else if (t.includes(",")) base = `(${t.split(/\s*,\s*/).filter(Boolean).slice(0, 5).map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(" OR ")})`;
  else base = t.split(/\s+/).filter((w) => !FILLER.has(w.toLowerCase())).slice(0, 4).join(" ") || t;
  return `${base}${lang && !/\blang:/.test(base) ? ` lang:${lang}` : ""}${replies || /filter:replies/.test(base) ? "" : " -filter:replies"}`;
}

export function postJobs(platform, map, ctx, { days = 30, depth = "standard", topic = null, mode = "top", handles = [] } = {}) {
  const pages = PAGES[depth] || 2;
  const spread = SPREAD[depth] || 3;
  const terms = uniq([topic, ...(map?.terms || []), ...(ctx?.keywords || [])]).slice(0, spread);
  const place = countryName(map?.country || ctx?.country);
  const lang = map?.language || "en";
  const jobs = [];
  const job = (cap, params, extra = {}) => jobs.push({ cap, params, pages: 1, group: platform, ...extra });

  switch (platform) {
    case "instagram": {
      for (const q of terms) job("instagram.reelsSearch", { q }, { pages });
      const tags = uniq([topic && asTag(topic), ...(map?.hashtags || [])]).slice(0, Math.max(2, spread));
      // Hashtag pages hold posts months old: useful for what performs, not for this week.
      if (mode !== "latest" && days > 14) for (const tag of tags) job("instagram.hashtag", { tag });
      break;
    }
    case "tiktok": {
      const qs = uniq([topic, ...(map?.tiktokQueries || []), ...terms]).slice(0, spread);
      const d = days <= 1 ? 1 : days <= 7 ? 7 : 30;
      for (const q of qs) {
        if (mode !== "latest") job("tiktok.search", { q, sort: 1, days: d }, { pages });
        if (mode !== "top") job("tiktok.search", { q, sort: 2, days: d }, { pages: 1 });
        if (mode === "top") job("tiktok.search", { q, sort: 0, days: d }, { pages: 1 });
      }
      break;
    }
    case "youtube": {
      const qs = uniq([topic && (place ? `${topic} ${place}` : topic), topic && `${topic} shorts`, ...(map?.youtubeQueries || []), terms[0] && `${terms[0]} shorts`]).slice(0, spread + 1);
      for (const q of qs) job("youtube.search", { q });
      break;
    }
    case "x": {
      // For "what performs", X's Top search keeps a floor of likes (deal spam
      // has none) and also reads the niche's words worldwide: formats travel,
      // and one country's slice of X can be small.
      const floor = (q) => (/min_faves:/.test(q) ? q : `${q} min_faves:10`);
      const local = uniq([topic && xQuery(topic, { lang }), ...(map?.xQueries || []), ...(!map?.xQueries?.length ? terms.map((t) => xQuery(t, { lang })) : [])]).slice(0, spread);
      const global = topic ? [] : uniq((map?.terms || terms).map((t) => String(t).replace(new RegExp(`\\b(${[place, map?.country].filter(Boolean).join("|") || "\\b"})\\b`, "gi"), "").replace(/\b(indian?|uk|usa?)\b/gi, "").trim()).filter((t) => t.length > 2)).slice(0, Math.max(1, spread - 2)).map((t) => xQuery(t, { lang }));
      for (const q of local) {
        if (mode !== "latest") job("x.search", { q: floor(q), sort: "Top" }, { pages });
        if (mode !== "top") job("x.search", { q, sort: "Latest" }, { pages: mode === "latest" ? pages : 1 });
      }
      if (mode === "top") for (const q of global) job("x.search", { q: floor(q), sort: "Top" }, { pages });
      for (const h of handles.slice(0, 3)) job("x.search", { q: `from:${h} -filter:replies`, sort: "Latest" }, { pages: 1, group: "x" });
      break;
    }
    case "linkedin": {
      const qs = uniq([topic, ...(map?.linkedinQueries || []), ...terms]).slice(0, Math.max(2, spread - 1));
      const window = days <= 1 ? "24h" : days <= 7 ? "week" : "month";
      for (const q of qs) {
        if (mode !== "latest") job("linkedin.search", { q, sort: "relevance", window }, { pages: Math.min(pages, 2) });
        if (mode !== "top") job("linkedin.search", { q, sort: "date", window }, { pages: 1 });
      }
      break;
    }
    case "reddit": {
      const timeframe = days <= 1 ? "day" : days <= 7 ? "week" : days <= 31 ? "month" : "year";
      const qs = uniq([topic, ...(map?.redditQueries || []), ...terms]).slice(0, spread);
      for (const q of qs) job("reddit.search", { q, sort: mode === "latest" ? "new" : "top", timeframe });
      const subs = (map?.subreddits || []).slice(0, spread);
      for (const s of subs) job("reddit.search", { q: `subreddit:${s} ${topic || terms[0] || ""}`.trim(), sort: mode === "latest" ? "new" : "top", timeframe });
      break;
    }
    default:
      break;
  }
  return jobs;
}

export function newsJobs(map, ctx, { days = 7, topic = null, depth = "standard" } = {}) {
  const place = countryName(map?.country || ctx?.country);
  const qs = uniq([topic && (place && !new RegExp(place, "i").test(topic) ? `${topic} ${place}` : topic), ...(topic ? [] : map?.newsQueries || []), ...(topic ? [] : (ctx?.keywords || []).slice(0, 2).map((k) => (place ? `${k} ${place}` : k)))]).slice(0, depth === "quick" ? 2 : depth === "deep" ? 5 : 3);
  const country = map?.country || ctx?.country || null;
  const jobs = qs.map((q) => ({ cap: "news.search", params: { q, country, days, limit: 20 }, group: "news" }));
  // The free feed reads wider; short queries keep its date filter honest.
  for (const q of qs.slice(0, 2)) jobs.push({ cap: "news.rss", params: { q, country, days }, group: "news", label: "News" });
  return jobs;
}

// The newest posts that matter this week, for trend reads and briefings.
export function freshJobs(platform, map, ctx, { depth = "quick", topic = null } = {}) {
  return postJobs(platform, map, ctx, { days: 7, depth, topic, mode: "both" });
}
