// Every platform's answer turned into the same few shapes, so the stats, the
// tagger and the agent never care where a post came from.
//
// Post: { platform, id, url, author: { handle, name, followers, verified },
//         caption, hashtags, format, postedAt, durationS, sound, metrics:
//         { views, likes, comments, shares, saves }, paid, thumbnail }
// format: reel | carousel | image | video | short | text

const num = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const iso = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// "3 days ago", "2 weeks ago", "Streamed 5 hours ago"
const fromRelative = (text, now = Date.now()) => {
  const m = String(text || "").match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
  if (!m) return null;
  const unit = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 }[m[2].toLowerCase()];
  return new Date(now - Number(m[1]) * unit * 1000).toISOString();
};

// "20:38" or "1:02:03" in seconds
const clock = (text) => {
  const parts = String(text || "").split(":").map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((s, p) => s * 60 + p, 0);
};

const tagsFrom = (text) => [...new Set((String(text || "").match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1).toLowerCase()))];

const post = (p) => ({
  platform: p.platform,
  id: String(p.id || ""),
  url: p.url || null,
  author: {
    handle: p.author?.handle ? String(p.author.handle).replace(/^@/, "") : null,
    name: p.author?.name || null,
    followers: num(p.author?.followers),
    verified: Boolean(p.author?.verified),
  },
  caption: String(p.caption || "").slice(0, 2200),
  hashtags: p.hashtags?.length ? p.hashtags : tagsFrom(p.caption),
  format: p.format || "video",
  postedAt: p.postedAt || null,
  durationS: num(p.durationS),
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
});

const out = (raw) => raw?.output ?? raw?.data ?? raw;

/* ------------------------------------------------------------- Instagram -- */

const igFormat = (x) => {
  if (x.product_type === "clips" || x.kind === "reel" || x.media_type === 2) return "reel";
  if (/Sidecar/i.test(x.__typename || "") || x.kind === "carousel" || x.media_type === 8) return "carousel";
  if (x.is_video || x.kind === "video") return "reel";
  return "image";
};

export function igPosts(raw) {
  const list = out(raw)?.posts || [];
  return list.map((x) =>
    post({
      platform: "instagram",
      id: x.id || x.shortcode || x.code,
      url: x.url || (x.shortcode ? `https://www.instagram.com/p/${x.shortcode}/` : null),
      author: {
        handle: x.owner?.username || (typeof x.owner === "string" ? x.owner : null),
        name: x.owner?.full_name,
        verified: x.owner?.is_verified,
      },
      caption: x.caption,
      format: igFormat(x),
      postedAt: iso(x.taken_at),
      durationS: x.video_duration,
      sound: x.clips_music_attribution_info
        ? {
            title: x.clips_music_attribution_info.song_name,
            author: x.clips_music_attribution_info.artist_name,
            original: Boolean(x.clips_music_attribution_info.uses_original_audio),
          }
        : null,
      metrics: {
        views: x.video_view_count ?? x.play_count ?? x.plays,
        likes: x.like_count ?? x.likes,
        comments: x.comment_count ?? x.comments,
      },
      paid: x.is_paid_partnership || x.is_ad,
      thumbnail: x.thumbnail_src || x.display_url || x.image,
    })
  );
}

export const igUserPosts = igPosts;

export function igReels(raw, handle) {
  const list = out(raw)?.reels || [];
  return list.map((x) =>
    post({
      platform: "instagram",
      id: x.id || x.code,
      url: x.url,
      author: { handle },
      caption: x.caption,
      format: "reel",
      postedAt: iso(x.taken_at),
      metrics: { views: x.plays ?? x.play_count, likes: x.likes, comments: x.comments },
      thumbnail: x.thumbnail,
    })
  );
}

export function igPostDetail(raw) {
  const x = out(raw) || {};
  const one = x.post || x;
  return igPosts({ output: { posts: [one] } })[0] || null;
}

