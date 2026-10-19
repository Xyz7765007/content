// v5: the intelligence rebuild, checked against what the user found broken
// on 19 Oct (each check names the complaint it answers). Stand-in model and
// stand-in data (HUESY_AI_MOCK=1), signed in as the QA account on Studio.
//
//   HUESY_AI_MOCK=1 ADMIN_EMAILS=qa.huesy@example.com npx next start -p 4311
//   BASE=http://localhost:4311 QA_PASSWORD=... SB_URL=... SB_KEY=... node scripts/qa/qa-v5-api.mjs
//
// It resets the QA account to a fresh Studio month first (set-plan), and
// deletes the conversations, reports, items and reels it made at the end.
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");

const BASE = process.env.BASE || "http://localhost:4311";
const EMAIL = process.env.QA_EMAIL || "qa.huesy@example.com";
const PASSWORD = process.env.QA_PASSWORD;
const SB = process.env.SB_URL;
const KEY = process.env.SB_KEY;
if (!PASSWORD || !SB || !KEY) throw new Error("Set QA_PASSWORD, SB_URL and SB_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const rest = async (path, init = {}) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// A fresh Studio month for the QA account.
const users = await (await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: H })).json();
const qa = users.users.find((u) => u.email === EMAIL);
if (!qa) throw new Error("No QA account");
const UID = qa.id;
const resetAccount = (patch = {}) =>
  rest(`accounts?user_id=eq.${UID}`, { method: "PATCH", body: JSON.stringify({ plan: "tier2", period_end: null, welcome_report_used: false, ...patch }) });
