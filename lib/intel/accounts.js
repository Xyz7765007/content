import { collect } from "./collect";
import { fetchCap } from "./source";
import { tagPosts } from "./tagger";
import { baselineFor, cadence, enrich, rows, strength, summarize } from "./stats";
import { platformLabel, TZ_OFFSET, profileUrl } from "./taxonomy";
import { isMock } from "../ai/client";

// One account on any platform: its size, its normal, how often it posts, what
// it posts, and what broke out for it. And competitors resolved across
// platforms: a handle is only trusted once its profile has been read and its
// name matches the brand, because a guessed handle often belongs to someone
// else (on X, @nykaa is a 16-follower personal account).

const noop = () => {};
const clean = (h) => String(h || "").trim().replace(/^@/, "").replace(/\/+$/, "");
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

// Does a profile plausibly belong to this brand? Judged on the account's
// display name: a handle proves nothing when it was guessed from the brand's
// name in the first place (on X, @nykaa is a stranger called "Meráth Mónika").
export function nameMatches(brand, profile) {
  const b = norm(brand);
  if (!b) return true;
  const n = norm(profile?.name);
  if (!n) return false;
  return n.includes(b) || b.includes(n) || (b.length >= 5 && n.startsWith(b.slice(0, 5)));
}

// A handle the person typed is trusted when the account is real (has an
// audience); one the market map guessed must also carry the brand's name.
const accept = (c, field, name, p, min = 1000) => Boolean(p) && !p.private && (nameMatches(name, p) || (!c.suggested && Boolean(c[field]) && (p.followers ?? 0) >= min));

// One call; a source that times out gets one more try before it counts as missing.
async function one(cap, params, env, { retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetchCap(cap, params, { user: env.user, signal: env.signal, fresh: attempt > 0 });
      env.purse?.add(r.usd);
      return r.data;
    } catch (err) {
      if (env.signal?.aborted) throw err;
      if (err?.code !== "data_unavailable" || attempt === retries) return null;
    }
  }
  return null;
}

// An account found by searching (not typed by the person) must carry the
// brand's name closely, not just contain a common word: "Minimalist Screens"
// is not the skincare brand Minimalist.
const SUFFIXES = new Set(["", "official", "india", "in", "skincare", "skin", "beauty", "cosmetics", "store", "shop", "hq", "co", "global", "world", "labs", "tv"]);
export function closeName(brand, profile) {
  const b = norm(brand);
  const n = norm(profile?.name);
  if (!b || !n) return false;
  if (n === b) return true;
  if (n.startsWith(b)) return SUFFIXES.has(n.slice(b.length)) || (b.length >= 8 && n.length - b.length <= 6);
  if (n.endsWith(b)) return SUFFIXES.has(n.slice(0, n.length - b.length)) || ["the", "be", "my", "get", "try"].includes(n.slice(0, n.length - b.length));
  return false;
}

const isLinkedInUrl = (v) => /linkedin\.com\/(company|in|school|showcase)\//i.test(String(v || ""));
const isChannelId = (v) => /^UC[\w-]{20,}$/.test(String(v || ""));

