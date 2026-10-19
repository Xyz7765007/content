// The intelligence layer's rules, checked directly with no network and no
// model: the parsers on every source's real reply shape, the search plans, the
// collector, the market map's rules, the briefing's honesty, watchlist
// parsing and merging, and brand-name checks.
//   node --import ./scripts/qa/logic/hooks.mjs scripts/qa/logic/intel.test.mjs
process.env.HUESY_AI_MOCK = "1";
import assert from "node:assert/strict";
import * as N from "../../../lib/intel/normalize.js";
import { CAPS } from "../../../lib/intel/catalog.js";
import { mockRaw } from "../../../lib/intel/mock.js";
import { xQuery, postJobs, newsJobs } from "../../../lib/intel/plan.js";
import { collect, dedupe, within, Purse } from "../../../lib/intel/collect.js";
import { ruleMap, platformsFor } from "../../../lib/intel/market.js";
import { brandContext } from "../../../lib/intel/brand.js";
import { composeBriefing } from "../../../lib/intel/briefing.js";
import { _test as W } from "../../../lib/intel/watch.js";
import { _test as A, answerScreen } from "../../../lib/intel/agent.js";
import { nameMatches } from "../../../lib/intel/accounts.js";
import { isTheirAd, marketWords, pickPage, topicTerms } from "../../../lib/intel/tools.js";
import { isTheirProduct } from "../../../lib/intel/reviews.js";
import { lengthOf, slotOf } from "../../../lib/intel/taxonomy.js";

let passed = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

const ctx = brandContext(
  { brandName: "Honest Glow", product: "sunscreen", intel: { keywords: ["skincare", "sunscreen"], platforms: ["instagram", "x"], region: "India", competitors: { instagram: ["beminimalist"], x: ["MyNykaa"] } } },
  { niche: "skincare" }
);

t("every source's stand-in reply parses into complete records", async () => {
  const sample = {
    "news.search": { q: "skincare launch", days: 7 }, "web.search": { q: "minimalist" }, "google.trends": { keywords: ["skincare"] },
    "instagram.reelsSearch": { q: "skincare" }, "instagram.hashtag": { tag: "skincare" }, "instagram.usersSearch": { q: "skincare" }, "instagram.profile": { handle: "glowlab.daily" },
    "instagram.posts": { handle: "glowlab.daily" }, "instagram.reels": { handle: "glowlab.daily" }, "instagram.comments": { shortcode: "abc" }, "instagram.contact": { handle: "glowlab.daily" }, "instagram.similar": { handle: "glowlab.daily" },
    "tiktok.search": { q: "skincare", sort: 1, days: 30 }, "tiktok.usersSearch": { q: "skincare" }, "tiktok.profile": { handle: "glowlab" }, "tiktok.videos": { secUid: "MS4w" }, "tiktok.comments": { videoId: "1" }, "tiktok.contact": { handle: "glowlab" },
    "tiktok.trending": { region: "US", limit: 5 }, "tiktok.music": {}, "tiktok.ads": { query: "skincare" },
    "youtube.search": { q: "skincare" }, "youtube.channel": { channelId: "UCabcdefghijklmnopqrstuv" }, "youtube.videos": { channelId: "UCabcdefghijklmnopqrstuv" }, "youtube.comments": { videoId: "v1" }, "youtube.shorts": {},
    "x.search": { q: "skincare lang:en", sort: "Top" }, "x.profile": { handle: "MyNykaa" }, "x.replies": { tweetId: "1" },
    "linkedin.search": { q: "skincare", sort: "relevance", window: "month" }, "linkedin.company": { url: "https://www.linkedin.com/company/acme/" }, "linkedin.companyPosts": { url: "https://www.linkedin.com/company/acme/" },
    "linkedin.profile": { url: "https://www.linkedin.com/in/someone/" }, "linkedin.userPosts": { url: "https://www.linkedin.com/in/someone/" }, "linkedin.comments": { postId: "123" }, "linkedin.ads": { keyword: "skincare" }, "people.email": { linkedinUrl: "https://www.linkedin.com/in/someone/" },
    "reddit.search": { q: "skincare", sort: "top", timeframe: "month" }, "reddit.comments": { postId: "1x2" }, "facebook.posts": { url: "https://www.facebook.com/acme" }, "meta.ads": { q: "skincare" }, "meta.pages": { q: "Plum" }, "meta.pageAds": { pageId: "900001", country: "IN" },
    "reviews.trustpilot": { domain: "www.acme.example" }, "maps.search": { q: "acme store" }, "reviews.maps": { placeId: "ChIJ1" }, "amazon.search": { q: "sunscreen", country: "in" }, "reviews.amazon": { asin: "B01" },
    "creators.search": { platform: "instagram", limit: 10 },
  };
  const missing = Object.keys(CAPS).filter((k) => !sample[k]);
  assert.deepEqual(missing, [], `no stand-in sample for: ${missing.join(", ")}`);
  for (const [name, params] of Object.entries(sample)) {
    const raw = await mockRaw(name, params);
    const out = CAPS[name].parse(raw, params);
    const list = Array.isArray(out) ? out : [out];
    assert.ok(list.length && list[0], `${name} parsed to nothing`);
    for (const x of list) {
      if (x.kind === "post") assert.ok(x.id && x.url && x.postedAt && x.format && x.author.handle, `${name}: incomplete post ${JSON.stringify(x).slice(0, 160)}`);
      if (x.kind === "comment") assert.ok(x.text && x.postedAt, `${name}: incomplete comment`);
      if (x.kind === "review") assert.ok(x.text && x.rating != null, `${name}: incomplete review`);
      if (x.kind === "article") assert.ok(x.title && x.url && x.postedAt, `${name}: incomplete article`);
      if (x.kind === "profile") assert.ok(x.handle || x.name, `${name}: incomplete profile`);
      if (x.kind === "page") assert.ok(x.id && x.name && x.likes != null, `${name}: incomplete page`);
      if (x.kind === "ad") assert.ok(x.id && (x.text || x.title) && (!name.startsWith("meta.") || x.pageId), `${name}: incomplete ad`);
    }
  }
});

