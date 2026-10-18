// The stand-in data source (HUESY_AI_MOCK=1): realistic answers in each
// provider's own raw shape, so the converters, stats and screens run exactly
// as they do on real data, at no cost.
//
// Every account and post here is invented. The numbers are seeded from the
// request, so the same question gives the same answer and tests stay stable.
// Some hooks are built to win (before/after, questions, numbered lists, POV),
// which gives the analysis a real pattern to find.
//
// QA hooks in a query or tag: "#empty" returns nothing, "#fail" fails,
// "#slow" takes longer.

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
const logn = (rand, mid, spread = 1) => Math.round(mid * Math.exp((rand() + rand() + rand() - 1.5) * spread));
const NOW = () => Date.now();
const daysAgo = (rand, max = 28) => NOW() - Math.floor(rand() * max * 86400000) - 3600000;

const topicOf = (params) =>
  String(params.tag || params.q || params.query || params.handle || params.keywords?.[0] || "your niche")
    .replace(/[#@]/g, "")
    .replace(/(empty|fail|slow)/gi, "")
    .trim() || "your niche";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Hook templates and how much each tends to beat a typical post.
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

const HANDLES = ["glowlab.daily", "dewdrop.notes", "theroutine.club", "brightside.co", "fieldnotes.studio", "moss.and.mint", "honest.shelf", "aurora.make", "kindskin.lab", "northwake.co", "petal.theory", "solenne.studio", "tidy.ritual", "bloom.method", "cedar.and.salt", "lumen.kitchen"];

function makePost(rand, t, i, { platform, format }) {
  // Real niches cluster around a few openings: the first few kinds are much
  // more common, as they would be in a real sample.
  const [hook, lift, write] = MOCK_HOOKS[Math.min(MOCK_HOOKS.length - 1, Math.floor(Math.pow(rand(), 1.6) * MOCK_HOOKS.length))];
  const handle = HANDLES[(i * 7 + Math.floor(rand() * 5)) % HANDLES.length];
  const base = platform === "tiktok" ? 42000 : platform === "youtube" ? 26000 : format === "reel" ? 18000 : 0;
  const views = base ? logn(rand, base * lift, 0.9) : null;
  const likes = logn(rand, (views ? views * 0.045 : 900 * lift), 0.6);
  const caption = `${write(t)} ${pick(rand, ["✨", "👇", "🧴", "", "💡"])}\n\n#${t.replace(/\s+/g, "")} #${pick(rand, ["routine", "tips", "daily", "selfcare", "howto"])} #${pick(rand, ["fyp", "explore", "trending", "creator"])}`;
  return { hook, handle, views, likes, comments: Math.round(likes * (0.02 + rand() * 0.04)), shares: Math.round(likes * (0.03 + rand() * 0.05)), saves: Math.round(likes * (0.05 + rand() * 0.12)), caption, posted: daysAgo(rand), duration: Math.round(8 + rand() * 50) };
}

const posts = (rand, t, n, opts) => Array.from({ length: n }, (_, i) => makePost(rand, t, i, opts));

const SONGS = ["Golden Hour Loop", "Soft Focus", "Paper Planes Remix", "Late Night Glow", "Sunday Reset", "Little Wins", "Bright Again", "Slow Morning"];

export async function mockRaw(name, params = {}) {
  const probe = JSON.stringify(params);
  if (probe.includes("#slow")) await delay(2500);
  else await delay(120 + Math.floor(Math.random() * 180));
  if (probe.includes("#fail")) throw fail("data_unavailable", 503);
  const empty = probe.includes("#empty");
  const rand = seeded(`${name}|${probe}`);
  const t = topicOf(params);
  const handle = params.handle || pick(rand, HANDLES);

  switch (name) {
    case "instagram.hashtag":
    case "instagram.posts": {
      const n = empty ? 0 : name === "instagram.posts" ? 12 : 50;
      return {
        output: {
          posts: posts(rand, t, n, { platform: "instagram" }).map((p, i) => {
            const roll = rand();
            const kind = roll < 0.45 ? "clips" : roll < 0.75 ? "carousel" : "image";
            return {
              id: `ig${Math.floor(rand() * 1e12)}`,
              shortcode: `M${i}${Math.floor(rand() * 1e6).toString(36)}`,
              url: `https://www.instagram.com/p/M${i}${Math.floor(rand() * 1e6).toString(36)}/`,
              caption: p.caption,
              product_type: kind === "clips" ? "clips" : "feed",
              __typename: kind === "carousel" ? "XDTGraphSidecar" : kind === "clips" ? "XDTGraphVideo" : "XDTGraphImage",
              is_video: kind === "clips",
              video_view_count: kind === "clips" ? Math.max(400, Math.round((p.views || 0) || p.likes * 22)) : null,
              video_duration: kind === "clips" ? p.duration : null,
              like_count: p.likes,
              comment_count: p.comments,
              taken_at: new Date(p.posted).toISOString(),
              owner: { username: name === "instagram.posts" ? handle : p.handle, full_name: cap(p.handle.split(".")[0]) },
              clips_music_attribution_info: kind === "clips" ? { song_name: rand() < 0.5 ? "Original audio" : pick(rand, SONGS), artist_name: p.handle, uses_original_audio: rand() < 0.5 } : null,
              is_paid_partnership: false,
            };
          }),
        },
      };
    }
    case "instagram.reels":
      return { output: { reels: empty ? [] : posts(rand, t, 12, { platform: "instagram", format: "reel" }).map((p, i) => ({ code: `R${i}`, id: `r${i}`, likes: p.likes, comments: p.comments, plays: null, url: `https://www.instagram.com/reel/R${i}${handle.length}/` })) } };
    case "instagram.post":
      return { output: { id: "ig1", shortcode: params.shortcode || "M0", caption: `A sample ${t} post`, likes: logn(rand, 120, 0.6), comments: logn(rand, 9, 0.5), owner_username: handle, video_view_count: logn(rand, 2400, 0.7) } };
    case "instagram.profile":
      return { output: { username: handle, full_name: cap(handle.split(".")[0]), followers: logn(rand, 48000, 1), following: 310, posts_count: logn(rand, 420, 0.5), is_verified: rand() < 0.2, is_private: false, biography: `Making ${t} simple.` } };
    case "instagram.comments":
    case "youtube.comments": {
      const lines = [`Does this work for sensitive ${t}?`, `How long until you saw results?`, `Can you do one for beginners?`, `What order do I use these in?`, `Price is too high for me honestly`, `This finally made ${t} make sense`, `Is it safe every day?`, `Where do I buy this in India?`];
      const list = empty ? [] : Array.from({ length: 16 }, (_, i) => ({ text: lines[i % lines.length], likes: logn(rand, 6, 0.8), user: `fan${i}` }));
      return name === "instagram.comments"
        ? { output: { comments: list.map((c) => ({ text: c.text, comment_like_count: c.likes, created_at: Math.floor(daysAgo(rand) / 1000), user: { username: c.user } })) } }
        : { output: { comments: list.map((c) => ({ text: c.text, likes: c.likes, author: { handle: `@${c.user}` }, published: `${1 + Math.floor(rand() * 9)} days ago` })) } };
    }
    case "instagram.searchUsers":
      return { output: { users: empty ? [] : HANDLES.slice(0, 10).map((h) => ({ username: h, full_name: cap(h.split(".")[0]), follower_count: logn(rand, 30000, 1), url: `https://www.instagram.com/${h}/` })) } };
    case "instagram.similar":
      return { output: { found: true, data: { profiles: empty ? [] : HANDLES.slice(3, 15).map((h) => ({ username: h, displayName: cap(h.split(".")[0]), verified: false })) } } };
    case "instagram.contact":
      return { output: { found: true, data: { email: `hello@${handle.replace(/\W+/g, "")}.example`, phone: null } } };
    case "tiktok.search":
      return {
        output: {
          videos: (empty ? [] : posts(rand, t, 20, { platform: "tiktok" })).map((p, i) => ({
            aweme_info: {
              aweme_id: `7${Math.floor(rand() * 1e17)}`,
              desc: p.caption,
              create_time: Math.floor(p.posted / 1000),
              author: { unique_id: p.handle, nickname: cap(p.handle.split(".")[0]), follower_count: logn(rand, 90000, 1.1) },
              statistics: { play_count: p.views, digg_count: p.likes, comment_count: p.comments, share_count: p.shares, collect_count: p.saves },
              music: { title: rand() < 0.5 ? `original sound - ${p.handle}` : pick(rand, SONGS), author: p.handle },
              video: { duration: p.duration * 1000 },
              text_extra: [{ hashtag_name: t.replace(/\s+/g, "") }, { hashtag_name: "fyp" }],
              share_url: `https://www.tiktok.com/@${p.handle}/video/${i}`,
              is_ads: false,
            },
          })),
        },
      };
    case "tiktok.videos":
      return { output: { videos: (empty ? [] : posts(rand, t, 20, { platform: "tiktok" })).map((p, i) => ({ author: { username: handle, followers: 120000 }, created_at: new Date(p.posted).toISOString(), description: p.caption, duration_s: p.duration, hashtags: [t.replace(/\s+/g, "")], music: { title: `original sound - ${handle}`, original: true }, post_id: `v${i}`, stats: { plays: p.views, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves }, url: `https://www.tiktok.com/@${handle}/video/${i}` })) } };
    case "tiktok.profile":
      return { output: { username: handle, nickname: cap(handle.split(".")[0]), sec_uid: `MS4w${handle.length}`, followers: logn(rand, 120000, 1), following: 210, likes: logn(rand, 2400000, 1), videos_count: 380, is_verified: false, biography: `${cap(t)} made easy` } };
    case "tiktok.trending": {
      const words = [`${t.split(" ")[0]}tok`, `${t.replace(/\s+/g, "")}routine`, "glowup", "minimalroutine", "barrierrepair", "morningreset", "budgetfinds", "skinfasting"];
      return { output: { found: true, data: { items: (empty ? [] : words.slice(0, Math.min(params.limit || 3, 8))).map((h, i) => ({ hashtag: h, rank: i + 1, posts: logn(rand, 18000, 0.8), views: logn(rand, 22000000, 0.8), popularity: Array.from({ length: 7 }, (_, d) => ({ atUtc: Math.floor((NOW() - (6 - d) * 86400000) / 1000), value: Math.round(i % 2 ? 100 - d * 9 : 30 + d * 11) })), topCreators: [{ handle: HANDLES[i], followers: logn(rand, 90000, 1), countryCode: "US" }] })) } } };
    }
    case "tiktok.music":
      return { data: { music_list: SONGS.map((s, i) => ({ music_info: { id_str: `m${i}`, title: s, author: pick(rand, ["Lumi", "Kade", "Noor", "Vela"]), user_count: logn(rand, 90000, 1), duration: 30 + i * 3, is_commerce_music: i % 3 !== 1 } })) } };
    case "tiktok.ads":
      return { output: { found: true, data: { ads: (empty ? [] : HANDLES.slice(0, 5)).map((h, i) => ({ adId: `ad${i}`, adTitle: `${cap(t)} that actually fits your day`, brandName: cap(h.split(".")[0]), ctr: Number((0.3 + rand() * 1.4).toFixed(2)), likes: logn(rand, 900, 0.8), durationSeconds: 12 + i * 4, objective: "campaign_objective_conversion" })) } } };
    case "youtube.search":
      return { output: { videos: (empty ? [] : posts(rand, t, 16, { platform: "youtube" })).map((p, i) => ({ video_id: `yt${i}${Math.floor(rand() * 1e6)}`, title: p.caption.split("\n")[0], author: cap(p.handle.split(".")[0]), number_of_views: p.views, video_length: i % 3 ? `${Math.floor(p.duration / 6)}:${String(p.duration % 60).padStart(2, "0")}` : `0:${String(Math.min(59, p.duration)).padStart(2, "0")}`, published_time: `${1 + Math.floor(rand() * 20)} days ago`, channel_id: `UC${p.handle}` })) } };
    case "youtube.shorts":
      return { output: { found: true, data: { shorts: posts(rand, t, 20, { platform: "youtube" }).map((p, i) => ({ id: `s${i}`, title: p.caption.split("\n")[0], authorHandle: p.handle, channelTitle: cap(p.handle.split(".")[0]), views: p.views * 4, likes: p.likes * 4, comments: p.comments, createdUtc: Math.floor(p.posted / 1000), durationMs: p.duration * 1000, url: `https://www.youtube.com/shorts/s${i}` })) } } };
    case "x.search":
      return { output: { posts: (empty ? [] : posts(rand, t, 20, { platform: "x" })).map((p, i) => ({ id: `x${i}`, text: p.caption.split("\n")[0], url: `https://x.com/${p.handle}/status/${i}`, authorUsername: p.handle, authorName: cap(p.handle.split(".")[0]), authorFollowers: logn(rand, 8000, 1), createdUtc: Math.floor(p.posted / 1000), likeCount: Math.round(p.likes / 6), replyCount: Math.round(p.comments / 3), retweetCount: Math.round(p.shares / 5), quoteCount: 1, bookmarkCount: Math.round(p.saves / 6), viewCount: Math.round(p.likes * 40), media: [] })) } };
    case "linkedin.search":
      return { output: { found: true, data: { posts: (empty ? [] : posts(rand, t, 10, { platform: "linkedin" })).map((p, i) => ({ id: `li${i}`, text: p.caption.split("\n")[0], url: `https://www.linkedin.com/posts/${p.handle}-${i}`, authorName: cap(p.handle.split(".")[0]), authorUrl: `https://www.linkedin.com/in/${p.handle.replace(/\W+/g, "")}`, createdUtc: Math.floor(p.posted / 1000), reactionCount: Math.round(p.likes / 8), commentCount: Math.round(p.comments / 2) })) } } };
    case "google.trends": {
      const kws = (params.keywords || [t]).slice(0, 5);
      return { output: { series: [{ keywords: kws, averages: kws.map(() => 40), data: Array.from({ length: 52 }, (_, w) => ({ date_from: new Date(NOW() - (51 - w) * 7 * 86400000).toISOString().slice(0, 10), values: kws.map((_, k) => Math.max(5, Math.round((k === 0 ? 30 + w * 0.9 : 55 - w * 0.4) + (rand() - 0.5) * 8))) })) }] } };
    }
    case "google.news":
      return { output: { results: (empty ? [] : HANDLES.slice(0, 8)).map((h, i) => ({ title: `${cap(h.split(".")[0])} ${pick(rand, ["launches", "teams up on", "expands"])} a new ${t} line`, url: `https://news.example.com/${h}-${i}`, source: pick(rand, ["Daily Brief", "Trade Weekly", "Market Wire"]), snippet: `The ${t} brand announced the move this week.`, createdUtc: Math.floor(daysAgo(rand, 9) / 1000) })), count: 8 } };
    case "reddit.search":
      return { posts: (empty ? [] : Array.from({ length: 8 }, (_, i) => ({ title: [`Is ${t} worth it?`, `My ${t} routine finally works`, `Help: ${t} keeps failing`, `Best budget ${t}?`][i % 4], selftext: "", subreddit: `${t.split(" ")[0]}addicts`, score: logn(rand, 300, 1), num_comments: logn(rand, 60, 0.8), permalink: `/r/x/comments/${i}`, created_at_iso: new Date(daysAgo(rand, 60)).toISOString() }))) };
    case "pinterest.search":
      return { pins: (empty ? [] : Array.from({ length: 10 }, (_, i) => ({ url: `https://www.pinterest.com/pin/${i}`, title: `${cap(t)} idea ${i + 1}`, description: `${cap(t)} inspiration`, is_promoted: false }))) };
    case "creators.search":
      return { output: { accounts: (empty ? [] : HANDLES.slice(0, Math.min(params.limit || 30, 16))).map((h) => ({ profile: { username: h, full_name: cap(h.split(".")[0]), followers: logn(rand, 42000, 0.9), engagement_percent: Number((1.2 + rand() * 5).toFixed(2)), location: "India", biography: `${cap(t)} creator · tips and honest reviews`, picture: null } })) } };
    default:
      return { output: {} };
  }
}