// Reads one account. `who` is a handle, an @handle, a profile link, or for
// YouTube a channel id; LinkedIn needs a company or member link.
export async function accountSnapshot({ platform, handle, url = null, name = null }, env = {}) {
  const { user, signal, purse, ctx, onStep = noop } = env;
  const who = clean(url || handle);
  const shown = platform === "linkedin" || platform === "facebook" ? name || who.replace(/^https?:\/\/(www\.)?/, "").replace(/^linkedin\.com\/(company|in)\//, "") : `@${clean(handle || who)}`;
  onStep({ id: `account:${platform}:${who}`, label: `Reading ${shown} on ${platformLabel(platform)}`, status: "running" });
  let profile = null;
  let posts = [];
  const e = { user, signal, purse };

  if (platform === "instagram") {
    const h = clean(handle || who.split("/").filter(Boolean).pop());
    const r = await collect([{ cap: "instagram.profile", params: { handle: h } }, { cap: "instagram.posts", params: { handle: h } }], e);
    profile = r.items.find((x) => x.kind === "profile") || null;
    posts = r.items.filter((x) => x.kind === "post");
    if (!posts.length && profile && !profile.private) posts = (await one("instagram.reels", { handle: h, limit: 12 }, e)) || [];
    posts = posts.map((p) => ({ ...p, author: { ...p.author, handle: p.author?.handle || h } }));
  } else if (platform === "tiktok") {
    const h = clean(handle || who.split("@").pop());
    profile = await one("tiktok.profile", { handle: h }, e);
    if (profile?.secUid) posts = (await one("tiktok.videos", { secUid: profile.secUid, limit: 25 }, e)) || [];
  } else if (platform === "youtube") {
    let channelId = isChannelId(who) ? who : String(url || "").match(/channel\/(UC[\w-]+)/)?.[1] || null;
    if (!channelId) {
      // A handle or a name: find the channel through search, by its name.
      const found = (await one("youtube.search", { q: name || clean(handle || who).replace(/^@/, "") }, e)) || [];
      const target = norm(name || handle || who);
      const match = found.find((v) => norm(v.author?.name).includes(target) || target.includes(norm(v.author?.name))) || null;
      channelId = match?.author?.handle || null;
    }
    if (channelId) {
      const r = await collect([{ cap: "youtube.channel", params: { channelId } }, { cap: "youtube.videos", params: { channelId } }], e);
      profile = r.items.find((x) => x.kind === "profile") || null;
      posts = r.items.filter((x) => x.kind === "post");
    }
  } else if (platform === "x") {
    const h = clean(handle || who.split("/").filter(Boolean).pop());
    const r = await collect([{ cap: "x.profile", params: { handle: h } }, { cap: "x.search", params: { q: `from:${h} -filter:replies`, sort: "Latest" }, pages: 2 }], e);
    profile = r.items.find((x) => x.kind === "profile") || null;
    posts = r.items.filter((x) => x.kind === "post" && String(x.author?.handle || "").toLowerCase() === h.toLowerCase());
  } else if (platform === "linkedin") {
    const link = isLinkedInUrl(who) ? (who.startsWith("http") ? who : `https://www.${who.replace(/^www\./, "")}`) : `https://www.linkedin.com/company/${clean(who)}/`;
    if (/\/in\//i.test(link)) {
      const r = await collect([{ cap: "linkedin.profile", params: { url: link } }, { cap: "linkedin.userPosts", params: { url: link, limit: 25 } }], e);
      profile = r.items.find((x) => x.kind === "profile") || null;
      posts = r.items.filter((x) => x.kind === "post");
    } else {
      const r = await collect([{ cap: "linkedin.company", params: { url: link } }, { cap: "linkedin.companyPosts", params: { url: link, window: "month" } }], e);
      profile = r.items.find((x) => x.kind === "profile") || null;
      posts = r.items.filter((x) => x.kind === "post");
    }
  } else if (platform === "facebook") {
    const link = /^https?:\/\//.test(who) ? who : `https://www.facebook.com/${clean(who)}`;
    posts = (await one("facebook.posts", { url: link }, e)) || [];
  } else {
    onStep({ id: `account:${platform}:${who}`, label: `${platformLabel(platform)} accounts can't be read yet`, status: "done" });
    return { platform, handle: who, unsupported: true };
  }

  if (!profile && !posts.length) {
    onStep({ id: `account:${platform}:${who}`, label: `Couldn't find ${shown} on ${platformLabel(platform)}`, status: "error" });
    return { platform, handle: who, missing: true };
  }
  const h = profile?.handle || clean(handle || who);
  posts = posts.map((p) => ({ ...p, author: { ...p.author, handle: p.author?.handle || h, followers: p.author?.followers ?? profile?.followers } }));
  const tagged = posts.length ? await tagPosts(posts, { niche: ctx?.niche, brand: ctx?.name, user }) : [];
  const base = baselineFor(tagged);
  const key = `${platform}:${posts[0]?.author?.handle || h}`;
  const enriched = enrich(tagged, { baselines: { [key]: base }, tzOffsetMin: TZ_OFFSET[ctx?.country] ?? null });
  const summary = summarize(enriched, { top: 5 });
  onStep({ id: `account:${platform}:${who}`, label: `Read ${shown}: ${enriched.length} recent posts`, status: "done" });
  return {
    platform,
    handle: h,
    // Where the account lives, so every card can link to it.
    url: profile?.url || (/^https?:\/\//.test(String(url || "")) ? url : null) || profileUrl(platform, h),
    profile,
    normal: base,
    cadence: cadence(enriched),
    summary,
    breakouts: rows(enriched.filter((p) => (p.calc.beat ?? 0) >= 1.8).sort((a, b) => strength(b) - strength(a)), 5),
    recent: rows([...enriched].sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || ""))), 5),
    posts: enriched,
    sample: isMock(),
  };
}

