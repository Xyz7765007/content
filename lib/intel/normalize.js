// Every source's answer turned into a few shapes, so the stats, the tagger,
// the agents and the screens never care where something came from. Each
// parser was written against a real reply (18-19 Oct 2026) and is checked
// against those shapes in scripts/qa/logic/parsers.test.mjs.
//
// Providers wrap replies differently: { output: { data: {...} } },
// { output: {...} }, or top-level { rows }, { elements }, { data }. `box`
// finds the list wherever it sits.
//
// post     { kind, platform, id, url, author{handle,name,followers,verified,url},
//            caption, hashtags, format, postedAt, durationS, slides, sound,
//            metrics{views,likes,comments,shares,saves}, paid, thumbnail, lang }
// profile  { kind, platform, handle, name, bio, followers, following, posts,
//            verified, url, website, category, avatar, secUid, channelId }
// comment  { kind, platform, text, likes, author, postedAt, url, on }
// review   { kind, source, rating, title, text, postedAt, author, country, url, on }
// article  { kind, title, url, source, snippet, postedAt, image }
// ad       { kind, platform, advertiser, text, title, cta, link, startedAt,
//            endedAt, active, impressions, url, format, image }
// format   reel | carousel | image | video | short | text | link

const num = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().toLowerCase().replace(/,/g, "");
  const m = s.match(/^([\d.]+)\s*([kmb])?/);
  if (!m) return null;
  const n = Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1);
  return Number.isFinite(n) ? n : null;
};

const iso = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (/^\d{9,13}$/.test(String(v))) return iso(Number(v));
  // A date with no time ("23 Jun 2026") is that day in UTC, not in the server's zone.
  const dateOnly = typeof v === "string" && !/\d:\d/.test(v) && !/T\d/.test(v) && /\d{4}/.test(v);
  const d = dateOnly ? new Date(`${v} UTC`) : new Date(v);
  if (dateOnly && Number.isNaN(d.getTime())) {
    const plain = new Date(v);
    return Number.isNaN(plain.getTime()) ? fromRelative(v) : plain.toISOString();
  }
  return Number.isNaN(d.getTime()) ? fromRelative(v) : d.toISOString();
};

// "3 days ago", "2 weeks ago", "Streamed 5 hours ago", "9h"
const fromRelative = (text, now = Date.now()) => {
  const s = String(text || "");
  const m = s.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i) || s.match(/^(\d+)\s*(s|m|h|d|w|mo|y)$/i);
  if (!m) return null;
  const units = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000, s: 1, m: 60, h: 3600, d: 86400, w: 604800, mo: 2592000, y: 31536000 };
  const unit = units[m[2].toLowerCase()];
  return unit ? new Date(now - Number(m[1]) * unit * 1000).toISOString() : null;
};

// "20:38" or "1:02:03" in seconds
const clock = (text) => {
  const parts = String(text || "").split(":").map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((s, p) => s * 60 + p, 0);
};