t("real reply quirks: contact emails as strings or objects, news link/date, Reddit camelCase, LinkedIn engagement, X replies dropped", () => {
  assert.equal(N.contact({ output: { found: true, data: { emails: ["A@x.com"] } } }).email, "a@x.com");
  assert.equal(N.contact({ output: { found: true, data: { emails: [{ email: "b@y.com", sourceType: "bio" }] } } }).email, "b@y.com");
  assert.equal(N.contact({ output: { found: true, data: { emails: [], phones: [] } } }).found, false);
  const news = N.articles({ output: { results: [{ title: "Brand launches", link: "https://n.example/a", date: "23 Jun 2026", source: "Wire" }] } });
  assert.equal(news[0].url, "https://n.example/a");
  assert.ok(news[0].postedAt?.startsWith("2026-06-23"));
  const reddit = N.redditRows({ output: { data: { posts: [{ id: "1", title: "Q?", selftext: "", numComments: 12, createdUtc: 1792224145, permalink: "/r/a/comments/1/q/", score: 5, subreddit: "a", author: "u1" }] } } });
  assert.equal(reddit[0].metrics.comments, 12);
  assert.ok(reddit[0].postedAt);
  const li = N.liElements({ elements: [{ id: "1", linkedinUrl: "https://www.linkedin.com/posts/x", content: "Hello", author: { name: "A", publicIdentifier: "a", type: "profile" }, postedAt: { timestamp: 1792324823565 }, engagement: { likes: 13, comments: 1, shares: 1 } }] });
  assert.equal(li[0].metrics.likes, 13);
  const x = N.xRows({ output: { data: { items: [{ id: "1", text: "hi", createdUtc: 1792000000, authorUsername: "a", isReply: false }, { id: "2", text: "re", createdUtc: 1792000000, authorUsername: "b", isReply: true }] } } });
  assert.deepEqual(x.map((p) => p.id), ["1"]);
});

t("X searches: commas become an OR group, filler words go, operators are kept", () => {
  assert.equal(xQuery("skincare, haircare"), "(skincare OR haircare) lang:en -filter:replies");
  assert.equal(xQuery("the latest launches by beauty brands"), "launches by beauty brands lang:en -filter:replies");
  assert.equal(xQuery("(launch OR collab) skincare lang:en"), "(launch OR collab) skincare lang:en -filter:replies");
});