export function igProfile(raw) {
  const x = out(raw) || {};
  return {
    platform: "instagram",
    handle: x.username || null,
    name: x.full_name || null,
    followers: num(x.followers ?? x.follower_count),
    following: num(x.following),
    posts: num(x.posts_count ?? x.media_count),
    verified: Boolean(x.is_verified),
    bio: x.biography || null,
    private: Boolean(x.is_private),
  };
}

export function igUsers(raw) {
  return (out(raw)?.users || []).map((u) => ({
    platform: "instagram",
    handle: u.username,
    name: u.full_name || null,
    followers: num(u.follower_count),
    verified: Boolean(u.is_verified),
    url: u.url || (u.username ? `https://www.instagram.com/${u.username}/` : null),
  }));
}

export function igSimilar(raw) {
  return (out(raw)?.data?.profiles || []).map((u) => ({
    platform: "instagram",
    handle: u.username,
    name: u.displayName || null,
    verified: Boolean(u.verified),
    url: u.username ? `https://www.instagram.com/${u.username}/` : null,
  }));
}

export function igComments(raw) {
  return (out(raw)?.comments || []).map((c) => ({
    platform: "instagram",
    text: String(c.text || "").slice(0, 600),
    likes: num(c.comment_like_count) || 0,
    author: c.user?.username || null,
    postedAt: iso(c.created_at_utc || c.created_at),
  }));
}

export function contact(raw) {
  const x = out(raw)?.data || out(raw) || {};
  return {
    email: x.email || x.public_email || x.businessEmail || null,
    phone: x.phone || x.public_phone_number || null,
    found: Boolean(x.email || x.public_email || x.businessEmail || x.phone),
  };
}

/* ---------------------------------------------------------------- TikTok -- */

