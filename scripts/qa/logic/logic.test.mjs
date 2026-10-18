// Checks the decision logic directly, with no network and no model:
//   node --import ./scripts/qa/logic/hooks.mjs scripts/qa/logic/logic.test.mjs
import assert from "node:assert/strict";
import { enrich, groupStats, wilsonLow, MAX_STRENGTH } from "../../../lib/intel/stats.js";
import { evaluate, proofScore, NEEDS } from "../../../lib/studio/ground.js";
import { topicTerms, overlaps, searchPhrase } from "../../../lib/intel/tools.js";
import { brandContext } from "../../../lib/intel/brand.js";
import { standouts } from "../../../lib/intel/standouts.js";
import { composeBriefing } from "../../../lib/intel/briefing.js";

let passed = 0;
const t = (name, fn) => {
  fn();
  passed += 1;
  console.log(`PASS  ${name}`);
};
const DAY = 86400000;
const post = (handle, views, hook, { followers, days = 5, format = "reel" } = {}) => ({
  platform: "instagram",
  id: `${handle}${views}${Math.random()}`,
  format,
  author: { handle, followers },
  postedAt: new Date(Date.now() - days * DAY).toISOString(),
  metrics: { views, likes: Math.round(views / 20) },
  tags: { hook, relevance: 4 },
});

t("a big account's ordinary post doesn't read as a winner when sizes are known", () => {
  const posts = [post("big", 400000, "pov", { followers: 2000000 }), ...Array.from({ length: 6 }, (_, i) => post(`s${i}`, 8000, "question", { followers: 10000 }))];
  const e = enrich(posts);
  const big = e.find((p) => p.author.handle === "big");
  assert.equal(big.calc.liftBasis, "followers");
  assert.ok(big.calc.lift < 1, `big account lift ${big.calc.lift} should be under typical`);
});

t("no post counts for more than 10x", () => {
  const e = enrich([post("a", 1000, "x"), post("b", 1000, "x"), post("c", 1000, "x"), post("v", 10000000, "x")]);
  assert.ok(Math.max(...e.map((p) => p.calc.lift)) <= MAX_STRENGTH);
});

t("posts under two days old stay out of patterns", () => {
  const e = enrich([post("a", 1000, "q"), post("b", 1200, "q"), post("c", 900, "q"), post("new", 50, "q", { days: 0.5 })]);
  const g = groupStats(e, (p) => p.tags.hook);
  assert.equal(g[0].n, 3);
});

t("one prolific account counts once in a pattern", () => {
  const posts = [...Array.from({ length: 8 }, () => post("solo", 50000, "pov")), post("a", 5000, "question"), post("b", 5000, "question"), post("c", 5000, "question")];
  const g = groupStats(enrich(posts), (p) => p.tags.hook);
  const pov = g.find((x) => x.key === "pov");
  assert.equal(pov.authors, 1);
  assert.equal(pov.n, 8);
});

t("a lucky trio doesn't outrank a pattern seen across many accounts", () => {
  // The trio is a little better per post (3.2x vs 2.7x), but three accounts
  // are weak evidence next to twenty.
  const posts = [
    ...["a", "b", "c"].map((h) => post(h, 19000, "challenge")),
    ...Array.from({ length: 20 }, (_, i) => post(`q${i}`, 16000, "question")),
    ...Array.from({ length: 24 }, (_, i) => post(`o${i}`, 6000, "other")),
  ];
  const g = groupStats(enrich(posts), (p) => p.tags.hook);
  const order = g.map((x) => x.key);
  assert.ok(order.indexOf("question") < order.indexOf("challenge"), order.join(","));
});

t("the cautious share grows with evidence", () => {
  assert.ok(wilsonLow(2, 2) < wilsonLow(18, 20));
  assert.ok(wilsonLow(9, 10) < 0.9);
});

t("proof can't say Strong on old, borrowed or narrow evidence", () => {
  const p = { n: 40, authors: 20, strength: 3, consistency: 0.95, consistencyLow: 0.85, confidence: 0.9 };
  assert.equal(proofScore(p, { age: 1 }).label, "Strong");
  assert.notEqual(proofScore(p, { age: 40, maxAge: 21 }).label, "Strong");
  assert.notEqual(proofScore(p, { age: 1, borrowedFrom: "linkedin" }).label, "Strong");
  assert.notEqual(proofScore({ ...p, authors: 6 }, { age: 1 }).label, "Strong");
  assert.equal(proofScore(null).label, "Thin");
});