t("plans: each platform searched its own way, paged by depth", () => {
  const map = ruleMap(ctx);
  const x = postJobs("x", map, ctx, { depth: "deep", mode: "both" });
  assert.ok(x.some((j) => j.params.sort === "Top" && j.pages === 3) && x.some((j) => j.params.sort === "Latest"));
  const li = postJobs("linkedin", map, ctx, { days: 7, mode: "latest" });
  assert.ok(li.every((j) => j.params.window === "week" && j.params.sort === "date"));
  const rd = postJobs("reddit", { ...map, subreddits: ["IndianSkincareAddicts"] }, ctx, { topic: "sunscreen" });
  assert.ok(rd.some((j) => /^subreddit:IndianSkincareAddicts sunscreen/.test(j.params.q)));
  const tt = postJobs("tiktok", map, ctx, { days: 7, mode: "top" });
  assert.ok(tt.every((j) => j.params.days === 7));
  const news = newsJobs(map, ctx, { days: 7 });
  assert.ok(news.some((j) => j.cap === "news.search" && j.params.days === 7 && j.params.country === "IN") && news.some((j) => j.cap === "news.rss"));
});

t("the collector pages, de-duplicates across sources and stops at the purse", async () => {
  const purse = new Purse(0.0000001);
  const r = await collect([{ cap: "x.search", params: { q: "skincare", sort: "Top" }, pages: 3 }, { cap: "x.search", params: { q: "skincare", sort: "Top" }, pages: 1 }], { purse });
  assert.ok(r.items.length >= 20);
  assert.equal(new Set(r.items.map((p) => p.id)).size, r.items.length);
  const free = await collect([{ cap: "x.search", params: { q: "glow", sort: "Top" }, pages: 3 }], { purse: new Purse(1) });
  assert.equal(free.sources[0].calls, 3);
  assert.equal(dedupe([{ kind: "article", title: "A launch!" }, { kind: "article", title: "A launch" }]).length, 1);
  assert.equal(within({ postedAt: new Date(Date.now() - 9 * 86400000).toISOString() }, 7), false);
});

t("the market map always keeps the brand's own competitors and platforms", () => {
  const map = ruleMap(ctx);
  assert.ok(map.competitors.some((c) => c.instagram === "beminimalist" && !c.suggested));
  assert.ok(map.competitors.some((c) => c.x === "MyNykaa"));
  assert.ok(["instagram", "x"].every((p) => map.platforms.some((q) => q.id === p && q.fit !== "skip")));
  assert.equal(map.country, "IN");
  assert.deepEqual(platformsFor({ platforms: [{ id: "tiktok", fit: "skip" }, { id: "x", fit: "core" }] }), ["x"]);
});

t("the briefing calls nothing 'most used' from two posts and never compares a week's posts to 'typical'", () => {
  const b = composeBriefing({
    ctx,
    map: ruleMap(ctx),
    per: [{ platform: "x", n: 3, hashtags: [{ tag: "glow", posts: 2 }, { tag: "spf", posts: 5 }], topics: [{ topic: "spf", posts: 3, accounts: 3 }], hot: [{ url: "u", lift: 0.3, beat: 0.2 }], sounds: [] }],
    news: { items: [{ title: "T", url: "https://n", source: "S", postedAt: "2026-10-18T00:00:00Z" }] },
  });
  assert.deepEqual(b.platforms[0].hashtags.map((h) => h.tag), ["spf"]);
  assert.ok(b.platforms[0].hot.every((h) => h.lift == null && h.beat == null));
  assert.ok(b.moves.some((m) => /spf: 3 accounts/.test(m.text)));
  assert.equal(b.news[0].date, "2026-10-18");
});

t("watchlists: accounts as names, @handles or links; one event from many sources", () => {
  assert.deepEqual(W.parseAccount("https://www.instagram.com/beminimalist/"), { name: "beminimalist", instagram: "beminimalist" });
  assert.equal(W.parseAccount("@mynykaa").x, "mynykaa");
  assert.equal(W.parseAccount("Mamaearth").name, "Mamaearth");
  const item = (s) => ({ kind: "article", title: s });
  const events = W.merge([
    { brand: "Glowlab", type: "Launch", event: "Glowlab launches new sunscreen range", item: item("a") },
    { brand: "glowlab", type: "Launch", event: "Glowlab new sunscreen range launched", item: item("b") },
    { brand: "Dewdrop", type: "Collab", event: "Dewdrop teams up with Brightside", item: item("c") },
  ]);
  assert.equal(events.length, 2);
  assert.equal(events.find((e) => e.brand === "Glowlab").items.length, 2);
  const c = W.boundConfig({ researchPlatforms: ["google", "linkedin", "myspace"], lookbackDays: 365, resultRange: [5, 500] });
  assert.deepEqual(c.researchPlatforms, ["google", "linkedin"]);
  assert.equal(c.lookbackDays, 30);
  assert.equal(c.resultRange[1], 60);
});

