// Which posts the weekly briefing may call standouts. A standout clearly beats
// a typical post, and "typical" only means something once the week has enough
// posts behind it. A thin week shows its recent posts with no comparison.
// Shared by the server and Today, so briefings saved before this rule read
// the same way.

export const STANDOUT_LIFT = 1.2;
export const STANDOUT_MIN_POSTS = 10;

export function standouts(body) {
  const posts = body?.evidence || [];
  const thin = body?.thin ?? (body?.posts || 0) < STANDOUT_MIN_POSTS;
  if (thin) return { thin, title: "Recent posts in your niche", posts: posts.slice(0, 3).map((p) => ({ ...p, lift: null, beat: null })) };
  return { thin, title: "Standouts this week", posts: posts.filter((p) => (p.beat ?? p.lift ?? 0) >= STANDOUT_LIFT).slice(0, 3) };
}
