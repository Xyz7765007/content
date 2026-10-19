import { lengthOf, slotOf, WEEKDAYS } from "./taxonomy";

// The numbers behind every claim Huesy makes. Computed here, never estimated by
// a model: a model only ever reads these results.
//
// engagement   likes + comments + shares + saves
// er           engagement / views, or / followers when a platform hides views
// velocity     views per day since posting
// beat         how far a post beat its account's normal: its views (or likes)
//              over that account's median. The core "proven" signal.
// lift         the same against the sample instead of the account, used when
//              the account's normal isn't known: per follower where the
//              account's size is known, otherwise against the format's
//              typical post. Both are capped at 10x.

const DAY = 86400000;

export const median = (values) => {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

export const quantile = (values, q) => {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
};

const sum = (...xs) => {
  const real = xs.filter((x) => Number.isFinite(x));
  return real.length ? real.reduce((a, b) => a + b, 0) : null;
};

const round = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

// Posts younger than this haven't finished getting their views yet, so they
// stay out of baselines and patterns (they can still be shown as fresh posts).
export const SETTLE_DAYS = 2;
// One viral post can't stand for a pattern: no post counts above this.
export const MAX_STRENGTH = 10;
// How strongly small groups are pulled towards "typical" when ranking them.
const SHRINK = 8;

const cap = (x) => (Number.isFinite(x) ? Math.min(MAX_STRENGTH, x) : x);

// Adds the computed fields to each post. `baselines` maps "platform:handle" to
// { views, likes } medians for that account, when known.
export function enrich(posts, { now = Date.now(), baselines = {}, tzOffsetMin = null } = {}) {
  const list = posts.map((p) => {
    const m = p.metrics || {};
    const engagement = sum(m.likes, m.comments, m.shares, m.saves);
    const followers = p.author?.followers;
    const er = engagement == null ? null : m.views ? engagement / m.views : followers ? engagement / followers : null;
    const posted = p.postedAt ? new Date(p.postedAt).getTime() : null;
    const ageDays = posted ? Math.max(0.25, (now - posted) / DAY) : null;
    // Local posting time, when the market's time zone is known.
    const local = posted != null && tzOffsetMin != null ? new Date(posted + tzOffsetMin * 60000) : null;
    const base = baselines[`${p.platform}:${p.author?.handle}`];
    const beat = base
      ? m.views && base.views
        ? m.views / base.views
        : m.likes && base.likes
          ? m.likes / base.likes
          : null
      : null;
    return {
      ...p,
      calc: {
        engagement,
        er: round(er, 4),
        ageDays: round(ageDays, 1),
        velocity: m.views && ageDays ? Math.round(m.views / ageDays) : null,
        // Engagement a day: how fast a post is moving, for "what's hot now".
        heat: engagement != null && ageDays ? Math.round(engagement / ageDays) : null,
        beat: round(cap(beat), 2),
        length: lengthOf(p),
        slot: local ? slotOf(local.getUTCHours()) : null,
        weekday: local ? WEEKDAYS[local.getUTCDay()] : null,
        settled: ageDays == null || ageDays >= SETTLE_DAYS,
      },
    };
  });
  // Lift against the sample, per format. Where the account's size is known,
  // reach is measured per follower, so a big account's ordinary post doesn't
  // read as a winning pattern; otherwise on views, then likes. Each against
  // the median of settled posts of the same format.
  const byFormat = new Map();
  for (const p of list) {
    const key = p.format;
    if (!byFormat.has(key)) byFormat.set(key, []);
    byFormat.get(key).push(p);
  }
  const perFollower = (p) => {
    const f = p.author?.followers;
    const v = p.metrics.views ?? p.metrics.likes;
    return f && v != null ? v / f : null;
  };
  for (const group of byFormat.values()) {
    const settled = group.filter((p) => p.calc.settled);
    const ref = settled.length >= 3 ? settled : group;
    const midRatio = median(ref.map(perFollower));
    const midViews = median(ref.map((p) => p.metrics.views));
    const midLikes = median(ref.map((p) => p.metrics.likes));
    for (const p of group) {
      const m = p.metrics;
      const ratio = perFollower(p);
      const lift =
        ratio != null && midRatio
          ? ratio / midRatio
          : m.views && midViews
            ? m.views / midViews
            : m.likes && midLikes
              ? m.likes / midLikes
              : null;
      p.calc.lift = round(cap(lift), 2);
      p.calc.liftBasis = ratio != null && midRatio ? "followers" : m.views && midViews ? "views" : m.likes && midLikes ? "likes" : null;
    }
  }
  return list;
}

// The account's normal, from its own settled recent posts.
export function baselineFor(posts) {
  const settled = posts.filter((p) => !p.postedAt || Date.now() - new Date(p.postedAt).getTime() >= SETTLE_DAYS * DAY);
  const use = settled.length >= 3 ? settled : posts;
  return { views: median(use.map((p) => p.metrics?.views)), likes: median(use.map((p) => p.metrics?.likes)) };
}

// The strength of a post: beat when known, otherwise lift.
export const strength = (p) => p.calc?.beat ?? p.calc?.lift ?? null;

const authorOf = (p) => `${p.platform}:${String(p.author?.handle || p.id || "").toLowerCase()}`;

// The lower bound of a share at about 80% confidence (Wilson), so "9 of 10
// beat the norm" from ten accounts counts for more than "2 of 2".
export function wilsonLow(hits, n, z = 1.28) {
  if (!n) return null;
  const phat = hits / n;
  const denom = 1 + (z * z) / n;
  const centre = phat + (z * z) / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);
  return Math.max(0, (centre - margin) / denom);
}