await rest(`accounts?on_conflict=user_id`, {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify({ user_id: UID, email: EMAIL, plan: "tier2", period_end: null, welcome_report_used: false }),
});
// Earlier runs' studio pieces would count against this month.
await rest(`content_items?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`reel_requests?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`intel_threads?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`intel_reports?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`intel_findings?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`plan_requests?user_id=eq.${UID}`, { method: "DELETE" });
// Stand-in usage rows count toward the 30-a-day text line; repeated runs would hit it.
await rest(`ai_usage?user_id=eq.${UID}&mock=eq.true`, { method: "DELETE" });

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(() => {
  try {
    sessionStorage.setItem("huesy:utm", JSON.stringify({ utm: { utm_source: "qa-site" }, referrer: "" }));
  } catch {
    /* fine */
  }
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await page.click("button[type=submit]");
await page.waitForURL(/\/(home|waitlist|onboarding)/, { timeout: 20000 });
const api = ctx.request;

const get = async (path) => {
  const r = await api.get(`${BASE}${path}`);
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const post = async (path, data, method = "post") => {
  const r = await api[method](`${BASE}${path}`, { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const stream = async (path, data) => {
  const r = await api.post(`${BASE}${path}`, { data, timeout: 120000 });
  const text = await r.text();
  if (!(r.headers()["content-type"] || "").includes("ndjson")) {
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: r.status(), events: [], body };
  }
  const events = text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return { status: r.status(), events, of: (t) => events.filter((e) => e.t === t), one: (t) => events.find((e) => e.t === t) };
};
const credits = async () => (await get("/api/account")).body?.credits;

const brand = {
  brandName: "Loam Skin",
  product: "Sunscreen and skincare for Indian skin",
  brandDescription: "Small-batch sunscreen and skincare made for humid Indian summers.",
  targetAudience: "Women 20-35 in Indian cities",
  brandPersona: "Calm, honest, a little dry",
  intel: { platforms: ["linkedin", "instagram", "x"], region: "India", keywords: ["sunscreen", "skincare"], competitors: { instagram: ["dewdrop.notes"] }, goal: "Sales" },
};
const targets = { niche: "skincare, sunscreen" };
const DAY = 86400000;
const VENDORS = /treg|anyapi|harvest|tikhub|crawl4ai|influencers ?club|scrapecreators|litescrape|serpapi|dataforseo/i;
const datesIn = (text) => [...String(text || "").matchAll(/\b(20\d\d-\d\d-\d\d)\b/g)].map((m) => Date.parse(m[1]));

/* --------------------------------------------------------- market map */
let m = await post("/api/intel/map", { brand, targets });
const map = m.body?.map;
check("M1 map: knows the market's platforms, country and the brand's competitors", map && map.country === "IN" && ["linkedin", "instagram", "x"].every((p) => map.platforms.some((q) => q.id === p && q.fit !== "skip")) && map.competitors.some((c) => c.instagram === "dewdrop.notes"), JSON.stringify(map?.platforms?.map((p) => `${p.id}:${p.fit}`)));

/* ------------------------------------------- #7 Ask: latest launches in India */
const q7 = "tell me the latest brand launches or collaboration by beauty brands in india";
let s = await stream("/api/intel/ask", { question: q7, brand, targets });
const steps = s.of("step");
const answer = s.of("text").map((e) => e.delta).join("");
check("N1 ask (complaint 7): news AND platform posts are both searched", steps.some((x) => /news/i.test(x.label)) && steps.some((x) => /Searching (Instagram|X|LinkedIn|Reddit|TikTok|YouTube)/.test(x.label)), steps.map((x) => x.label).join(" | ").slice(0, 300));
const links = (answer.match(/\]\(https?:\/\//g) || []).length;
check("N2 ask: the answer links its sources", links >= 3, `${links} links`);
const dates = datesIn(answer);
check("N3 ask: every dated item is from the last 14 days (no old news as 'latest')", dates.length >= 3 && dates.every((d) => Date.now() - d <= 15 * DAY), `${dates.length} dates`);
check("N4 ask: no data provider is named anywhere in steps or answer", !VENDORS.test(JSON.stringify(steps)) && !VENDORS.test(answer));

/* -------------------------------------------- #1 playbook on X: measured */
s = await stream("/api/intel/report", { kind: "playbook", params: { platform: "x" }, brand, targets });
let rid = s.one?.("start")?.reportId;
let rep = (await get(`/api/intel/report?id=${rid}`)).body?.report;
let d = rep?.body?.data || {};
check("R1 playbook on X (complaint 1): a deep sample, not 13 posts", d.posts >= 60, `${d.posts} posts from ${d.accounts} accounts`);
check("R2 playbook on X: openings, lengths and posting times are measured", d.hooks?.length >= 2 && d.lengths?.length >= 1 && d.postingTimes?.length >= 1, `${d.hooks?.length} hooks, ${d.lengths?.length} lengths, ${d.postingTimes?.length} times`);
check("R3 playbook: every section has something to act on", (rep?.body?.sections || []).length >= 3 && rep.body.sections.every((x) => String(x.body).length > 40));
check("R4 playbook: says what it read", (rep?.body?.read || []).length >= 1 && rep.body.read.some((r) => r.items > 0), JSON.stringify(rep?.body?.read)?.slice(0, 160));
s = await stream("/api/intel/report", { kind: "playbook", params: { platform: "linkedin" }, brand, targets });
rep = (await get(`/api/intel/report?id=${s.one?.("start")?.reportId}`)).body?.report;
d = rep?.body?.data || {};
check("R5 playbook on LinkedIn: word-count lengths and a deep sample", d.posts >= 60 && (d.lengths || []).some((l) => /words|slides/.test(l.length)), `${d.posts} posts, lengths ${JSON.stringify(d.lengths?.map((l) => l.length))}`);

/* --------------------------------------- #2 trend radar on Instagram: depth */
s = await stream("/api/intel/report", { kind: "trends", params: { platform: "instagram" }, brand, targets });
rep = (await get(`/api/intel/report?id=${s.one?.("start")?.reportId}`)).body?.report;
d = rep?.body?.data || {};
check("T1 trend radar on Instagram (complaint 2): reads this week's posts, not 2", (d.platforms?.[0]?.postsThisWeek || 0) >= 10, `${d.platforms?.[0]?.postsThisWeek} posts`);
s = await stream("/api/intel/report", { kind: "trends", params: { platform: "all" }, brand, targets });
rep = (await get(`/api/intel/report?id=${s.one?.("start")?.reportId}`)).body?.report;
d = rep?.body?.data || {};
check("T2 trend radar across platforms: several platforms plus the news", (d.platforms || []).length >= 2 && (d.news || []).length >= 1, `${(d.platforms || []).map((p) => `${p.platform}:${p.postsThisWeek}`).join(", ")}; ${d.news?.length} stories`);

/* ------------------------------------ #3 competitors: every platform + more */
s = await stream("/api/intel/report", { kind: "competitors", params: { handles: ["Glowlab", "@dewdrop.notes", "https://www.linkedin.com/company/brightside/"] }, brand, targets });
rep = (await get(`/api/intel/report?id=${s.one?.("start")?.reportId}`)).body?.report;
d = rep?.body?.data || {};
const comps = d.competitors || [];
check("K1 competitors (complaint 3): names, @handles and links all accepted", comps.length === 3, comps.map((c) => c.name).join(", "));
check("K2 competitors: read on more than Instagram and TikTok", new Set(comps.flatMap((c) => (c.accounts || []).map((a) => a.platform))).size >= 2, [...new Set(comps.flatMap((c) => (c.accounts || []).map((a) => a.platform)))].join(", "));
check("K3 competitors: ads, reviews and mentions are part of it", comps.every((c) => c.ads && "running" in c.ads && c.mentions && "last30Days" in c.mentions) && comps.some((c) => c.ads.running > 0) && comps.some((c) => c.mentions.last30Days > 0));
s = await stream("/api/intel/report", { kind: "competitors", params: {}, brand, targets });
check("K4 competitors with none typed uses the market's own", s.status === 200 && s.one?.("done"), s.body?.error?.message);

/* --------------------------------------------- #5 audience voice: niche-aware */
s = await stream("/api/intel/report", { kind: "audience", params: { topic: "sunscreen" }, brand, targets });
rep = (await get(`/api/intel/report?id=${s.one?.("start")?.reportId}`)).body?.report;
d = rep?.body?.data || {};
check("V1 audience voice (complaint 5): listens in several places", Object.keys(d.bySource || {}).length >= 3 && d.read >= 40, `${d.read} lines from ${JSON.stringify(d.bySource)}`);
check("V2 audience voice: counts questions, pains and objections", d.questions?.length >= 1 && d.pains?.length >= 1 && Array.isArray(d.objections));

/* ------------------------------------- #4 creators on every platform + contacts */
const creatorsOn = async (platform) => {
  const r = await stream("/api/intel/report", { kind: "creators", params: { platform, topic: "skincare" }, brand, targets });
  return (await get(`/api/intel/report?id=${r.one?.("start")?.reportId}`)).body?.report;
};
for (const platform of ["instagram", "tiktok", "x", "linkedin", "youtube"]) {
  const r = await creatorsOn(platform);
  const list = r?.body?.data?.creators || [];
  check(`CR ${platform} creators (complaint 4): a ranked list on ${platform}`, list.length >= 3 && list.every((c) => c.platform === platform) && list.some((c) => c.fit != null), `${list.length} creators`);
  if (["instagram", "tiktok", "x"].includes(platform)) {
    const first = list.find((c) => !c.email) || list[0];
    const ct = await post("/api/intel/contact", { handle: first?.handle, reportId: r?.id });
    check(`CC ${platform} contact (complaint 4): enrichment finds an email`, ct.body?.found === true && /@/.test(ct.body?.email || ""), JSON.stringify(ct.body)?.slice(0, 140));
  }
}

/* ---------------------------------------------- #6 Today: every platform */
await rest(`intel_reports?user_id=eq.${UID}&kind=eq.briefing`, { method: "DELETE" });
let b = await post("/api/intel/briefing", { brand, targets });
const bb = b.body?.briefing?.body || {};
check("B1 briefing (complaint 6): covers several platforms, not just one", bb.v === 2 && (bb.platforms || []).length >= 2, (bb.platforms || []).map((p) => `${p.platform}:${p.posts}`).join(", "));
check("B2 briefing: has the week's news", (bb.news || []).length >= 1);
check("B3 briefing: never compares a week's posts to 'typical'", (bb.platforms || []).every((p) => (p.hot || []).every((h) => h.lift == null && h.beat == null)));

/* ----------------------------------- #8, #9 watchlists: sources + kept safe */
const searchId = `qa-v5-${Date.now().toString(36)}`;
const config = { name: "QA beauty launches", targetMode: "niche", niche: "beauty", subNiches: "skincare, makeup", accountList: "Glowlab, @dewdrop.notes", selectedSignals: [], researchPlatforms: ["google", "instagram", "twitter", "linkedin", "reddit", "tiktok", "youtube", "ads"], researchLocations: ["India"], resultRange: [10, 25], lookbackDays: 14 };
s = await stream("/api/ai-search", { config, brand, searchId, name: config.name });
const sigs = s.of?.("signal")?.map((e) => e.signal) || [];
check("W1 watchlist (complaint 8): reads all 8 sources", s.of?.("query")?.length >= 8 && ["News", "X", "Instagram", "LinkedIn", "Reddit", "TikTok", "YouTube", "Ad library"].every((l) => (s.of("query") || []).some((q) => q.q.startsWith(l))), (s.of?.("query") || []).map((q) => q.q.split(":")[0]).join(","));
check("W2 watchlist: finds signals, each dated inside the window", sigs.length >= 3 && sigs.every((x) => x.date && Date.now() - Date.parse(x.date) <= 15 * DAY), `${sigs.length} signals`);
check("W3 watchlist: the same move from several sources is one signal", sigs.some((x) => (x.sources || []).length > 1), sigs.map((x) => (x.sources || []).length).join(","));
const kept = await get(`/api/watch?search=${searchId}`);
check("W4 watchlist (complaint 9): every signal is saved on the server", (kept.body?.signals || []).length === sigs.length && sigs.every((x) => kept.body.signals.some((k) => k.key === x.key)), `${kept.body?.signals?.length} kept of ${sigs.length}`);
const all = await get(`/api/watch`);
check("W5 watchlist: the server keeps the watchlist itself", (all.body?.watchlists || []).some((w) => w.id === searchId && w.config?.niche === "beauty"));
await api.delete(`${BASE}/api/watch?search=${searchId}`);
const afterDelete = await get(`/api/watch`);
check("W6 watchlist: deleting it on one device removes it everywhere", !(afterDelete.body?.watchlists || []).some((w) => w.id === searchId) && (afterDelete.body?.deleted || []).includes(searchId));
await post("/api/watch", { search: searchId, restore: true }, "patch");
const afterRestore = await get(`/api/watch`);
check("W7 watchlist: undo brings it back with its signals", (afterRestore.body?.watchlists || []).some((w) => w.id === searchId) && (afterRestore.body?.signals || []).some((x) => x.searchId === searchId));
const anon = await fetch(`${BASE}/api/watch`);
check("W8 watchlist: nobody else can read them", anon.status === 401);

/* ------------------------------------------------------------- cleanup */
await rest(`watch_signals?user_id=eq.${UID}&search_id=eq.${searchId}`, { method: "DELETE" });
await rest(`watchlists?user_id=eq.${UID}&id=eq.${searchId}`, { method: "DELETE" });
await rest(`intel_threads?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`intel_reports?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`intel_findings?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`ai_usage?user_id=eq.${UID}&mock=eq.true`, { method: "DELETE" });
await browser.close();
const passedCount = results.filter((r) => r.ok).length;
console.log(`\n${passedCount}/${results.length} passed`);
if (passedCount !== results.length) process.exitCode = 1;
