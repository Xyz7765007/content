// The stand-in data source (HUESY_AI_MOCK=1): answers in each provider's own
// raw shape, as captured from real replies on 18-19 Oct 2026, so the parsers,
// stats, agents and screens run exactly as they do on real data, at no cost.
//
// Every account, brand and post here is invented. Numbers are seeded from the
// request, so the same question gives the same answer and tests stay stable.
// Some openings are built to win (before/after, questions, numbered lists,
// POV), which gives the analysis a real pattern to find, and some posts and
// stories announce launches and collaborations, for watchlists and Ask.
//
// QA hooks in a query, tag or handle: "#empty" returns nothing, "#fail"
// fails, "#slow" takes longer.

import { fail } from "../ai/errors";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function seeded(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const logn = (rand, mid, spread = 1) => Math.max(0, Math.round(mid * Math.exp((rand() + rand() + rand() - 1.5) * spread)));
const NOW = () => Date.now();
const ago = (rand, maxDays = 28, minHours = 1) => NOW() - minHours * 3600000 - Math.floor(rand() * maxDays * 86400000);
const sec = (ms) => Math.floor(ms / 1000);

const topicOf = (params) =>
  String(params.q || params.query || params.tag || params.keywords?.[0] || params.handle || params.domain || params.brief || "your niche")
    .replace(/subreddit:\S+/g, "")
    .replace(/\b(from:\S+|lang:\w+|-filter:\w+|min_faves:\d+|OR)\b/g, " ")
    .replace(/[#@"()]/g, "")
    .replace(/(empty|fail|slow)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ") || "your niche";

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

// Openings and how much each tends to beat a typical post.
export const MOCK_HOOKS = [
  ["before_after", 3.0, (t) => `Day 1 vs day 30 of my ${t} reset. The difference is wild`],
  ["question", 2.4, (t) => `Why does your ${t} routine stop working after a month?`],
  ["number_list", 2.2, (t) => `5 ${t} mistakes almost everyone makes (and the fix)`],
  ["pov", 2.0, (t) => `POV: you finally found the ${t} that actually works`],
  ["myth_busting", 1.9, (t) => `${cap(t)} myth: more is better. Here's what the research says`],
  ["contrarian", 1.7, (t) => `Stop doing this with your ${t}. I'm serious`],
  ["how_to", 1.6, (t) => `How to build a ${t} routine in 3 simple steps`],
  ["trend_meme", 1.5, (t) => `Tell me you're obsessed with ${t} without telling me`],
  ["comparison", 1.4, (t) => `Cheap vs expensive ${t}: which one wins?`],
  ["story", 1.3, (t) => `I almost gave up on ${t} until this happened`],
  ["bold_claim", 1.2, (t) => `This one change fixed my ${t} in two weeks`],
  ["social_proof", 1.2, (t) => `1,200 reviews later, this ${t} pick still wins`],
  ["challenge", 1.1, (t) => `Try this 7 day ${t} challenge with me`],
  ["behind_scenes", 1.0, (t) => `How we make our ${t}, start to finish`],
];

const HANDLES = ["glowlab.daily", "dewdrop.notes", "theroutine.club", "brightside.co", "fieldnotes.studio", "moss.and.mint", "honest.shelf", "aurora.make", "kindskin.lab", "northwake.co", "petal.theory", "solenne.studio", "tidy.ritual", "bloom.method", "cedar.and.salt", "lumen.kitchen", "rue.and.rose", "saltwater.skin", "quiet.labs", "oat.and.honey"];
const BRANDS = ["Glowlab", "Dewdrop", "Brightside", "Kindskin", "Petal Theory", "Northwake", "Aurora Make", "Honest Shelf"];
const SONGS = ["Golden Hour Loop", "Soft Focus", "Paper Planes Remix", "Late Night Glow", "Sunday Reset", "Little Wins", "Bright Again", "Slow Morning"];
const MOVES = [
  ["launches", "a new {t} range"],
  ["teams up with", "{b2} on a limited {t} collection"],
  ["unveils", "its biggest {t} campaign yet, featuring a new ambassador"],
  ["expands", "into three new cities with its {t} line"],
  ["rebrands", "its {t} products with a new look"],
  ["raises", "fresh funding to grow its {t} business"],
];
const move = (rand, t) => {
  const b = pick(rand, BRANDS);
  const b2 = pick(rand, BRANDS.filter((x) => x !== b));
  const [verb, rest] = pick(rand, MOVES);
  return { brand: b, text: `${b} ${verb} ${rest.replace("{t}", t).replace("{b2}", b2)}` };
};

function makePost(rand, t, i, { platform }) {
  // Real niches cluster around a few openings.
  const [hook, lift, write] = MOCK_HOOKS[Math.min(MOCK_HOOKS.length - 1, Math.floor(Math.pow(rand(), 1.6) * MOCK_HOOKS.length))];
  const handle = HANDLES[(i * 7 + Math.floor(rand() * 7)) % HANDLES.length];
  const base = platform === "tiktok" ? 42000 : platform === "youtube" ? 26000 : platform === "instagram" ? 18000 : 0;
  const views = base ? logn(rand, base * lift, 0.9) : null;
  const likes = logn(rand, views ? views * 0.045 : 160 * lift, 0.6);
  // About one in six posts announces a move, so watchlists and Ask find some.
  const news = rand() < 0.17 ? move(rand, t) : null;
  const first = news ? `${news.text} 🎉` : write(t);
  return { hook, lift, handle, views, likes, comments: Math.round(likes * (0.02 + rand() * 0.04)), shares: Math.round(likes * (0.03 + rand() * 0.05)), saves: Math.round(likes * (0.05 + rand() * 0.12)), first, news, duration: Math.round(8 + rand() * 50) };
}

const cursorFor = (params, pages = 3) => {
  const n = Number(String(params.cursor || "").replace(/\D/g, "")) || 0;
  return n + 1 < pages ? `cur_${n + 1}` : null;
};
const pageOf = (params) => Number(String(params.cursor || "").replace(/\D/g, "")) || 0;

export async function mockRaw(name, params = {}) {
  const probe = JSON.stringify(params);
  if (probe.includes("#slow")) await delay(2500);
  else await delay(80 + Math.floor(Math.random() * 160));
  if (probe.includes("#fail")) throw fail("data_unavailable", 503);
  const empty = probe.includes("#empty");
  const rand = seeded(`${name}|${probe}`);
  // An account's own feed is about its niche, not about its handle.
  const t = ["instagram.posts", "instagram.reels", "tiktok.videos", "youtube.videos", "facebook.posts", "linkedin.companyPosts", "linkedin.userPosts"].includes(name) ? "skincare routine" : topicOf(params);
  const tag = t.replace(/\s+/g, "").toLowerCase();
  const handle = String(params.handle || pick(rand, HANDLES)).replace(/^@/, "");
  const many = (n, fn) => (empty ? [] : Array.from({ length: n }, (_, i) => fn(makePost(rand, t, i + pageOf(params) * n, { platform: name.split(".")[0] }), i)));

  switch (name) {
    /* ------------------------------------------------------ news, web */
    case "news.search":
      return {
        output: {
          found: !empty,
          data: {
            items: empty
              ? []
              : [
                  ...Array.from({ length: 10 }, (_, i) => {
                    const m = move(rand, t);
                    return { createdUtc: sec(ago(rand, Math.max(1, (params.days || 7) - 0.5))), image: null, snippet: `${m.brand} announced the move this week, its first in the ${t} market this year.`, source: pick(rand, ["Daily Brief", "Trade Weekly", "Market Wire", "The Retail Post"]), title: `${m.text}`, url: `https://news.example.com/${tag}-${i}-${Math.floor(rand() * 1e6)}` };
                  }),
                  // Real searches also bring back stories about nothing in the market.
                  { createdUtc: sec(ago(rand, 2)), image: null, snippet: "Stock quote, executives and annual filings.", source: "Finance Pages", title: "Northwind Holdings Limited: Company Profile & Facts", url: `https://news.example.com/offtopic-${tag}` },
                ],
          },
        },
      };
    case "web.search":
      return { output: { results: empty ? [] : BRANDS.slice(0, 6).map((b, i) => ({ title: `${b} | Official site`, link: `https://www.${b.toLowerCase().replace(/\s+/g, "")}.example/`, snippet: `${b} makes ${t} products.`, position: i + 1 })) } };
    case "google.trends": {
      const kws = (params.keywords || [t]).slice(0, 5);
      return { output: { series: [{ keywords: kws, averages: kws.map(() => 40), data: Array.from({ length: 52 }, (_, w) => ({ date_from: new Date(NOW() - (51 - w) * 7 * 86400000).toISOString().slice(0, 10), values: kws.map((_, k) => Math.max(5, Math.round((k === 0 ? 30 + w * 0.9 : 55 - w * 0.4) + (rand() - 0.5) * 8))) })) }] } };
    }

    /* ------------------------------------------------------ Instagram */
    case "instagram.reelsSearch":
      return {
        output: {
          found: !empty,
          data: {
            reels: many(12, (p, i) => {
              const code = `R${Math.floor(rand() * 1e9).toString(36)}`;
              return { id: `${Math.floor(rand() * 1e15)}`, shortcode: code, url: `https://www.instagram.com/reel/${code}/`, caption: `${p.first}\n\n#${tag} #${pick(rand, ["routine", "tips", "daily", "selfcare"])}`, createdUtc: sec(ago(rand, 40)), durationSeconds: p.duration, likes: p.likes, comments: p.comments, reshares: p.shares, views: Math.max(500, p.views || p.likes * 22), username: p.handle, displayName: cap(p.handle.split(".")[0]), verified: rand() < 0.1, thumbnail: null, soundTitle: rand() < 0.5 ? "Original audio" : pick(rand, SONGS), soundAuthor: p.handle, hashtags: [`#${tag}`], paidPartnership: false, productType: "clips" };
            }),
            nextCursor: empty ? null : cursorFor(params, 3),
          },
        },
      };
    case "instagram.hashtag":
    case "instagram.posts": {
      const n = name === "instagram.posts" ? 12 : 10;
      return {
        output: {
          posts: many(n, (p, i) => {
            const roll = rand();
            const kind = roll < 0.45 ? "clips" : roll < 0.75 ? "carousel" : "image";
            const code = `M${i}${Math.floor(rand() * 1e8).toString(36)}`;
            return {
              id: `${Math.floor(rand() * 1e15)}`,
              shortcode: code,
              url: `https://www.instagram.com/p/${code}/`,
              caption: `${p.first} ${pick(rand, ["✨", "👇", "", "💡"])}\n\n#${tag} #${pick(rand, ["routine", "tips", "daily", "selfcare", "howto"])}`,
              product_type: kind === "clips" ? "clips" : "feed",
              __typename: kind === "carousel" ? "XDTGraphSidecar" : kind === "clips" ? "XDTGraphVideo" : "XDTGraphImage",
              is_video: kind === "clips",
              video_view_count: kind === "clips" ? Math.max(400, p.views || p.likes * 22) : null,
              video_duration: kind === "clips" ? p.duration : null,
              like_count: p.likes,
              comment_count: p.comments,
              taken_at: sec(ago(rand, name === "instagram.posts" ? 30 : 120)),
              owner: { username: name === "instagram.posts" ? handle : p.handle, full_name: cap((name === "instagram.posts" ? handle : p.handle).split(".")[0]) },
              clips_music_attribution_info: kind === "clips" ? { song_name: rand() < 0.5 ? "Original audio" : pick(rand, SONGS), artist_name: p.handle, uses_original_audio: rand() < 0.5 } : null,
              is_paid_partnership: false,
              is_ad: false,
            };
          }),
          count: n,
          next_cursor: empty ? null : "2",
        },
      };
    }
    case "instagram.reels":
      return { output: { reels: many(12, (p, i) => ({ code: `R${i}${handle.length}`, id: `r${i}`, taken_at: sec(ago(rand, 30)), like_count: p.likes, comment_count: p.comments, play_count: Math.max(500, p.views || p.likes * 20), caption: { text: p.first }, video_duration: p.duration })) } };
    case "instagram.usersSearch":
      return { output: { users: empty ? [] : HANDLES.slice(0, 14).map((h) => ({ username: h, full_name: cap(h.split(".")[0]), biography: `${cap(t)} tips and honest reviews`, external_url: null, is_private: false, is_verified: rand() < 0.1, follower_count: null, category_name: "Creator", url: `https://www.instagram.com/${h}/` })), next_cursor: null } };
    case "instagram.profile":
      return { output: { username: handle, user_id: `${Math.floor(rand() * 1e10)}`, full_name: cap(handle.split(".")[0]), followers: logn(rand, 48000, 1), following: 310, posts_count: logn(rand, 420, 0.5), is_verified: rand() < 0.2, is_private: false, biography: `Making ${t} simple. Collabs: hello@${handle.replace(/\W+/g, "")}.example` } };
    case "instagram.comments": {
      const lines = [`Does this work for sensitive ${t}?`, `How long until you saw results?`, `Can you do one for beginners?`, `What order do I use these in?`, `Price is too high for me honestly`, `This finally made ${t} make sense`, `Is it safe to use every day?`, `Where do I buy this in India?`];
      return { output: { comments: empty ? [] : Array.from({ length: 16 }, (_, i) => ({ text: lines[i % lines.length], comment_like_count: logn(rand, 6, 0.8), created_at_utc: sec(ago(rand, 20)), user: { username: `fan${i}` } })), count: 16, next_cursor: null } };
    }
    case "instagram.contact":
      return { output: { found: !empty, data: { bio: `${cap(t)} creator`, displayName: cap(handle.split(".")[0]), emails: empty ? [] : [`hello@${handle.replace(/\W+/g, "")}.example`], phones: [], externalUrl: `https://linktr.ee/${handle}`, handle, isBusiness: false, private: false, verified: false } } };
    case "instagram.similar":
      return { output: { found: true, data: { profiles: empty ? [] : HANDLES.slice(3, 15).map((h) => ({ username: h, displayName: cap(h.split(".")[0]), verified: false })) } } };

    /* --------------------------------------------------------- TikTok */
    case "tiktok.search":
      return {
        output: {
          found: !empty,
          data: {
            videos: many(15, (p) => ({ id: `7${Math.floor(rand() * 1e17)}`, url: `https://www.tiktok.com/@${p.handle}/video/${Math.floor(rand() * 1e17)}`, caption: `${p.first} #${tag} #fyp`, createdUtc: sec(ago(rand, Math.max(1, params.days || 30))), durationSeconds: p.duration, author: p.handle, authorName: cap(p.handle.split(".")[0]), authorFollowers: null, authorVerified: null, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves, views: p.views, hashtags: [tag, "fyp"], soundTitle: rand() < 0.5 ? `original sound - ${p.handle}` : pick(rand, SONGS), soundAuthor: p.handle, image: null, region: "US", paidPartnership: false })),
            nextCursor: empty ? null : cursorFor(params, 3),
          },
        },
      };
    case "tiktok.usersSearch":
      return { output: { users: empty ? [] : HANDLES.slice(0, 10).map((h) => ({ handle: h, nickname: cap(h.split(".")[0]), followers: logn(rand, 60000, 1), following: 200, likes: logn(rand, 900000, 1), videos: 140, verified: false, bio: `${cap(t)} made easy`, secUid: `MS4w${h.length}${h.charCodeAt(0)}`, region: "US" })), next_cursor: null } };
    case "tiktok.profile":
      return { output: { username: handle, nickname: cap(handle.split(".")[0]), sec_uid: `MS4w${handle.length}${handle.charCodeAt(0)}`, followers: logn(rand, 120000, 1), following: 210, likes: logn(rand, 2400000, 1), videos_count: 380, is_verified: false, biography: `${cap(t)} made easy · biz: team@${handle.replace(/\W+/g, "")}.example` } };
    case "tiktok.videos":
      return { output: { videos: many(20, (p, i) => ({ author: { username: handle, followers: 120000 }, created_at: new Date(ago(rand, 30)).toISOString(), description: `${p.first} #${tag}`, duration_s: p.duration, hashtags: [tag], music: { title: `original sound - ${handle}`, original: true }, post_id: `v${i}${Math.floor(rand() * 1e6)}`, stats: { plays: p.views, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves }, url: `https://www.tiktok.com/@${handle}/video/${i}` })) } };
    case "tiktok.comments":
      return { output: { comments: empty ? [] : Array.from({ length: 20 }, (_, i) => ({ text: [`where can I get this?`, `does it work on oily ${t}?`, `the price though 😭`, `tried it, loved it`, `how long did it take?`][i % 5], create_time: sec(ago(rand, 15)), digg_count: logn(rand, 12, 1), user: { unique_id: `viewer${i}` } })), count: 20, has_more: false } };
    case "tiktok.contact":
      return { output: { found: !empty, data: { emails: empty ? [] : [{ email: `team@${handle.replace(/\W+/g, "")}.example`, sourceType: "bio" }], socialLinks: [] } } };
    case "tiktok.trending": {
      const words = [`${t.split(" ")[0]}tok`, `${tag}routine`, "glowup", "minimalroutine", "barrierrepair", "morningreset", "budgetfinds", "skinfasting"];
      return { output: { found: true, data: { items: (empty ? [] : words.slice(0, Math.min(params.limit || 3, 8))).map((h, i) => ({ hashtag: h, rank: i + 1, posts: logn(rand, 18000, 0.8), views: logn(rand, 22000000, 0.8), popularity: Array.from({ length: 7 }, (_, d) => ({ atUtc: sec(NOW() - (6 - d) * 86400000), value: Math.round(i % 2 ? 100 - d * 9 : 30 + d * 11) })), topCreators: [{ handle: HANDLES[i], followers: logn(rand, 90000, 1), countryCode: "US" }] })) } } };
    }
    case "tiktok.music":
      return { data: { music_list: SONGS.map((s, i) => ({ music_info: { id_str: `m${i}`, title: s, author: pick(rand, ["Lumi", "Kade", "Noor", "Vela"]), user_count: logn(rand, 90000, 1), duration: 30 + i * 3, is_commerce_music: i % 3 !== 1 } })) } };
    case "tiktok.ads":
      return { output: { found: true, data: { ads: (empty ? [] : BRANDS.slice(0, 5)).map((b, i) => ({ adId: `ad${i}`, adTitle: `${cap(t)} that actually fits your day`, brandName: b, ctr: Number((0.3 + rand() * 1.4).toFixed(2)), likes: logn(rand, 900, 0.8), durationSeconds: 12 + i * 4, objective: "campaign_objective_conversion" })) } } };

    /* -------------------------------------------------------- YouTube */
    case "youtube.search":
    case "youtube.videos":
      return { output: { videos: many(16, (p, i) => ({ video_id: `yt${i}${Math.floor(rand() * 1e6)}`, title: p.first, author: name === "youtube.videos" ? cap(handle.split(".")[0]) : /^[A-Z][\w]+$/.test(String(params.q || "")) && i < 5 ? params.q : cap(p.handle.split(".")[0]), number_of_views: p.views, video_length: i % 3 ? `${Math.floor(p.duration / 6)}:${String(p.duration % 60).padStart(2, "0")}` : `0:${String(Math.min(59, p.duration)).padStart(2, "0")}`, description: `${cap(t)} explained.`, published_time: `${1 + Math.floor(rand() * 20)} days ago`, channel_id: name === "youtube.videos" ? params.channelId : `UC${p.handle.replace(/\W/g, "")}000000000000000`, type: "NORMAL" })), next_cursor: null } };
    case "youtube.channel":
      return { output: { name: cap(String(params.channelId || handle).replace(/^UC/, "").slice(0, 12)), channel_id: params.channelId || `UC${handle}`, handle: `@${handle}`, description: `${cap(t)} reviews. Business: studio@${handle.replace(/\W+/g, "")}.example`, subscribers: logn(rand, 80000, 1), videos_count: 240, country: "India" } };
    case "youtube.comments":
      return { output: { comments: empty ? [] : Array.from({ length: 18 }, (_, i) => ({ author: { handle: `@viewer${i}`, name: `@viewer${i}` }, likes: logn(rand, 8, 1), published: `${1 + Math.floor(rand() * 9)} days ago`, published_date: null, text: [`Can you review the budget version?`, `I have sensitive ${t}, will this work?`, `Too expensive for students`, `Finally an honest review`, `Which one is better for summer?`, `Where can I buy this?`][i % 6], video_id: params.videoId, url: `https://www.youtube.com/watch?v=${params.videoId}` })) } };
    case "youtube.shorts":
      return { output: { found: true, data: { shorts: many(20, (p, i) => ({ id: `s${i}`, title: p.first, authorHandle: p.handle, channelTitle: cap(p.handle.split(".")[0]), views: (p.views || 1000) * 4, likes: p.likes * 4, comments: p.comments, createdUtc: sec(ago(rand, 14)), durationMs: p.duration * 1000, url: `https://www.youtube.com/shorts/s${i}` })) } } };

    /* -------------------------------------------------------------- X */
    case "x.search": {
      const from = String(params.q || "").match(/from:(\w+)/)?.[1];
      const latest = params.sort === "Latest";
      return {
        output: {
          found: !empty,
          data: {
            items: many(20, (p, i) => {
              const author = from || p.handle.replace(/\./g, "_");
              const long = rand();
              const body = long < 0.35 ? p.first : long < 0.7 ? `${p.first}. Here's what I learned after trying it for a month.` : `${p.first}.\n\nThread: what worked, what didn't, and what I'd do differently next time. Short version: keep it simple, be consistent, and check the ingredients before you buy.`;
              const id = `${2110000000000000000 + Math.floor(rand() * 1e15)}`;
              return { id, url: `https://x.com/${author}/status/${id}`, text: `${body} #${tag}`, createdUtc: sec(ago(rand, latest ? 3 : 6)), authorUsername: author, authorName: cap(author.split("_")[0]), authorFollowers: logn(rand, 8000, 1.2), authorVerified: rand() < 0.1, likeCount: Math.round(p.likes / 3), replyCount: Math.round(p.comments / 2), retweetCount: Math.round(p.shares / 4), quoteCount: 1, bookmarkCount: Math.round(p.saves / 6), viewCount: Math.round(p.likes * 30), media: rand() < 0.3 ? [{ type: rand() < 0.4 ? "video" : "photo", url: null }] : [], lang: "en", isReply: false, inReplyToId: null };
            }),
            nextCursor: empty ? null : cursorFor(params, 3),
          },
        },
      };
    }
    case "x.profile":
      return { output: { username: handle, user_id: `${Math.floor(rand() * 1e12)}`, name: cap(handle.replace(/[._]/g, " ").split(" ")[0]), followers: logn(rand, 24000, 1), following: 400, posts_count: 3200, is_verified: false, description: `${cap(t)} for everyone. Partnerships: hi@${handle.replace(/\W+/g, "")}.example` } };
    case "x.replies":
      return { output: { comments: empty ? [] : Array.from({ length: 14 }, (_, i) => ({ authorHandle: `reader${i}`, authorName: `Reader ${i}`, createdUtc: sec(ago(rand, 3)), id: `r${i}`, likeCount: logn(rand, 3, 1), text: [`@op is this available in India?`, `@op tried it, broke me out`, `@op what's the price?`, `@op so true`, `@op any cheaper option?`][i % 5], url: `https://x.com/reader${i}/status/r${i}` })), next_cursor: null } };

    /* ------------------------------------------------------- LinkedIn */
    case "linkedin.search":
    case "linkedin.companyPosts":
    case "linkedin.userPosts": {
      const page = Number(params.page || 1);
      const company = name === "linkedin.companyPosts";
      const list = empty
        ? []
        : Array.from({ length: name === "linkedin.search" ? 25 : 12 }, (_, i) => {
            const p = makePost(rand, t, i + page * 30, { platform: "linkedin" });
            const author = company ? String(params.url || "").split("/").filter(Boolean).pop() || "acme" : p.handle.replace(/\W+/g, "");
            const words = rand();
            const body = words < 0.3 ? p.first : words < 0.7 ? `${p.first}.\n\nThree things we changed: we listened to customers, we cut the steps in half, and we tested every claim. The result surprised us.` : `${p.first}.\n\n${"We spent a year rebuilding how we think about this category. ".repeat(6)}What would you do differently?`;
            const doc = rand() < 0.2;
            const video = !doc && rand() < 0.15;
            return {
              id: `75${Math.floor(rand() * 1e16)}`,
              linkedinUrl: `https://www.linkedin.com/posts/${author}_${tag}-activity-75${Math.floor(rand() * 1e16)}-x`,
              content: body,
              author: { name: company ? cap(author) : cap(p.handle.split(".")[0]), publicIdentifier: company ? null : author, universalName: company ? author : null, type: company ? "company" : "profile", linkedinUrl: company ? `https://www.linkedin.com/company/${author}` : `https://www.linkedin.com/in/${author}`, info: `${cap(t)} lead` },
              postedAt: { timestamp: ago(rand, params.window === "week" ? 6 : 28), date: null },
              postImages: !doc && !video && rand() < 0.4 ? [{ url: null }] : [],
              document: doc ? { title: `${cap(t)} guide`, totalPageCount: 6 + Math.floor(rand() * 10), coverPages: [] } : undefined,
              postVideo: video ? { url: null } : undefined,
              engagement: { likes: Math.round(p.likes / 2), comments: Math.round(p.comments * 2), shares: Math.round(p.shares / 4) },
            };
          });
      return { elements: list, pagination: { totalElements: empty ? 0 : 90, totalPages: empty ? 0 : 3 }, status: 200 };
    }
    case "linkedin.company":
      return { output: { name: cap(String(params.url || params.handle || "Acme").split("/").filter(Boolean).pop()), description: `We make ${t} simple.`, followers: logn(rand, 30000, 1), employees: "51-200 employees", location: "Mumbai, IN", website: null, linkedin_url: params.url || null } };
    case "linkedin.profile":
      return { output: { name: "Sample Member", headline: `${cap(t)} consultant`, followers: logn(rand, 9000, 1), location: "India", linkedin_url: params.url } };
    case "linkedin.comments":
      return { output: { comments: empty ? [] : Array.from({ length: 10 }, (_, i) => ({ text: [`Great point on ${t}`, `How did you measure it?`, `We saw the same thing`, `What tools did you use?`][i % 4], author: { name: `Member ${i}` }, likes: logn(rand, 4, 1), createdAt: new Date(ago(rand, 10)).toISOString() })) } };
    case "linkedin.ads":
      return { output: { found: true, data: { ads: (empty ? [] : BRANDS.slice(0, 6)).map((b, i) => ({ adType: "Single Image Ad", advertiser: b, advertiserLinkedinPage: `https://www.linkedin.com/company/${i}`, cta: "Learn more", description: `Better ${t} for teams`, destinationUrl: "", headline: `${b}: ${cap(t)} that works`, id: `${1600000000 + i}`, startDate: "", endDate: "", totalImpressions: "", url: `https://www.linkedin.com/ad-library/detail/${i}` })) } } };
    case "people.email":
      return { output: { email: empty ? null : "member@company.example", confidence: 0.9 } };

    /* --------------------------------------------------------- Reddit */
    case "reddit.search": {
      const sub = String(params.q || "").match(/subreddit:(\w+)/)?.[1];
      const titles = [`Is ${t} worth the price?`, `My ${t} routine finally works (photos)`, `Help: ${t} keeps breaking me out`, `Best budget ${t} in India?`, `Honest review after 3 months of ${t}`, `Why does nobody talk about ${t} ingredients?`, `${cap(t)} for oily skin, recommendations?`];
      return {
        output: {
          found: !empty,
          data: {
            posts: empty
              ? []
              : Array.from({ length: 25 }, (_, i) => ({ author: `user${Math.floor(rand() * 9999)}`, authorId: `t2_${i}`, createdUtc: sec(ago(rand, params.timeframe === "week" ? 6 : params.timeframe === "day" ? 0.9 : 29)), id: `1x${Math.floor(rand() * 1e6).toString(36)}`, isArchived: false, isLocked: false, media: [], nsfw: false, numComments: logn(rand, 40, 1), permalink: `/r/${sub || `${tag}addicts`}/comments/1x${i}${Math.floor(rand() * 1e4)}/post/`, score: logn(rand, 150, 1), selftext: rand() < 0.6 ? `I've been trying ${t} for a while and I'm not sure what's working.` : "", subreddit: sub || `${tag}addicts`, title: titles[i % titles.length], url: "" })),
            nextCursor: null,
          },
        },
      };
    }
    case "reddit.comments":
      return { code: 200, data: { postInfoById: { commentForest: { trees: empty ? [] : Array.from({ length: 12 }, (_, i) => ({ depth: 0, childCount: 1, node: { __typename: "Comment", id: `t1_${i}`, createdAt: new Date(ago(rand, 10)).toISOString(), isRemoved: false, score: logn(rand, 20, 1), content: { markdown: [`Patch test first, always.`, `Too expensive for what it is honestly.`, `I wish they made a fragrance free version.`, `Took 6 weeks to see a difference for me.`, `Does anyone know a cheaper alternative?`, `The texture is amazing but it pills under makeup.`][i % 6] }, authorInfo: { name: `redditor${i}` } } })) } } } };

    /* ---------------------------------------------- Facebook, Meta ads */
    case "facebook.posts":
      return { output: { posts: many(10, (p, i) => ({ post_id: `fb${i}`, url: `https://www.facebook.com/${handle}/posts/${i}`, text: p.first, timestamp: sec(ago(rand, 20)), reactions_count: p.likes, comments_count: p.comments, reshare_count: p.shares })) } };
    case "meta.ads":
      return { rows: (empty ? [] : Array.from({ length: 12 }, (_, i) => ({ ad_archive_id: `${1590000000000000 + i}`, ad_url: `https://www.facebook.com/ads/library/?id=${1590000000000000 + i}`, body: `${pick(rand, ["New", "Meet the", "Back in stock:"])} ${t} you'll actually finish. Free shipping this week.`, cta: "Shop now", cta_type: "SHOP_NOW", display_format: pick(rand, ["image", "video", "dpa"]), end_date: null, images: [], is_active: true, link_url: "https://shop.example/", page_id: `${i}`, page_likes: logn(rand, 200000, 1), page_name: params.q && !/\s/.test(params.q) ? cap(params.q) : BRANDS[i % BRANDS.length], platforms: ["facebook", "instagram"], start_date: new Date(ago(rand, 25)).toISOString(), title: `${cap(t)} sale`, videos: [] }))), meta: {}, usage: {} };

    case "meta.pages": {
      const name = String(params.q || "Brand");
      const ig = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return {
        success: true,
        searchResults: empty
          ? []
          : [
              { page_id: "900001", name, likes: logn(rand, 150000, 0.5), verification: "BLUE_VERIFIED", ig_username: ig, ig_followers: logn(rand, 400000, 0.5), category: "Beauty, Cosmetic & Personal Care", page_is_deleted: false },
              // Another business with the same name, as real searches return.
              { page_id: "900002", name, likes: logn(rand, 40000, 0.5), verification: "BLUE_VERIFIED", ig_username: `with${ig}`, ig_followers: 52000, category: "Financial Service", page_is_deleted: false },
            ],
      };
    }
    case "meta.pageAds":
      return { rows: empty ? [] : Array.from({ length: 9 }, (_, i) => ({ ad_archive_id: `${1600000000000000 + i}`, ad_url: `https://www.facebook.com/ads/library/?id=${1600000000000000 + i}`, body: `${pick(rand, ["Say hello to our new", "Back by demand:", "Buy 2, get 1 on our"])} ${t} ${pick(rand, ["serum", "face wash", "sunscreen"])}.`, cta: "Shop now", cta_type: "SHOP_NOW", display_format: pick(rand, ["image", "video"]), end_date: null, images: [], is_active: true, link_url: "https://shop.example/", page_id: String(params.pageId), page_likes: 150000, page_name: "Own Page", platforms: ["facebook", "instagram"], start_date: new Date(ago(rand, 40)).toISOString(), title: `${cap(t)}`, videos: [] })), meta: {}, usage: {} };

    /* ------------------------------------------- reviews and products */
    case "reviews.trustpilot":
      return { rows: empty ? [] : Array.from({ length: 20 }, (_, i) => ({ review_id: `tp${i}`, url: `https://www.trustpilot.com/reviews/tp${i}`, rating: [5, 4, 1, 5, 2, 3, 5, 1][i % 8], title: [`Love it`, `Good but pricey`, `Order never arrived`, `My go-to now`, `Broke me out`, `Okay`, `Best purchase`, `Customer service ignored me`][i % 8], text: [`Works exactly as described for my ${t}.`, `Quality is good but the price went up.`, `Waited three weeks and got nothing.`, `I've repurchased four times.`, `Caused redness on day two.`, `Nothing special.`, `Visible difference in a month.`, `No reply to my emails for 10 days.`][i % 8], date: new Date(ago(rand, 60)).toISOString(), author: `Reviewer ${i}`, author_country: "IN", verified: rand() < 0.6, likes: 0, lang: "en" })), meta: {} };
    case "maps.search":
      return { output: { places: empty ? [] : BRANDS.slice(0, 4).map((b, i) => ({ name: `${b} Store`, place_id: `ChIJ${i}${tag}`, rating: Number((3.6 + rand() * 1.3).toFixed(1)), review_count: logn(rand, 300, 1), address: "Main Road", category: "Store", website: null, url: null })), count: 4 } };
    case "reviews.maps":
      return { rows: empty ? [] : Array.from({ length: 10 }, (_, i) => ({ author: { name: `Visitor ${i}` }, date: new Date(ago(rand, 40)).toISOString(), likes: 0, owner_reply: null, place_id: params.placeId, rating: [5, 4, 2, 5, 1][i % 5], review_id: `g${i}`, text: [`Staff were helpful.`, `Good range, long queue.`, `Billing took forever.`, `Lovely store.`, `Rude staff.`][i % 5], url: null })), meta: {} };
    case "amazon.search":
      return { rows: empty ? [] : Array.from({ length: 8 }, (_, i) => ({ asin: `B0${Math.floor(rand() * 1e8)}`, image: null, price: `₹${199 + i * 100}`, rating: Number((3.8 + rand() * 1.1).toFixed(1)), reviews: logn(rand, 900, 1), sponsored: i < 2, title: `${pick(rand, BRANDS)} ${t} ${pick(rand, ["serum", "cream", "gel", "kit"])}`, url: "" })), meta: {} };
    case "reviews.amazon":
      return { rows: empty ? [] : Array.from({ length: 15 }, (_, i) => ({ rating: [5, 2, 4, 1, 5][i % 5], title: [`Great`, `Not for me`, `Good value`, `Fake product`, `Repurchasing`][i % 5], text: [`Worked well.`, `Smells strong.`, `Decent for the price.`, `Seal was broken.`, `Third bottle.`][i % 5], date: new Date(ago(rand, 90)).toISOString(), author: `Buyer ${i}`, verified: true })), meta: {} };

    /* --------------------------------------------------------- creators */
    case "creators.search":
      return { accounts: (empty ? [] : HANDLES.slice(0, Math.min(params.limit || 20, 16))).map((h) => ({ user_id: `uc_${h.length}`, profile: { username: h, full_name: cap(h.split(".")[0]), followers: logn(rand, 42000, 0.9), engagement_percent: Number((1.2 + rand() * 5).toFixed(2)), picture: null, biography: `${cap(t)} creator: skincare tips and honest reviews` } })), total: 16, limit: params.limit || 20 };

    default:
      return { output: {} };
  }
}