t("evidence from another format is weak, not covered", () => {
  const f = (kind, focus, authors = 9, days = 1) => ({ id: `${kind}${focus}${days}`, kind, platform: "instagram", metrics: { key: "question", authors, standouts: 5 }, scope: { focus }, fetched_at: new Date(Date.now() - days * DAY).toISOString() });
  const rated = evaluate("reel", "instagram", [f("hook", "carousel"), f("examples", "carousel")]);
  assert.equal(rated.find((r) => r.kind === "hook").status, "weak");
  const ok = evaluate("reel", "instagram", [f("hook", "reel"), f("examples", "reel")]);
  assert.equal(ok.find((r) => r.kind === "hook").status, "covered");
  const old = evaluate("reel", "instagram", [f("hook", "reel", 9, 30)]);
  assert.equal(old.find((r) => r.kind === "hook").status, "stale");
  const few = evaluate("reel", "instagram", [f("hook", "reel", 3)]);
  assert.equal(few.find((r) => r.kind === "hook").status, "weak");
  assert.ok(NEEDS.reel.items.find((i) => i.kind === "hook").minN >= 5);
});

t("a just-tried gap isn't researched again", () => {
  const f = { id: "x", kind: "hook", platform: "instagram", metrics: { key: "question", authors: 2 }, scope: { focus: "reel", requestedFocus: "reel" }, fetched_at: new Date().toISOString() };
  const rated = evaluate("reel", "instagram", [f]);
  const hook = rated.find((r) => r.kind === "hook");
  assert.equal(hook.status, "weak");
  assert.equal(hook.tried, true);
});

t("topics match on meaning words, not stop words", () => {
  assert.deepEqual(topicTerms("How to clean white sneakers"), ["clean", "white", "sneaker"]);
  assert.equal(searchPhrase("how to clean white sneakers"), "clean white sneakers");
  assert.equal(overlaps("the best serum for oily skin", "aesthetic routines"), false);
  assert.equal(overlaps("Serums", "serum"), true);
});

t("a malformed brand never throws", () => {
  const ctx = brandContext({ intel: { keywords: "oops", platforms: "instagram", competitors: { instagram: "x" } } }, { niche: 5 });
  assert.ok(Array.isArray(ctx.keywords) && Array.isArray(ctx.platforms));
});

t("a thin week calls nothing a standout and shows no comparison", () => {
  // The first live briefing: 3 posts, and two of its "standouts" were below typical.
  const old = { posts: 3, evidence: [{ url: "a", lift: 1.54 }, { url: "b", lift: 0.5 }, { url: "c", lift: 0.3 }] };
  const s = standouts(old);
  assert.equal(s.thin, true);
  assert.equal(s.title, "Recent posts in your niche");
  assert.ok(s.posts.every((p) => p.lift == null && p.beat == null));
});

t("a full week's standouts all clearly beat a typical post", () => {
  const s = standouts({ posts: 40, thin: false, evidence: [{ url: "a", lift: 2.1 }, { url: "b", lift: 1.3 }, { url: "c", lift: 0.9 }, { url: "d", beat: 0.4, lift: 3 }] });
  assert.deepEqual(s.posts.map((p) => p.url), ["a", "b"]);
});

t("the briefing never calls a tag seen in two posts 'most used'", () => {
  const ctx = brandContext({ name: "Honest Glow", intel: { keywords: ["skincare"], platforms: ["instagram"] } }, {});
  const few = composeBriefing({ platform: "instagram", ctx, trending: { platform: "instagram", hashtags: [{ tag: "beauty", posts: 2 }, { tag: "skincare", posts: 2 }] }, analysis: { summary: { n: 3, top: [] } } });
  assert.ok(!few.moves.some((m) => /Most used/.test(m.text)), JSON.stringify(few.moves));
  assert.equal(few.thin, true);
  const many = composeBriefing({ platform: "instagram", ctx, trending: { platform: "instagram", hashtags: [{ tag: "skincare", posts: 9 }] }, analysis: { summary: { n: 30, top: [] } } });
  assert.ok(many.moves.some((m) => /#skincare \(9 posts\)/.test(m.text)));
});

console.log(`\n${passed} logic checks passed`);