// Groups posts and measures each group. Every account counts once (its own
// median within the group), so one prolific or viral account can't make a
// pattern. Only settled posts are measured.
//   n        posts in the group;  authors  distinct accounts
//   medianStrength  the median of each account's strength
//   consistency     share of accounts beating the sample's typical post
//   consistencyLow  the cautious lower bound of that share
//   score    strength pulled towards typical for small groups: how groups rank
export function groupStats(posts, keyOf, { min = 1 } = {}) {
  const usable = posts.filter((p) => p.calc?.settled !== false);
  const groups = new Map();
  for (const p of usable) {
    const key = keyOf(p);
    if (key == null || key === "") continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const total = usable.length || 1;
  const sampleMid = median(usable.map(strength));
  return [...groups.entries()]
    .map(([key, list]) => {
      const byAuthor = new Map();
      for (const p of list) {
        const a = authorOf(p);
        if (!byAuthor.has(a)) byAuthor.set(a, []);
        byAuthor.get(a).push(strength(p));
      }
      const perAuthor = [...byAuthor.values()].map((v) => median(v)).filter((x) => Number.isFinite(x));
      const authors = byAuthor.size;
      const mid = median(perAuthor);
      const hits = sampleMid ? perAuthor.filter((x) => x > sampleMid).length : null;
      return {
        key,
        n: list.length,
        authors,
        share: round(list.length / total, 3),
        medianViews: median(list.map((p) => p.metrics.views)),
        medianLikes: median(list.map((p) => p.metrics.likes)),
        medianEr: round(median(list.map((p) => p.calc.er)), 4),
        p75Er: round(quantile(list.map((p) => p.calc.er), 0.75), 4),
        medianStrength: round(mid, 2),
        consistency: hits == null || !perAuthor.length ? null : round(hits / perAuthor.length, 2),
        consistencyLow: hits == null || !perAuthor.length ? null : round(wilsonLow(hits, perAuthor.length), 2),
        score: Number.isFinite(mid) ? round((authors * mid + SHRINK) / (authors + SHRINK), 3) : null,
      };
    })
    .filter((g) => g.authors >= min)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.authors - a.authors);
}

const pctl = (x) => (x == null ? null : Math.round(x * 1000) / 10);