t("links point Ask at the right comments", () => {
  assert.equal(A.postFromUrl("https://www.instagram.com/reel/Dbo6KGUpcLL/").params.shortcode, "Dbo6KGUpcLL");
  assert.equal(A.postFromUrl("https://www.tiktok.com/@a/video/7690847745413795102").params.videoId, "7690847745413795102");
  assert.equal(A.postFromUrl("https://www.youtube.com/watch?v=CyXLZ5V7bLU").params.videoId, "CyXLZ5V7bLU");
  assert.equal(A.postFromUrl("https://x.com/i/web/status/2111432344334663875").params.tweetId, "2111432344334663875");
  assert.equal(A.postFromUrl("https://www.reddit.com/r/a/comments/1x7bfsi/title/").params.postId, "1x7bfsi");
  assert.equal(A.postFromUrl("https://example.com/x"), null);
});

t("a guessed handle must look like the brand", () => {
  // The live case: @nykaa on X is a 16-follower stranger; the handle alone proves nothing.
  assert.equal(nameMatches("Nykaa", { name: "Meráth Mónika", handle: "nykaa" }), false);
  assert.equal(nameMatches("Nykaa", { name: "Nykaa", handle: "MyNykaa" }), true);
  assert.equal(nameMatches("Minimalist", { name: "Be Minimalist", handle: "beminimalist" }), true);
});

t("lengths and posting times mean something on every platform", () => {
  assert.equal(lengthOf({ platform: "x", format: "text", caption: "a".repeat(150) }), "100-200 characters");
  assert.equal(lengthOf({ platform: "linkedin", format: "text", caption: "word ".repeat(200) }), "150-300 words");
  assert.equal(lengthOf({ platform: "linkedin", format: "carousel", slides: 8, caption: "" }), "6-10 slides");
  assert.equal(lengthOf({ platform: "instagram", format: "reel", durationS: 20 }), "15-30s");
  assert.equal(slotOf(7), "early morning (5-9)");
});

t("a search plan never spends two queries on the same words in different case", () => {
  const map = { terms: ["skincare routine", "Sunscreen India"], linkedinQueries: ["Skincare Routine"], country: "IN" };
  const qs = postJobs("linkedin", map, { keywords: ["sunscreen india"] }, { topic: "Skincare routine", depth: "standard" }).map((j) => String(j.params.q || j.params.query || "").toLowerCase());
  assert.ok(qs.length >= 2, `only ${qs.length} queries`);
  assert.equal(new Set(qs).size, qs.length, qs.join(" | "));
});

t("a competitor's ads are only the ones its own page runs or that link to its site", () => {
  // The live case: Plum Goodness's page is called "Plum"; a search for its name also returned preserves and kajal ads.
  assert.equal(isTheirAd({ advertiser: "Plum" }, { advertiser: "Plum Goodness" }), true);
  assert.equal(isTheirAd({ advertiser: "Be Minimalist" }, { advertiser: "Minimalist" }), true);
  assert.equal(isTheirAd({ advertiser: "Reen Naturals" }, { advertiser: "Plum Goodness" }), false);
  assert.equal(isTheirAd({ advertiser: "Glow" }, { advertiser: "Honest Glow" }), false);
  assert.equal(isTheirAd({ advertiser: null, domain: "plumgoodness.com" }, { advertiser: "Plum Goodness", website: "plumgoodness.com" }), true);
  assert.equal(isTheirAd({ advertiser: null, link: "https://shop.plumgoodness.com/x?utm=1" }, { advertiser: "Plum Goodness", website: "https://www.plumgoodness.com/" }), true);
  assert.equal(isTheirAd({ advertiser: null, link: "https://notplumgoodness.com/" }, { advertiser: "Plum Goodness", website: "plumgoodness.com" }), false);
});