const ttFromAweme = (a) =>
  post({
    platform: "tiktok",
    id: a.aweme_id,
    url: a.share_url ? a.share_url.split("?")[0] : a.author?.unique_id ? `https://www.tiktok.com/@${a.author.unique_id}/video/${a.aweme_id}` : null,
    author: { handle: a.author?.unique_id, name: a.author?.nickname, followers: a.author?.follower_count, verified: Boolean(a.author?.custom_verify) },
    caption: a.desc,
    hashtags: (a.text_extra || []).map((t) => t.hashtag_name).filter(Boolean).map((t) => t.toLowerCase()),
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

export function ttSearch(raw) {
  return (out(raw)?.videos || []).map((v) => (v.aweme_info ? ttFromAweme(v.aweme_info) : ttUserVideo(v)));
}

const ttUserVideo = (v) =>
  post({
    platform: "tiktok",
    id: v.post_id || v.id,
    url: v.url,
    author: { handle: v.author?.username, name: v.author?.name, followers: v.author?.followers },
    caption: v.description,
    hashtags: v.hashtags,
    format: "video",
    postedAt: iso(v.created_at),
    durationS: v.duration_s,
    sound: v.music ? { title: v.music.title, author: v.music.author, original: Boolean(v.music.original) } : null,
    metrics: { views: v.stats?.plays, likes: v.stats?.likes, comments: v.stats?.comments, shares: v.stats?.shares, saves: v.stats?.saves },
    thumbnail: v.cover,
  });

export function ttUserVideos(raw) {
  return (out(raw)?.videos || []).map((v) => (v.aweme_info ? ttFromAweme(v.aweme_info) : ttUserVideo(v)));
}

export function ttProfile(raw) {
  const x = out(raw) || {};
  return {
    platform: "tiktok",
    handle: x.username || null,
    name: x.nickname || null,
    followers: num(x.followers),
    following: num(x.following),
    likes: num(x.likes),
    posts: num(x.videos_count),
    verified: Boolean(x.is_verified),
    bio: x.biography || null,
    secUid: x.sec_uid || null,
  };
}

export function ttTrending(raw) {
  return (out(raw)?.data?.items || []).map((h) => {
    const curve = (h.popularity || []).map((p) => ({ at: iso(p.atUtc), value: num(p.value) })).filter((p) => p.at);
    return {
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
  const list = (raw?.data || out(raw))?.music_list || [];
  return list.map((m, i) => {
    const info = m.music_info || m;
    return {
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

export function ttHashtagDetail(raw) {
  const c = (raw?.data || out(raw))?.challengeInfo?.challenge || {};
  return { id: c.id ? String(c.id) : null, tag: c.title || null, views: num(c.stats?.viewCount), videos: num(c.stats?.videoCount) };
}

export function ttHashtagVideos(raw) {
  const d = raw?.data || out(raw) || {};
  return (d.itemList || d.aweme_list || d.items || []).map((v) => (v.aweme_id ? ttFromAweme(v) : ttUserVideo(v)));
}

/* --------------------------------------------------------------- YouTube -- */

export function ytSearch(raw, now = Date.now()) {
  // Premieres and live streams have no views or date yet, so they say nothing
  // about what works.
  return (out(raw)?.videos || []).filter((v) => !/upcoming|live/i.test(String(v.video_length || "")) && v.published_time).map((v) => {
    const dur = clock(v.video_length);
    return post({
      platform: "youtube",
      id: v.video_id,
      url: v.video_id ? `https://www.youtube.com/watch?v=${v.video_id}` : null,
      author: { handle: v.channel_id, name: v.author },
      caption: [v.title, v.description].filter(Boolean).join("\n"),
      format: dur != null && dur <= 60 ? "short" : /short/i.test(v.type || "") ? "short" : "video",
      postedAt: fromRelative(v.published_time, now),
      durationS: dur,
      metrics: { views: v.number_of_views },
      thumbnail: v.thumbnails?.[0]?.url || null,
    });
  });
}

export function ytShorts(raw) {
  return (out(raw)?.data?.shorts || []).map((v) =>
    post({
      platform: "youtube",
      id: v.id,
      url: v.url,
      author: { handle: v.authorHandle, name: v.channelTitle },
      caption: v.title,
      format: "short",
      postedAt: iso(v.createdUtc),
      durationS: v.durationMs ? v.durationMs / 1000 : clock(v.duration),
      metrics: { views: v.views, likes: v.likes, comments: v.comments },
      thumbnail: v.image,
    })
  );
}

export function ytComments(raw, now = Date.now()) {
  return (out(raw)?.comments || []).map((c) => ({
    platform: "youtube",
    text: String(c.text || "").slice(0, 600),
    likes: num(c.likes) || 0,
    author: c.author?.handle || c.author?.name || null,
    postedAt: iso(c.published_date) || fromRelative(c.published, now),
  }));
}

/* --------------------------------------------------------- X and LinkedIn -- */

export function xPosts(raw) {
  return (out(raw)?.posts || []).map((x) =>
    post({
      platform: "x",
      id: x.id,
      url: x.url,
      author: { handle: x.authorUsername, name: x.authorName, followers: x.authorFollowers, verified: x.authorVerified },
      caption: x.text,
      format: (x.media || []).some((m) => /video/i.test(m.type || "")) ? "video" : (x.media || []).length ? "image" : "text",
      postedAt: iso(x.createdUtc),
      metrics: { views: x.viewCount, likes: x.likeCount, comments: x.replyCount, shares: (x.retweetCount || 0) + (x.quoteCount || 0), saves: x.bookmarkCount },
    })
  );
}

export function liPosts(raw) {
  const d = out(raw) || {};
  const list = d.data?.posts || d.posts || d.elements || [];
  return (Array.isArray(list) ? list : []).map((x) =>
    post({
      platform: "linkedin",
      id: x.id || x.urn || x.url,
      url: x.url || x.link,
      author: {
        handle: String(x.authorUrl || "").match(/linkedin\.com\/(?:in|company)\/([^/?#]+)/)?.[1] || null,
        name: x.authorName || x.author?.name || null,
        followers: x.authorFollowers,
      },
      caption: x.text || x.content || "",
      format: x.document || x.isDocument ? "carousel" : x.video ? "video" : x.images?.length || x.image ? "image" : "text",
      postedAt: iso(x.createdUtc || x.postedAt?.timestamp || x.publishedAt),
      metrics: {
        likes: x.reactionCount ?? x.reactions ?? x.likeCount,
        comments: x.commentCount ?? x.comments,
        shares: x.repostCount ?? x.reposts ?? x.shareCount,
      },
    })
  );
}

/* ---------------------------------------------------------------- Google -- */

export function gTrends(raw) {
  const s = out(raw)?.series?.[0];
  if (!s) return null;
  const keywords = s.keywords || [];
  const points = (s.data || []).map((p) => ({ from: p.date_from, values: p.values || [] }));
  return { keywords, points, averages: s.averages || [] };
}

export function gNews(raw) {
  return (out(raw)?.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    source: r.source,
    snippet: r.snippet,
    postedAt: iso(r.createdUtc),
  }));
}

/* --------------------------------------------------------------- Creators -- */

export function creators(raw, platform) {
  const d = out(raw) || {};
  const list = d.accounts || d.results || d.data?.accounts || d.data || d.creators || [];
  return (Array.isArray(list) ? list : []).map((c) => {
    const p = c.profile || c;
    return {
      platform,
      handle: p.username || p.handle || p.screen_name || null,
      name: p.full_name || p.name || null,
      followers: num(p.followers ?? p.follower_count ?? p.number_of_followers),
      engagement: num(p.engagement_percent ?? p.engagement_rate),
      avgLikes: num(p.avg_likes ?? p.average_likes),
      location: p.location || p.country || null,
      bio: p.biography || p.bio || null,
      url: p.url || p.profile_url || null,
      picture: p.picture || p.profile_picture || null,
    };
  });
}

/* --------------------------------------------------------- Reddit, Pinterest */

export function redditPosts(raw) {
  const d = raw?.posts ? raw : out(raw) || {};
  const list = d.posts || d.data?.posts || d.results || [];
  return (Array.isArray(list) ? list : []).map((x) => ({
    platform: "reddit",
    title: x.title || "",
    text: String(x.selftext || x.text || "").slice(0, 800),
    url: x.permalink ? `https://www.reddit.com${x.permalink}` : x.url,
    subreddit: x.subreddit || null,
    score: num(x.score ?? x.ups),
    comments: num(x.num_comments ?? x.comments),
    postedAt: iso(x.created_at_iso || x.created_utc || x.created),
  }));
}

export function pinterestPins(raw) {
  const d = raw?.pins ? raw : out(raw) || {};
  return (d.pins || []).map((x) => ({
    platform: "pinterest",
    title: x.title || x.grid_title || "",
    text: String(x.description || x.seo_alt_text || "").slice(0, 500),
    url: x.url,
    link: x.link || null,
    domain: x.domain || null,
    promoted: Boolean(x.is_promoted),
    image: x.images?.orig?.url || x.images?.["736x"]?.url || null,
    postedAt: iso(x.created_at),
  }));
}

export function ttAds(raw) {
  return (out(raw)?.data?.ads || []).map((a) => ({
    platform: "tiktok",
    id: a.adId,
    title: a.adTitle || "",
    brand: a.brandName || null,
    ctr: num(a.ctr),
    likes: num(a.likes),
    durationS: num(a.durationSeconds),
    objective: String(a.objective || "").replace(/^campaign_objective_/, "").replace(/_/g, " ") || null,
    video: a.videoUrl || null,
    image: a.image || null,
  }));
}

export const _internal = { num, iso, fromRelative, clock, tagsFrom };