export function summarize(posts, { top = 8 } = {}) {
  const dated = posts.filter((p) => p.postedAt).map((p) => new Date(p.postedAt).getTime());
  const windowDays = dated.length ? Math.max(1, Math.round((Math.max(...dated) - Math.min(...dated)) / DAY)) : null;
  return {
    n: posts.length,
    windowDays,
    newest: dated.length ? new Date(Math.max(...dated)).toISOString() : null,
    medianViews: median(posts.map((p) => p.metrics.views)),
    medianLikes: median(posts.map((p) => p.metrics.likes)),
    medianErPct: pctl(median(posts.map((p) => p.calc.er))),
    formats: groupStats(posts, (p) => p.format),
    hooks: groupStats(posts, (p) => p.tags?.hook, { min: 2 }),
    angles: groupStats(posts, (p) => p.tags?.angle, { min: 2 }),
    lengths: groupStats(posts, (p) => p.calc.length, { min: 2 }),
    times: groupStats(posts, (p) => p.calc.slot, { min: 2 }),
    weekdays: groupStats(posts, (p) => p.calc.weekday, { min: 2 }),
    ctas: groupStats(posts, (p) => (p.tags?.cta && p.tags.cta !== "none" ? p.tags.cta : null), { min: 2 }),
    sounds: groupStats(posts, (p) => (p.sound && !p.sound.original ? p.sound.title : null), { min: 2 }).slice(0, 5),
    hashtags: topHashtags(posts),
    top: [...posts]
      .filter((p) => strength(p) != null && p.calc?.settled !== false && (p.tags?.relevance ?? 3) >= 3)
      .sort((a, b) => strength(b) - strength(a))
      .slice(0, top),
  };
}

export function topHashtags(posts, limit = 12) {
  const counts = new Map();
  for (const p of posts) for (const t of p.hashtags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, n]) => ({ tag, n }));
}

// Google Trends: the last 4 weeks against the 12 before, per keyword.
export function trendGrowth(trends) {
  if (!trends?.points?.length) return [];
  return trends.keywords.map((keyword, i) => {
    const series = trends.points.map((p) => Number(p.values?.[i]) || 0);
    const recent = series.slice(-4);
    const prior = series.slice(-16, -4);
    const r = recent.reduce((a, b) => a + b, 0) / (recent.length || 1);
    const p = prior.reduce((a, b) => a + b, 0) / (prior.length || 1);
    return {
      keyword,
      recent: Math.round(r),
      prior: Math.round(p),
      growthPct: p ? Math.round(((r - p) / p) * 100) : null,
      peak: Math.max(...series),
    };
  });
}

// TikTok's hashtag popularity curve: the newest three points against the first three.
export function curveGrowth(curve) {
  const v = (curve || []).map((p) => p.value).filter((x) => Number.isFinite(x));
  if (v.length < 4) return null;
  const head = v.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const tail = v.slice(-3).reduce((a, b) => a + b, 0) / 3;
  return head ? Math.round(((tail - head) / head) * 100) : null;
}

// How often an account posts, from its own dated posts.
export function cadence(posts) {
  const t = posts.filter((p) => p.postedAt).map((p) => new Date(p.postedAt).getTime()).sort((a, b) => a - b);
  if (t.length < 2) return null;
  const spanDays = Math.max(1, (t[t.length - 1] - t[0]) / DAY);
  return { perWeek: round((t.length / spanDays) * 7, 1), spanDays: Math.round(spanDays), posts: t.length };
}

// Compact rows a model can read cheaply.
export function rows(posts, limit = 20) {
  return posts.slice(0, limit).map((p) => ({
    platform: p.platform,
    format: p.format,
    handle: p.author?.handle,
    name: p.author?.name || null,
    followers: p.author?.followers ?? null,
    where: p.where || null,
    url: p.url,
    caption: (p.caption || "").replace(/\s+/g, " ").slice(0, 180),
    views: p.metrics.views,
    likes: p.metrics.likes,
    comments: p.metrics.comments,
    erPct: p.calc?.er != null ? Math.round(p.calc.er * 1000) / 10 : null,
    beat: p.calc?.beat ?? null,
    lift: p.calc?.lift ?? null,
    ageDays: p.calc?.ageDays ?? null,
    heat: p.calc?.heat ?? null,
    length: p.calc?.length ?? null,
    hook: p.tags?.hook ?? null,
    cta: p.tags?.cta && p.tags.cta !== "none" ? p.tags.cta : null,
    angle: p.tags?.angle ?? null,
    topic: p.tags?.topic ?? null,
    sound: p.sound && !p.sound.original ? p.sound.title : null,
    thumbnail: p.thumbnail || null,
    postedAt: p.postedAt || null,
  }));
}