t("an answer written before offering a report stays on screen and is what's saved; thinking out loud is taken back", () => {
  // The live case, 19 Oct: the full fashion-trends answer was wiped when the trend radar was offered after it,
  // and only "The trend radar above would cover..." was saved and charged.
  const sent = [];
  const s = answerScreen((e) => sent.push(e));
  s.newTurn();
  s.tool("search_news");
  s.newTurn();
  s.text("Here's what's new in fashion this week: ");
  s.text("quiet luxury is cooling.");
  s.tool("propose");
  s.newTurn();
  s.text("You can run the trend radar below.");
  assert.equal(sent.filter((e) => e.t === "retract").length, 0);
  assert.equal(s.answer, "Here's what's new in fashion this week: quiet luxury is cooling.\n\nYou can run the trend radar below.");
  assert.equal(sent.filter((e) => e.t === "text").map((e) => e.delta).join(""), s.answer);
  // Words before a data call are narration: taken back on screen and never saved.
  const sent2 = [];
  const t2 = answerScreen((e) => sent2.push(e));
  t2.newTurn();
  t2.text("Let me check the news first.");
  t2.tool("search_news");
  t2.newTurn();
  t2.text("Two launches this week.");
  assert.equal(sent2.filter((e) => e.t === "retract").length, 1);
  assert.equal(t2.answer, "Two launches this week.");
});

t("a brand's ad page is the one with its Instagram, not another business with the same name", () => {
  // Real ad-library results, 19 Oct: "Plum Goodness" finds tiny regional pages; "Plum" finds a bank and the brand.
  const pages = [
    { id: "197123407589284", name: "Plum Goodness", likes: 34, verified: false, instagram: null },
    { id: "107728071060320", name: "PlumGoodness Nepal", likes: 3740, verified: false, instagram: null },
    { id: "557221327785260", name: "Plum", likes: 38957, verified: true, instagram: "withplum" },
    { id: "511641355600533", name: "Plum", likes: 257242, verified: true, instagram: "plumgoodness" },
    { id: "1652151725049353", name: "Plum Guide", likes: 86239, verified: true, instagram: "plumguide" },
  ];
  assert.equal(pickPage(pages, { advertiser: "Plum Goodness", instagram: "@PlumGoodness" })?.id, "511641355600533");
  // Without an Instagram to go on: the best-liked real page carrying the name, never a 34-like page.
  assert.equal(pickPage(pages, { advertiser: "Plum Goodness" })?.id, "511641355600533");
  assert.equal(pickPage(pages.slice(0, 1), { advertiser: "Plum Goodness" }), null);
  assert.equal(pickPage(pages, { advertiser: "Minimalist" }), null);
});

t("a brand's Amazon listings are only its own, not its rivals' from the same search", () => {
  // The live case: a search for Plum Goodness listed Neutrogena and Lakme; Minimalist's listed Cetaphil.
  assert.equal(isTheirProduct("Plum Green Tea Face Wash 100ml", "Plum Goodness"), true);
  assert.equal(isTheirProduct("Minimalist SPF 30 Body Sunscreen", "Minimalist"), true);
  assert.equal(isTheirProduct("mcaffeine", "mCaffeine"), true);
  assert.equal(isTheirProduct("Dot & Key Watermelon Sunscreen", "Dot & Key"), true);
  assert.equal(isTheirProduct("Lakme Sunscreen for Bright Skin, SPF 50", "Plum Goodness"), false);
  assert.equal(isTheirProduct("Cetaphil Sun SPF 50 Light Gel", "Minimalist"), false);
  assert.equal(isTheirProduct("The Body Shop Vitamin C Glow", "The Derma Co"), false);
});

t("news needs the market's own words, not places or words every business uses", () => {
  const words = marketWords({ keywords: ["refillable packaging"], niche: "clean skincare" }, { terms: ["sunscreen India", "brand launches"], country: "IN" });
  for (const w of ["refillable", "packaging", "clean", "skincare", "sunscreen"]) assert.ok(words.has(w), w);
  for (const w of ["india", "brand", "launch"]) assert.ok(!words.has(w), w);
  const offTopic = ["Alan Scott Enterprises Limited Company Profile & Facts", "150 UK small business grants to apply for right now", "How Much Did Sharebite Raise? Funding & Key Investors"];
  const onTopic = ["Refillable Cleansing Balms", "Sunscreen sales double in Indian summer"];
  const hits = (title) => topicTerms(title).some((w) => words.has(w));
  assert.deepEqual(offTopic.filter(hits), []);
  assert.deepEqual(onTopic.filter(hits), onTopic);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}
console.log(`\n${passed}/${tests.length} intelligence checks passed`);
if (passed !== tests.length) process.exitCode = 1;