// Finds and checks a competitor's accounts. Named handles are verified;
// missing ones are looked up by name; anything that doesn't match the brand's
// name is dropped rather than guessed. Returns { name, website, accounts }.
export async function resolveCompetitor(c, env = {}, { platforms = ["instagram", "x", "linkedin", "youtube", "tiktok"] } = {}) {
  const e = { user: env.user, signal: env.signal, purse: env.purse };
  const name = c.name || c.instagram || c.x || c.website || "";
  const out = { name, website: c.website || null, accounts: {}, checked: {} };
  const tasks = [];

  if (platforms.includes("instagram")) {
    tasks.push(
      (async () => {
        let h = clean(c.instagram);
        let p = h ? await one("instagram.profile", { handle: h }, e) : null;
        // The guessed handle didn't check out: look the brand up by name.
        if ((!p || !accept(c, "instagram", name, p)) && name) {
          const found = (await one("instagram.usersSearch", { q: name }, e)) || [];
          const cand = found.filter((u) => closeName(name, u)).slice(0, 2);
          for (const u of cand) {
            const q = await one("instagram.profile", { handle: u.handle }, e);
            if (q && !q.private && (q.followers ?? 0) >= 1000) {
              p = q;
              h = u.handle;
              break;
            }
          }
        }
        out.checked.instagram = Boolean(p);
        if (p && accept(c, "instagram", name, p)) out.accounts.instagram = { handle: p.handle || h, followers: p.followers, name: p.name, url: p.url };
      })()
    );
  }
  if (platforms.includes("x") && c.x) {
    tasks.push(
      (async () => {
        const p = await one("x.profile", { handle: clean(c.x) }, e);
        out.checked.x = Boolean(p);
        // A tiny account with another name is someone else.
        if (accept(c, "x", name, p)) out.accounts.x = { handle: p.handle, followers: p.followers, name: p.name, url: p.url };
      })()
    );
  }
  if (platforms.includes("tiktok")) {
    tasks.push(
      (async () => {
        let h = clean(c.tiktok);
        if (!h && name && c.lookForTiktok) {
          const found = (await one("tiktok.usersSearch", { q: name }, e)) || [];
          h = found.find((u) => closeName(name, u) && (u.followers ?? 0) >= 1000)?.handle || null;
        }
        if (!h) return;
        const p = await one("tiktok.profile", { handle: h }, e);
        out.checked.tiktok = Boolean(p);
        if (accept(c, "tiktok", name, p)) out.accounts.tiktok = { handle: p.handle || h, followers: p.followers, name: p.name, url: p.url, secUid: p.secUid };
      })()
    );
  }
  if (platforms.includes("linkedin") && name) {
    tasks.push(
      (async () => {
        let link = isLinkedInUrl(c.linkedin) ? c.linkedin : null;
        if (!link) {
          const res = (await one("web.search", { q: `site:linkedin.com/company ${name}`, limit: 5 }, e)) || [];
          link = res.map((r) => r.url).find((u) => /linkedin\.com\/company\//i.test(u)) || null;
          if (link) link = link.replace(/(linkedin\.com\/company\/[^/?#]+).*/i, "$1/");
        }
        if (!link) return;
        const p = await one("linkedin.company", { url: link }, e);
        out.checked.linkedin = Boolean(p);
        if (p && nameMatches(name, p)) out.accounts.linkedin = { url: link, followers: p.followers, name: p.name };
      })()
    );
  }
  if (platforms.includes("youtube") && (c.youtube || name)) {
    tasks.push(
      (async () => {
        const id = isChannelId(c.youtube) ? c.youtube : null;
        if (id) {
          out.accounts.youtube = { channelId: id };
          return;
        }
        const found = (await one("youtube.search", { q: `${name} official` }, e)) || [];
        const match = found.find((v) => closeName(name, { name: v.author?.name }));
        if (!match?.author?.handle) return;
        const ch = await one("youtube.channel", { channelId: match.author.handle }, e);
        if (ch && (ch.followers ?? 0) >= 5000) out.accounts.youtube = { channelId: match.author.handle, name: ch.name || match.author.name, followers: ch.followers };
      })()
    );
  }
  if (!out.website && name) {
    tasks.push(
      (async () => {
        const res = (await one("web.search", { q: `${name} official website`, limit: 5 }, e)) || [];
        const site = res.find((r) => r.domain && !/(^|\.)(instagram|facebook|linkedin|x|twitter|youtube|tiktok|wikipedia|reddit|quora|crunchbase|glassdoor)\./i.test(r.domain) && nameMatches(name, { name: r.domain.split(".")[0] }));
        if (site) out.website = site.domain;
      })()
    );
  }
  await Promise.all(tasks);
  return out;
}