const tagsFrom = (text) => [...new Set((String(text || "").match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1).toLowerCase()))];
const cleanTags = (list) => [...new Set((Array.isArray(list) ? list : []).map((t) => String(t?.name || t?.hashtag_name || t || "").replace(/^#/, "").toLowerCase()).filter(Boolean))];
const handleOf = (v) => (v ? String(v).replace(/^@/, "").trim() || null : null);
const text = (v, max = 2200) => String(v ?? "").slice(0, max);

// Finds the first array at any of the given paths, in any envelope.
const box = (raw, ...keys) => {
  const roots = [raw?.output?.data, raw?.output, raw?.data, raw];
  for (const key of keys) {
    for (const r of roots) {
      const v = key.split(".").reduce((o, k) => (o == null ? o : o[k]), r);
      if (Array.isArray(v)) return v;
    }
  }
  return [];
};
const one = (raw) => {
  const o = raw?.output?.data ?? raw?.output ?? raw?.data ?? raw;
  return o && typeof o === "object" && !Array.isArray(o) ? o : {};
};

const post = (p) => ({
  kind: "post",
  platform: p.platform,
  id: String(p.id || p.url || ""),
  url: p.url || null,
  author: {
    handle: handleOf(p.author?.handle),
    name: p.author?.name || null,
    followers: num(p.author?.followers),
    verified: Boolean(p.author?.verified),
    url: p.author?.url || null,
  },
  caption: text(p.caption),
  hashtags: p.hashtags?.length ? cleanTags(p.hashtags) : tagsFrom(p.caption),
  format: p.format || "video",
  postedAt: p.postedAt || null,
  durationS: num(p.durationS),
  slides: num(p.slides),
  sound: p.sound || null,
  metrics: {
    views: num(p.metrics?.views),
    likes: num(p.metrics?.likes),
    comments: num(p.metrics?.comments),
    shares: num(p.metrics?.shares),
    saves: num(p.metrics?.saves),
  },
  paid: Boolean(p.paid),
  thumbnail: p.thumbnail || null,
  lang: p.lang || null,
  title: p.title || null,
  where: p.where || null,
});

const profile = (p) => ({
  kind: "profile",
  platform: p.platform,
  handle: handleOf(p.handle),
  name: p.name || null,
  bio: p.bio ? text(p.bio, 500) : null,
  followers: num(p.followers),
  following: num(p.following),
  posts: num(p.posts),
  verified: Boolean(p.verified),
  url: p.url || null,
  website: p.website || null,
  category: p.category || null,
  avatar: p.avatar || null,
  location: p.location || null,
  secUid: p.secUid || null,
  channelId: p.channelId || null,
  private: Boolean(p.private),
});

const comment = (c) => ({
  kind: "comment",
  platform: c.platform,
  text: text(c.text, 800),
  likes: num(c.likes) || 0,
  author: handleOf(c.author),
  postedAt: c.postedAt || null,
  url: c.url || null,
  on: c.on || null,
});

const review = (r) => ({
  kind: "review",
  source: r.source,
  rating: num(r.rating),
  title: r.title ? text(r.title, 200) : null,
  text: text(r.text, 1200),
  postedAt: r.postedAt || null,
  author: r.author || null,
  country: r.country || null,
  url: r.url || null,
  on: r.on || null,
});

/* ------------------------------------------------------------ news, web */

export function articles(raw) {
  return box(raw, "items", "results", "articles", "news")
    .map((a) => ({
      kind: "article",
      title: text(a.title, 300),
      url: a.url || a.link || null,
      source: (typeof a.source === "object" ? a.source?.name : a.source) || a.publisher || a.site_name || null,
      snippet: a.snippet ? text(a.snippet, 400) : null,
      postedAt: iso(a.createdUtc ?? a.date ?? a.published_at ?? a.publishedAt ?? a.pubDate),
      image: a.image || a.imageUrl || a.thumbnail || null,
    }))
    .filter((a) => a.title && a.url);
}

export function webResults(raw) {
  return box(raw, "results", "organic", "items").map((r) => ({
    kind: "result",
    title: text(r.title, 300),
    url: r.url || r.link || null,
    snippet: r.snippet || r.description ? text(r.snippet || r.description, 400) : null,
    domain: (() => {
      try {
        return new URL(r.url || r.link).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    })(),
  })).filter((r) => r.url);
}

export function gTrends(raw) {
  const s = box(raw, "series")[0];
  if (!s) return null;
  const keywords = s.keywords || [];
  const points = (s.data || []).map((p) => ({ from: p.date_from, values: p.values || [] }));
  return { keywords, points, averages: s.averages || [] };
}

/* ------------------------------------------------------------- Instagram */

const igFormat = (x) => {
  if (x.product_type === "clips" || x.productType === "clips" || x.kind === "reel" || x.media_type === 2) return "reel";
  if (/Sidecar/i.test(x.__typename || "") || x.kind === "carousel" || x.media_type === 8 || x.carousel_media_count) return "carousel";
  if (x.is_video || x.kind === "video") return "reel";
  return "image";
};

// Hashtag pages and account feeds: Instagram's own post objects.
export function igPosts(raw, handle = null) {
  return box(raw, "posts", "items", "media").map((x) =>
    post({
      platform: "instagram",
      id: x.id || x.pk || x.shortcode || x.code,
      url: x.url || x.permalink || (x.shortcode || x.code ? `https://www.instagram.com/p/${x.shortcode || x.code}/` : null),
      author: {
        handle: x.owner?.username || x.user?.username || (typeof x.owner === "string" ? x.owner : null) || x.username || handle,
        name: x.owner?.full_name || x.user?.full_name,
        followers: x.owner?.follower_count ?? x.owner?.edge_followed_by?.count,
        verified: x.owner?.is_verified ?? x.user?.is_verified,
      },
      caption: typeof x.caption === "object" ? x.caption?.text : x.caption,
      format: igFormat(x),
      postedAt: iso(x.taken_at ?? x.taken_at_timestamp ?? x.timestamp ?? x.createdUtc),
      durationS: x.video_duration ?? x.durationSeconds,
      slides: x.carousel_media_count,
      sound: x.clips_music_attribution_info
        ? {
            title: x.clips_music_attribution_info.song_name,
            author: x.clips_music_attribution_info.artist_name,
            original: Boolean(x.clips_music_attribution_info.uses_original_audio),
          }
        : null,
      metrics: {
        views: x.video_view_count ?? x.play_count ?? x.plays ?? x.view_count ?? x.views,
        likes: x.like_count ?? x.likes ?? x.edge_liked_by?.count,
        comments: x.comment_count ?? (typeof x.comments === "number" ? x.comments : null) ?? x.edge_media_to_comment?.count,
      },
      paid: x.is_paid_partnership || x.is_ad,
      thumbnail: x.thumbnail_src || x.display_url || x.thumbnail_url || x.image || x.thumbnail,
    })
  );
}

export const igUserPosts = igPosts;

// Keyword reel search: flat rows.
export function igReelRows(raw) {
  return box(raw, "reels", "items").map((x) =>
    post({
      platform: "instagram",
      id: x.id || x.shortcode,
      url: x.url || (x.shortcode ? `https://www.instagram.com/reel/${x.shortcode}/` : null),
      author: { handle: x.username, name: x.displayName, verified: x.verified },
      caption: x.caption,
      hashtags: x.hashtags,
      format: "reel",
      postedAt: iso(x.createdUtc),
      durationS: x.durationSeconds,
      sound: x.soundTitle ? { title: x.soundTitle, author: x.soundAuthor, original: /original audio/i.test(x.soundTitle) } : null,
      metrics: { views: x.views, likes: x.likes, comments: x.comments, shares: x.reshares },
      paid: x.paidPartnership,
      thumbnail: x.thumbnail,
    })
  );
}

export function igReels(raw, handle) {
  return box(raw, "reels", "items", "posts").map((x) => {
    const m = x.media || x;
    return post({
      platform: "instagram",
      id: m.id || m.pk || m.code || m.shortcode,
      url: m.url || (m.code || m.shortcode ? `https://www.instagram.com/reel/${m.code || m.shortcode}/` : null),
      author: { handle: m.user?.username || handle },
      caption: typeof m.caption === "object" ? m.caption?.text : m.caption,
      format: "reel",
      postedAt: iso(m.taken_at ?? m.createdUtc ?? m.timestamp),
      durationS: m.video_duration ?? m.durationSeconds,
      metrics: { views: m.play_count ?? m.plays ?? m.views ?? m.view_count, likes: m.like_count ?? m.likes, comments: m.comment_count ?? m.comments },
      thumbnail: m.thumbnail || m.thumbnail_url || m.image_versions2?.candidates?.[0]?.url,
    });
  });
}

export function igProfile(raw) {
  const x = one(raw);
  if (!x.username && !x.full_name) return null;
  return profile({
    platform: "instagram",
    handle: x.username,
    name: x.full_name,
    followers: x.followers ?? x.follower_count,
    following: x.following ?? x.following_count,
    posts: x.posts_count ?? x.media_count,
    verified: x.is_verified,
    bio: x.biography,
    private: x.is_private,
    website: x.external_url,
    category: x.category_name,
    url: x.username ? `https://www.instagram.com/${x.username}/` : null,
  });
}

export function igUsers(raw) {
  return box(raw, "users", "profiles").map((u) =>
    profile({
      platform: "instagram",
      handle: u.username,
      name: u.full_name,
      bio: u.biography,
      followers: u.follower_count,
      following: u.following_count,
      posts: u.media_count,
      verified: u.is_verified,
      category: u.category_name,
      website: u.external_url,
      avatar: u.profile_pic_url,
      private: u.is_private,
      url: u.url || (u.username ? `https://www.instagram.com/${u.username}/` : null),
    })
  ).filter((u) => u.handle && !u.private);
}

export function igSimilar(raw) {
  return box(raw, "profiles", "users").map((u) =>
    profile({
      platform: "instagram",
      handle: u.username || u.handle,
      name: u.displayName || u.full_name,
      verified: u.verified ?? u.is_verified,
      followers: u.followers ?? u.follower_count,
      url: u.username || u.handle ? `https://www.instagram.com/${u.username || u.handle}/` : null,
    })
  ).filter((u) => u.handle);
}

export function igComments(raw, on = {}) {
  return box(raw, "comments").map((c) =>
    comment({
      platform: "instagram",
      text: c.text,
      likes: c.comment_like_count ?? c.likes,
      author: c.user?.username || c.owner?.username || c.username,
      postedAt: iso(c.created_at_utc ?? c.created_at ?? c.createdUtc),
      on: on.url || on.shortcode || null,
    })
  ).filter((c) => c.text);
}

// A creator's published contact details. Emails arrive as strings or as
// { email } objects depending on the platform.
export function contact(raw) {
  const x = one(raw);
  const emails = [...new Set((Array.isArray(x.emails) ? x.emails : [x.email, x.public_email, x.businessEmail]).map((e) => (typeof e === "object" ? e?.email : e)).filter((e) => typeof e === "string" && /@/.test(e)).map((e) => e.trim().toLowerCase()))];
  const phones = [...new Set((Array.isArray(x.phones) ? x.phones : [x.phone, x.public_phone_number]).map((p) => (typeof p === "object" ? p?.phone || p?.number : p)).filter(Boolean))];
  const links = (Array.isArray(x.socialLinks) ? x.socialLinks : []).map((l) => (typeof l === "object" ? l.url : l)).filter(Boolean);
  return {
    email: emails[0] || null,
    emails,
    phone: phones[0] || null,
    website: x.externalUrl || x.external_url || x.website || null,
    links,
    found: Boolean(emails.length || phones.length),
  };
}

/* ---------------------------------------------------------------- TikTok */

const ttFromAweme = (a) =>
  post({
    platform: "tiktok",
    id: a.aweme_id,
    url: a.share_url ? a.share_url.split("?")[0] : a.author?.unique_id ? `https://www.tiktok.com/@${a.author.unique_id}/video/${a.aweme_id}` : null,
    author: { handle: a.author?.unique_id, name: a.author?.nickname, followers: a.author?.follower_count, verified: Boolean(a.author?.custom_verify) },
    caption: a.desc,
    hashtags: (a.text_extra || []).map((t) => t.hashtag_name).filter(Boolean),
    format: "video",
    postedAt: iso(a.create_time),
    durationS: a.video?.duration ? a.video.duration / 1000 : a.duration ? a.duration / 1000 : null,
    sound: a.music ? { title: a.music.title, author: a.music.author, original: /original sound/i.test(a.music.title || "") } : null,
    metrics: {
      views: a.statistics?.play_count,
      likes: a.statistics?.digg_count,
      comments: a.statistics?.comment_count,
      shares: a.statistics?.share_count,
      saves: a.statistics?.collect_count,
    },
    paid: a.is_ads,
    thumbnail: a.video?.cover?.url_list?.[0] || null,
  });

const ttFlat = (v) =>
  post({
    platform: "tiktok",
    id: v.id || v.post_id,
    url: v.url,
    author: {
      handle: typeof v.author === "string" ? v.author : v.author?.username || v.author?.handle,
      name: v.authorName || v.author?.name,
      followers: v.authorFollowers ?? v.author?.followers,
      verified: v.authorVerified,
    },
    caption: v.caption ?? v.description,
    hashtags: v.hashtags,
    format: "video",
    postedAt: iso(v.createdUtc ?? v.created_at),
    durationS: v.durationSeconds ?? v.duration_s,
    sound: v.soundTitle || v.music ? { title: v.soundTitle || v.music?.title, author: v.soundAuthor || v.music?.author, original: /original sound/i.test(v.soundTitle || v.music?.title || "") || Boolean(v.music?.original) } : null,
    metrics: {
      views: v.views ?? v.stats?.plays,
      likes: v.likes ?? v.stats?.likes,
      comments: v.comments ?? v.stats?.comments,
      shares: v.shares ?? v.stats?.shares,
      saves: v.saves ?? v.stats?.saves,
    },
    paid: v.paidPartnership,
    thumbnail: v.image || v.cover || null,
  });

export function ttRows(raw) {
  return box(raw, "videos", "items").map((v) => (v.aweme_info ? ttFromAweme(v.aweme_info) : v.aweme_id ? ttFromAweme(v) : ttFlat(v)));
}
export const ttSearch = ttRows;
export const ttUserVideos = ttRows;

export function ttUsers(raw) {
  return box(raw, "users").map((u) =>
    profile({
      platform: "tiktok",
      handle: u.handle || u.unique_id || u.username,
      name: u.nickname,
      bio: u.bio || u.signature,
      followers: u.followers ?? u.follower_count,
      following: u.following,
      posts: u.videos ?? u.video_count,
      verified: u.verified,
      secUid: u.secUid || u.sec_uid,
      avatar: u.avatarUrl,
      location: u.region,
      url: u.handle || u.unique_id ? `https://www.tiktok.com/@${u.handle || u.unique_id}` : null,
    })
  ).filter((u) => u.handle);
}

export function ttProfile(raw) {
  const x = one(raw);
  if (!x.username && !x.nickname) return null;
  return profile({
    platform: "tiktok",
    handle: x.username,
    name: x.nickname,
    followers: x.followers,
    following: x.following,
    posts: x.videos_count,
    verified: x.is_verified,
    bio: x.biography,
    secUid: x.sec_uid,
    url: x.username ? `https://www.tiktok.com/@${x.username}` : null,
  });
}

export function ttComments(raw, on = {}) {
  return box(raw, "comments").map((c) =>
    comment({
      platform: "tiktok",
      text: c.text,
      likes: c.digg_count ?? c.likes,
      author: c.user?.unique_id || c.user?.nickname || c.author,
      postedAt: iso(c.create_time ?? c.createdUtc),
      on: on.url || on.videoId || null,
    })
  ).filter((c) => c.text);
}

export function ttTrending(raw) {
  return box(raw, "items").map((h) => {
    const curve = (h.popularity || []).map((p) => ({ at: iso(p.atUtc), value: num(p.value) })).filter((p) => p.at);
    return {
      kind: "trend",
      platform: "tiktok",
      tag: String(h.hashtag || "").toLowerCase(),
      rank: num(h.rank),
      posts: num(h.posts),
      views: num(h.views),
      curve,
      creators: (h.topCreators || []).slice(0, 3).map((c) => ({ handle: c.handle, followers: num(c.followers), country: c.countryCode })),
    };
  });
}

export function ttMusic(raw) {
  const list = box(raw, "music_list");
  return list.map((m, i) => {
    const info = m.music_info || m;
    return {
      kind: "sound",
      platform: "tiktok",
      rank: i + 1,
      title: info.title || info.album || null,
      author: info.author || info.owner_nickname || (info.artists || []).map((a) => a.nick_name || a.name).filter(Boolean).join(", ") || null,
      uses: num(info.user_count),
      durationS: num(info.duration),
      // Business accounts can only use sounds cleared for commercial use.
      commercial: Boolean(info.is_commerce_music || info.has_commerce_right),
      id: String(info.id_str || info.id || ""),
    };
  });
}

export function ttAds(raw) {
  return box(raw, "ads").map((a) => ({
    kind: "ad",
    platform: "tiktok",
    id: a.adId,
    advertiser: a.brandName || null,
    title: a.adTitle || "",
    text: a.adTitle || "",
    ctr: num(a.ctr),
    likes: num(a.likes),
    durationS: num(a.durationSeconds),
    objective: String(a.objective || "").replace(/^campaign_objective_/, "").replace(/_/g, " ") || null,
    video: a.videoUrl || null,
    image: a.image || null,
    format: "video",
  }));
}

/* --------------------------------------------------------------- YouTube */

export function ytSearch(raw, now = Date.now()) {
  // Premieres and live streams have no views or date yet.
  return box(raw, "videos", "items")
    .filter((v) => !/upcoming|live/i.test(String(v.video_length || "")) && (v.published_time || v.publishedAt))
    .map((v) => {
      const dur = clock(v.video_length) ?? num(v.durationSeconds);
      return post({
        platform: "youtube",
        id: v.video_id || v.id,
        url: v.video_id ? `https://www.youtube.com/watch?v=${v.video_id}` : v.url,
        author: { handle: v.channel_id || v.channelId, name: v.author || v.channelTitle },
        caption: [v.title, v.description].filter(Boolean).join("\n"),
        title: v.title,
        format: (dur != null && dur <= 60) || /short/i.test(v.type || "") ? "short" : "video",
        postedAt: fromRelative(v.published_time, now) || iso(v.publishedAt),
        durationS: dur,
        metrics: { views: v.number_of_views ?? v.views },
        thumbnail: v.thumbnails?.[0]?.url || v.thumbnail || null,
      });
    });
}

export const ytChannelVideos = (raw, p = {}) => ytSearch(raw).map((v) => ({ ...v, author: { ...v.author, handle: v.author.handle || p.channelId || null } }));

export function ytChannel(raw) {
  const x = one(raw);
  if (!x.name && !x.channel_id) return null;
  return profile({
    platform: "youtube",
    handle: x.handle || x.channel_id,
    name: x.name,
    bio: x.description,
    followers: x.subscribers,
    posts: x.videos_count,
    location: x.country,
    channelId: x.channel_id,
    url: x.handle ? `https://www.youtube.com/${String(x.handle).startsWith("@") ? x.handle : `@${x.handle}`}` : x.channel_id ? `https://www.youtube.com/channel/${x.channel_id}` : null,
  });
}

export function ytShorts(raw) {
  return box(raw, "shorts", "items").map((v) =>
    post({
      platform: "youtube",
      id: v.id,
      url: v.url,
      author: { handle: v.authorHandle, name: v.channelTitle },
      caption: v.title,
      title: v.title,
      format: "short",
      postedAt: iso(v.createdUtc),
      durationS: v.durationMs ? v.durationMs / 1000 : clock(v.duration),
      metrics: { views: v.views, likes: v.likes, comments: v.comments },
      thumbnail: v.image,
    })
  );
}

export function ytComments(raw, on = {}, now = Date.now()) {
  return box(raw, "comments").map((c) =>
    comment({
      platform: "youtube",
      text: c.text,
      likes: c.likes,
      author: c.author?.handle || c.author?.name || (typeof c.author === "string" ? c.author : null),
      postedAt: iso(c.published_date) || fromRelative(c.published, now),
      url: c.url,
      on: on.videoId ? `https://www.youtube.com/watch?v=${on.videoId}` : null,
    })
  ).filter((c) => c.text);
}

/* --------------------------------------------------------------------- X */

const xFlat = (x) =>
  post({
    platform: "x",
    id: x.id,
    url: x.url || (x.authorUsername && x.id ? `https://x.com/${x.authorUsername}/status/${x.id}` : null),
    author: { handle: x.authorUsername || x.authorHandle, name: x.authorName, followers: x.authorFollowers, verified: x.authorVerified, url: x.authorUsername ? `https://x.com/${x.authorUsername}` : null },
    caption: x.text,
    format: (x.media || []).some((m) => /video|gif/i.test(m.type || "")) ? "video" : (x.media || []).length ? "image" : "text",
    postedAt: iso(x.createdUtc ?? x.created_at),
    metrics: { views: x.viewCount, likes: x.likeCount, comments: x.replyCount, shares: (x.retweetCount ?? x.repostCount ?? 0) + (x.quoteCount || 0), saves: x.bookmarkCount },
    thumbnail: (x.media || [])[0]?.url || null,
    lang: x.lang || null,
  });

export function xRows(raw) {
  return box(raw, "items", "posts", "tweets")
    .filter((x) => !x.isReply)
    .map(xFlat);
}
export const xPosts = xRows;

export function xProfile(raw) {
  const x = one(raw);
  if (!x.username) return null;
  return profile({
    platform: "x",
    handle: x.username,
    name: x.name,
    bio: x.description,
    followers: x.followers,
    following: x.following,
    posts: x.posts_count,
    verified: x.is_verified,
    url: `https://x.com/${x.username}`,
  });
}

export function xReplies(raw, on = {}) {
  return box(raw, "comments", "items").map((c) =>
    comment({
      platform: "x",
      text: String(c.text || "").replace(/^(@\w+\s+)+/, ""),
      likes: c.likeCount,
      author: c.authorHandle || c.authorUsername,
      postedAt: iso(c.createdUtc),
      url: c.url,
      on: on.tweetId ? String(on.tweetId) : null,
    })
  ).filter((c) => c.text);
}

/* -------------------------------------------------------------- LinkedIn */

const liFormat = (x) => {
  if (x.document || x.isDocument) return "carousel";
  if (x.postVideo || x.video) return "video";
  if (x.article?.title || x.article?.link) return "link";
  if ((x.postImages || x.images || []).length || x.image) return "image";
  return "text";
};

// Post search, company posts and member posts: Harvest's elements, or flat rows.
export function liElements(raw) {
  return box(raw, "elements", "posts", "items")
    .filter((x) => !x.repostId && !x.repost)
    .map((x) => {
      const a = x.author || {};
      const handle = a.publicIdentifier || a.universalName || String(x.authorUrl || a.linkedinUrl || "").match(/linkedin\.com\/(?:in|company)\/([^/?#]+)/)?.[1] || null;
      return post({
        platform: "linkedin",
        id: x.id || x.urn || x.entityId || x.url,
        url: x.linkedinUrl || x.url || x.shareLinkedinUrl || null,
        author: {
          handle,
          name: a.name || x.authorName || null,
          followers: a.followers ?? x.authorFollowers,
          url: a.linkedinUrl ? String(a.linkedinUrl).split("?")[0] : x.authorUrl || null,
        },
        caption: x.content ?? x.text ?? x.commentary ?? "",
        format: liFormat(x),
        postedAt: iso(x.postedAt?.timestamp ?? x.postedAt?.date ?? x.createdUtc ?? x.publishedAt ?? x.postedAt),
        slides: x.document?.totalPageCount,
        metrics: {
          likes: x.engagement?.likes ?? x.reactionCount ?? x.likeCount ?? x.numLikes,
          comments: x.engagement?.comments ?? x.commentCount ?? x.numComments,
          shares: x.engagement?.shares ?? x.repostCount ?? x.numShares,
        },
        thumbnail: x.postImages?.[0]?.url || x.document?.coverPages?.[0]?.imageUrls?.[0] || null,
        where: a.type === "company" ? "company" : "member",
      });
    });
}
export const liPosts = liElements;

export function liCompany(raw) {
  const x = one(raw);
  if (!x.name) return null;
  return profile({
    platform: "linkedin",
    handle: String(x.linkedin_url || "").match(/company\/([^/?#]+)/)?.[1] || null,
    name: x.name,
    bio: x.description,
    followers: x.followers,
    website: x.website,
    location: x.location,
    category: x.employees || x.industry || null,
    url: x.linkedin_url || null,
  });
}

export function liProfile(raw) {
  const x = one(raw);
  const name = x.name || x.full_name || [x.first_name, x.last_name].filter(Boolean).join(" ");
  if (!name) return null;
  return profile({
    platform: "linkedin",
    handle: x.public_identifier || x.publicIdentifier || String(x.linkedin_url || x.url || "").match(/in\/([^/?#]+)/)?.[1] || null,
    name,
    bio: x.headline || x.summary || x.about,
    followers: x.followers ?? x.follower_count,
    location: x.location,
    url: x.linkedin_url || x.url || null,
  });
}

export function liComments(raw, on = {}) {
  return box(raw, "comments", "elements", "items").map((c) =>
    comment({
      platform: "linkedin",
      text: c.text || c.commentary || c.comment,
      likes: c.likes ?? c.reactions ?? c.engagement?.likes,
      author: c.author?.name || c.authorName || c.actor?.name,
      postedAt: iso(c.createdUtc ?? c.createdAt ?? c.postedAt?.timestamp),
      on: on.postId ? String(on.postId) : null,
    })
  ).filter((c) => c.text);
}

export function liAds(raw) {
  return box(raw, "ads").map((a) => ({
    kind: "ad",
    platform: "linkedin",
    id: a.id,
    advertiser: a.advertiser || null,
    title: a.headline || "",
    text: [a.headline, a.description].filter(Boolean).join(" — "),
    cta: a.cta || null,
    link: a.destinationUrl || null,
    startedAt: iso(a.startDate),
    endedAt: iso(a.endDate),
    impressions: a.totalImpressions || null,
    url: a.url || null,
    format: a.adType || null,
    image: a.advertiserLogo || null,
  }));
}

export function workEmail(raw) {
  const x = one(raw);
  const email = x.email || x.work_email || x.data?.email || null;
  return { email: email || null, emails: email ? [email] : [], found: Boolean(email), confidence: x.confidence ?? x.score ?? null };
}

/* ---------------------------------------------------------------- Reddit */

export function redditRows(raw) {
  return box(raw, "posts", "results").map((x) =>
    post({
      platform: "reddit",
      id: x.id,
      url: x.permalink ? `https://www.reddit.com${x.permalink}` : x.url,
      author: { handle: x.author, name: x.author },
      caption: [x.title, x.selftext].filter(Boolean).join("\n\n"),
      title: x.title,
      format: (x.media || []).some((m) => /video/i.test(m.type || "")) ? "video" : (x.media || []).length ? "image" : x.selftext ? "text" : "link",
      postedAt: iso(x.createdUtc ?? x.created_utc ?? x.created),
      metrics: { likes: x.score ?? x.ups, comments: x.numComments ?? x.num_comments },
      where: x.subreddit ? `r/${x.subreddit}` : null,
    })
  ).filter((p) => p.id && !/^\[deleted\]$/.test(p.caption));
}
export const redditPosts = redditRows;

export function redditComments(raw, on = {}) {
  const trees = raw?.data?.postInfoById?.commentForest?.trees || raw?.output?.data?.postInfoById?.commentForest?.trees || [];
  return trees
    .map((t) => t.node)
    .filter((n) => n && n.__typename === "Comment" && !n.isRemoved)
    .map((n) =>
      comment({
        platform: "reddit",
        text: n.content?.markdown || n.content?.preview,
        likes: n.score ?? n.voteState ?? 0,
        author: n.authorInfo?.name,
        postedAt: iso(n.createdAt),
        on: on.url || on.postId || null,
      })
    )
    .filter((c) => c.text && !/^\[(deleted|removed)\]$/.test(c.text));
}

/* -------------------------------------------------------- Facebook, Meta */

export function fbPosts(raw, p = {}) {
  // A page's own posts: the page is the author.
  const page = String(p.url || "").replace(/^https?:\/\/(www\.)?facebook\.com\//i, "").split(/[/?#]/)[0] || null;
  return box(raw, "posts", "items", "rows").map((x) =>
    post({
      platform: "facebook",
      id: x.post_id || x.id,
      url: x.url || x.post_url || x.permalink,
      author: { handle: x.author?.id || x.page_id || page, name: x.author?.name || x.page_name || page },
      caption: x.text || x.message || x.content,
      format: x.video || x.is_video ? "video" : x.image || (x.images || []).length ? "image" : "text",
      postedAt: iso(x.timestamp ?? x.time ?? x.created_time ?? x.publish_time ?? x.date),
      metrics: { likes: x.reactions_count ?? x.reactions ?? x.likes, comments: x.comments_count ?? x.comments, shares: x.reshare_count ?? x.shares },
      thumbnail: x.image || x.images?.[0] || null,
    })
  ).filter((p) => p.caption || p.url);
}

export function metaAds(raw) {
  return box(raw, "rows", "ads").map((a) => ({
    kind: "ad",
    platform: (a.platforms || []).join(", ") || "facebook",
    id: a.ad_archive_id,
    advertiser: a.page_name || null,
    pageId: a.page_id ? String(a.page_id) : null,
    title: a.title || a.cards?.[0]?.title || "",
    text: text(a.body || a.cards?.[0]?.body || "", 600),
    cta: a.cta || null,
    link: a.link_url || null,
    domain: a.link_caption || null,
    startedAt: iso(a.start_date),
    endedAt: iso(a.end_date),
    active: a.is_active !== false,
    impressions: a.impressions || null,
    url: a.ad_url || null,
    format: (a.videos || []).length ? "video" : a.display_format || "image",
    image: (a.images || [])[0] || a.cards?.[0]?.image || null,
    pageLikes: num(a.page_likes),
    variants: num(a.same_creative_ads),
  }));
}

export function metaPages(raw) {
  return box(raw, "searchResults", "pages")
    .filter((p) => p.page_id && !p.page_is_deleted)
    .map((p) => ({
      kind: "page",
      platform: "facebook",
      id: String(p.page_id),
      name: p.name || "",
      likes: num(p.likes),
      verified: p.verification === "BLUE_VERIFIED",
      instagram: p.ig_username || null,
      igFollowers: num(p.ig_followers),
      category: p.category || null,
    }));
}

/* ---------------------------------------------------- reviews, products */

export function trustpilotReviews(raw, on = {}) {
  return box(raw, "rows", "reviews").map((r) =>
    review({
      source: "Trustpilot",
      rating: r.rating ?? r.stars,
      title: r.title,
      text: r.text,
      postedAt: iso(r.date ?? r.published_at),
      author: r.author,
      country: r.author_country,
      url: r.url,
      on: on.domain || null,
    })
  ).filter((r) => r.text);
}

export function places(raw) {
  return box(raw, "places", "rows", "results").map((p) => ({
    kind: "place",
    name: p.name || p.title,
    placeId: p.place_id || p.placeId || null,
    rating: num(p.rating),
    reviews: num(p.review_count ?? p.reviews),
    address: p.address || null,
    category: p.category || (p.categories || [])[0] || null,
    website: p.website || null,
    url: p.url || null,
  })).filter((p) => p.name);
}

export function mapsReviews(raw, on = {}) {
  return box(raw, "rows", "reviews").map((r) =>
    review({
      source: "Google",
      rating: r.rating,
      text: r.text,
      postedAt: iso(r.date),
      author: r.author?.name || r.author,
      url: r.url,
      on: on.placeId || null,
    })
  ).filter((r) => r.text);
}

export function amazonProducts(raw, p = {}) {
  const domain = String(p.country || "us").toLowerCase() === "in" ? "amazon.in" : String(p.country || "us").toLowerCase() === "gb" ? "amazon.co.uk" : "amazon.com";
  return box(raw, "rows", "products").map((x) => ({
    kind: "product",
    asin: x.asin,
    title: text(x.title, 200),
    price: x.price || null,
    rating: num(x.rating),
    reviews: num(x.reviews),
    sponsored: Boolean(x.sponsored),
    url: x.url || (x.asin ? `https://www.${domain}/dp/${x.asin}` : null),
    image: x.image || null,
  })).filter((x) => x.asin);
}

export function amazonReviews(raw, on = {}) {
  return box(raw, "rows", "reviews").map((r) =>
    review({
      source: "Amazon",
      rating: r.rating ?? r.stars,
      title: r.title,
      text: r.text || r.body,
      postedAt: iso(r.date),
      author: r.author || r.reviewer,
      country: r.country,
      url: r.url,
      on: on.asin || null,
    })
  ).filter((r) => r.text);
}

/* -------------------------------------------------------------- creators */

export function creators(raw, platform) {
  return box(raw, "accounts", "creators", "results").map((c) => {
    const p = c.profile || c;
    const handle = p.username || p.handle || p.screen_name || p.custom_url || null;
    const urls = {
      instagram: (h) => `https://www.instagram.com/${h}/`,
      tiktok: (h) => `https://www.tiktok.com/@${h}`,
      youtube: (h) => `https://www.youtube.com/${String(h).startsWith("@") ? h : `@${h}`}`,
      twitter: (h) => `https://x.com/${h}`,
    };
    return {
      kind: "creator",
      platform: platform === "twitter" ? "x" : platform,
      handle: handleOf(handle),
      name: p.full_name || p.name || null,
      followers: num(p.followers ?? p.follower_count ?? p.number_of_followers ?? p.subscribers),
      engagement: num(p.engagement_percent ?? p.engagement_rate) == null ? null : Math.round(num(p.engagement_percent ?? p.engagement_rate) * 100) / 100,
      avgLikes: num(p.avg_likes ?? p.average_likes),
      location: p.location || p.country || null,
      bio: p.biography || p.bio || p.description || null,
      url: p.url || p.profile_url || (handle ? urls[platform]?.(handleOf(handle)) : null) || null,
      picture: p.picture || p.profile_picture || null,
      source: "index",
    };
  }).filter((c) => c.handle);
}

export const _internal = { num, iso, fromRelative, clock, tagsFrom, box };
