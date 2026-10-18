// Checks every plan, intelligence and studio route on the stand-in model
// (HUESY_AI_MOCK=1, ADMIN_EMAILS including the QA account), signed in as the
// QA account on Studio. Covers the money paths: what each action charges,
// what it refunds, and what it refuses.
//
//   HUESY_AI_MOCK=1 ADMIN_EMAILS=qa.huesy@example.com npx next start -p 4311
//   BASE=http://localhost:4311 QA_PASSWORD=... SB_URL=... SB_KEY=... node scripts/qa/qa-v4-api.mjs
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
  product: "Fragrance-free skincare for sensitive skin",
  brandDescription: "Small-batch skincare for people whose skin reacts to everything.",
  targetAudience: "Women 22-38 with sensitive skin",
  brandPersona: "Calm, honest, a little dry",
  intel: { platforms: ["instagram", "tiktok"], region: "United States", keywords: ["skincare routine", "sensitive skin"], competitors: { instagram: ["glowrecipe", "theordinary"] }, goal: "Sales" },
};
const targets = { niche: "skincare routine, sensitive skin" };

/* ------------------------------------------------------------- account */
let a = await get("/api/account");
check("P1 account: Studio with a full month of credits", a.body?.plan === "tier2" && a.body?.credits === 20000, `${a.body?.plan} ${a.body?.credits}`);
check("P2 account: allowances 10/10/3, none used", a.body?.allowances?.creative?.left === 10 && a.body?.allowances?.carousel?.left === 10 && a.body?.allowances?.reel?.left === 3);
check("P3 account: first deep report is free", a.body?.welcomeReport === true);
check("P4 account: seats and prices are listed", a.body?.seats?.limit > 0 && a.body?.prices?.ask === 100);

/* ----------------------------------------------------------------- ask */
let s = await stream("/api/intel/ask", { question: "What content is working in my niche on instagram?", brand, targets });
const start = s.one?.("start");
check("A1 ask: streams start → steps → text → done", start && s.of("step").length >= 2 && s.of("text").length > 3 && s.one("done"), `${s.events.length} events`);
check("A2 ask: charges 100 credits up front", start?.charged === 100 && start?.credits === 19900, `${start?.credits}`);
check("A3 ask: shows the first step as checking what it knows", s.of("step")[0]?.id === "recall");
check("A4 ask: brings evidence posts and content actions", s.one("evidence")?.posts?.length > 0 && s.one("actions")?.findingIds?.length > 0);
const answer1 = s.of("text").map((e) => e.delta).join("");
check("A5 ask: answer quotes sample sizes", /\d+ posts/.test(answer1), answer1.slice(0, 80));
const threadId = start?.threadId;

s = await stream("/api/intel/ask", { question: "What's trending this week?", threadId, brand, targets });
check("A6 ask: follow-up stays in the same conversation", s.one("start")?.threadId === threadId);
const recallStep = s.of("step").find((e) => e.id === "recall" && e.status === "done");
check("A7 ask: second question reuses what the first learned", /Found \d+/.test(recallStep?.label || ""), recallStep?.label);

let t = await get(`/api/intel/threads?id=${threadId}`);
check("A8 threads: the conversation has 4 messages with saved evidence", t.body?.messages?.length === 4 && t.body.messages[1]?.data?.evidence?.length > 0, `${t.body?.messages?.length}`);

const before = await credits();
s = await stream("/api/intel/ask", { question: "What content is working on youtube?", threadId, brand: { ...brand, intel: { ...brand.intel, keywords: ["#fail"] } }, targets: {} });
const after = await credits();
check("A9 ask: when every source comes back empty, the answer is free", s.one?.("refund") && s.one("done") && after === before, `${before}→${after}`);

s = await stream("/api/intel/ask", { question: "Who are the best creators for us?", brand, targets });
const prop = s.one?.("proposal");
check("A10 ask: a big question gets a priced proposal, not a guess", prop?.kind === "creators" && prop?.credits === 900, JSON.stringify(prop || {}).slice(0, 80));
const thread2 = s.one?.("start")?.threadId;

s = await stream("/api/intel/ask", { question: "", brand, targets });
check("A11 ask: an empty question is refused without a charge", s.status === 400);

s = await stream("/api/intel/ask", { question: "hello", threadId: "00000000-0000-0000-0000-000000000000", brand, targets });
check("A12 ask: someone else's (or a missing) conversation is not found", s.status === 404);

t = await get("/api/intel/threads");
check("A13 threads: lists both conversations, newest first", t.body?.threads?.length === 2 && t.body.threads[0].id === thread2, `${t.body?.threads?.length}`);

/* ------------------------------------------------------------- reports */
let c0 = await credits();
s = await stream("/api/intel/report", { kind: "trends", brand, targets });
check("R1 report: the first one is free", s.one?.("start")?.free === true && s.one("start").charged === 0);
check("R2 report: streams its steps and finishes", s.of("step").length >= 3 && s.one("done"), `${s.of("step").length} steps`);
const rid = s.one?.("start")?.reportId;
let r = await get(`/api/intel/report?id=${rid}`);
const ideas = r.body?.report?.body?.ideas || [];
check("R3 report: saved ready, with summary, sections, charts, and up to 5 grounded ideas", r.body?.report?.status === "ready" && r.body.report.body?.summary && r.body.report.body.sections?.length && ideas.length <= 5 && ideas.every((i) => /posts|accounts/.test(i.why)) && r.body.report.body.charts, `${ideas.length} ideas`);
check("R4 report: credits untouched by the free one", (await credits()) === c0);
a = await get("/api/account");
check("R5 account: the free report is used up", a.body?.welcomeReport === false);

s = await stream("/api/intel/report", { kind: "playbook", brand, targets });
check("R6 report: the second costs 600", s.one?.("start")?.charged === 600 && s.one("done"), `${s.one?.("start")?.charged}`);
check("R7 report: credits went down by 600", (await credits()) === c0 - 600);

s = await stream("/api/intel/report", { kind: "competitors", brand: { ...brand, intel: { ...brand.intel, competitors: {} } }, targets: {} });
check("R8 report: competitors without handles asks for one, no charge", s.status === 400 && /competitor/i.test(s.body?.error?.message || ""), s.body?.error?.message);
check("R9 report: and kept the credits", (await credits()) === c0 - 600);

s = await stream("/api/intel/report", { kind: "competitors", brand, targets });
check("R10 report: competitor breakdown runs on the brand's handles", s.one?.("done") && s.one("start").charged === 600);

s = await stream("/api/intel/report", { kind: "audience", brand, targets });
check("R11 report: audience voice runs", Boolean(s.one?.("done")));

c0 = await credits();
s = await stream("/api/intel/report", { kind: "creators", brand, targets });
const crid = s.one?.("start")?.reportId;
check("R12 report: creator shortlist costs 900", s.one?.("start")?.charged === 900 && s.one("done"));
r = await get(`/api/intel/report?id=${crid}`);
const creators = r.body?.report?.body?.data?.creators || [];
check("R13 report: creators ranked with fit and recent-post checks", creators.length > 0 && creators[0].fit != null, `${creators.length} creators`);

c0 = await credits();
s = await stream("/api/intel/report", { kind: "playbook", params: { platform: "youtube" }, brand: { ...brand, intel: { ...brand.intel, keywords: ["#fail"], competitors: {} } }, targets: {} });
const c1 = await credits();
check("R14 report: a report that finds nothing is refunded", s.one?.("error")?.code === "no_data" && s.one("error").refunded && c1 === c0, `${s.one?.("error")?.code || "done"} ${c0}→${c1}`);
r = await get(`/api/intel/report?id=${s.one?.("start")?.reportId}`);
check("R14b report: and it's marked failed, not left running", r.body?.report?.status === "failed");

r = await get("/api/intel/report");
check("R15 reports: listed with kinds", r.body?.reports?.length >= 6 && r.body?.kinds?.trends);

/* ------------------------------------------------------------- contact */
c0 = await credits();
let ct = await post("/api/intel/contact", { handle: creators[0]?.handle || "somecreator" });
check("C1 contact: 20 credits, or refunded when there's none", ct.body?.found ? ct.body.credits === c0 - 20 : ct.body?.refunded && ct.body.credits === c0, JSON.stringify(ct.body).slice(0, 90));
ct = await post("/api/intel/contact", { handle: "bad handle!" });
check("C2 contact: a bad handle is refused", ct.status === 400);

/* ------------------------------------------------------------ findings */
let f = await get("/api/intel/findings");
check("F1 findings: the library holds what was learned", f.body?.findings?.length >= 5, `${f.body?.findings?.length}`);

/* -------------------------------------------------------------- ground */
s = await stream("/api/studio/ground", { type: "creative", platform: "instagram", brand, targets });
const pack = s.one?.("pack")?.pack;
// A pattern leads only when five or more accounts show it at 1.2x or better;
// otherwise the piece follows general practice and says so (Thin).
const leadOk = (p) => (p?.pattern ? (p.pattern.authors ?? 0) >= 5 && (p.pattern.strength ?? 0) >= 1.2 && p.proof.label !== "Thin" : p?.proof?.label === "Thin");
check("G1 ground: a proof score, and a lead pattern only when the evidence clears the bar", pack?.proof?.score >= 0 && leadOk(pack), `${pack?.proof?.score} ${pack?.proof?.label} ${pack?.pattern ? `${pack.pattern.hookLabel} ${pack.pattern.strength}x, ${pack.pattern.authors} accounts` : "no pattern"}`);
check("G1b ground: the pack is sealed so it can't be altered in the browser", typeof pack?.sig === "string" && pack.sig.length > 20);
let tampered = await post("/api/studio/text", { platform: "instagram", pack: { ...pack, proof: { score: 99, label: "Strong", reasons: [] } }, brand, targets });
check("G1c ground: an altered pack is refused", tampered.status === 400, `${tampered.status}`);
check("G2 ground: says what it already knew vs researched", Array.isArray(pack?.needs) && pack.needs.every((n) => n.status), JSON.stringify(pack?.needs?.map((n) => `${n.kind}:${n.status}`)));
const reelGround = await stream("/api/studio/ground", { type: "reel", platform: "instagram", brand, targets });
const rp = reelGround.one?.("pack")?.pack;
check("G3 ground: a reel pack covers hooks, length, examples, sounds, trends", rp?.needs?.length === 5, JSON.stringify(rp?.needs?.map((n) => `${n.kind}:${n.status}`)));
check("G3b ground: the reel pack's lead pattern clears the bar or says Thin", leadOk(rp), `${rp?.proof?.label} ${rp?.pattern ? `${rp.pattern.strength}x, ${rp.pattern.authors} accounts` : "no pattern"}`);
s = await stream("/api/studio/ground", { type: "nonsense", brand, targets });
check("G4 ground: an unknown type is refused", s.status === 400);

/* ---------------------------------------------------------------- text */
let tx = await post("/api/studio/text", { platform: "instagram", pack, brand, targets, topic: "morning routine" });
check("T1 text: writes and saves a post", tx.body?.item?.kind === "text" && tx.body.item.body?.text?.length > 20);
const textId = tx.body?.item?.id;
tx = await post("/api/studio/text", { platform: "linkedin", pack, brand, targets, itemId: textId });
check("T2 text: rewriting keeps the earlier version", tx.body?.item?.body?.versions?.length === 1);
tx = await post("/api/studio/text", { platform: "myspace", pack, brand, targets });
check("T3 text: an unknown platform is refused", tx.status === 400);
// The 30-a-day line: fill today up with stand-in rows, then the next post is refused.
const filler = Array.from({ length: 30 }, () => ({ user_id: UID, kind: "text:qa-fill", model: "qa", mock: true, usd: 0 }));
await rest("ai_usage", { method: "POST", body: JSON.stringify(filler) });
tx = await post("/api/studio/text", { platform: "instagram", pack, brand, targets });
check("T4 text: the 31st post of the day is refused", tx.status === 429 && tx.body?.error?.code === "text_fair_use", `${tx.status} ${JSON.stringify(tx.body?.error)?.slice(0, 80)}`);
await rest(`ai_usage?user_id=eq.${UID}&kind=eq.text:qa-fill`, { method: "DELETE" });

/* ------------------------------------------------------------ creative */
let cr = await post("/api/studio/creative", { action: "concepts", pack, brand, targets, topic: "sensitive skin myths" });
const crId = cr.body?.item?.id;
check("K1 creative: three concepts, saved as a draft, not yet counted", cr.body?.item?.body?.concepts?.length === 3 && !cr.body.item.counted);
cr = await post("/api/studio/creative", { action: "concepts", itemId: crId, pack, brand, targets });
check("K2 creative: more ideas add three new ones", cr.body?.item?.body?.concepts?.length === 6 && new Set(cr.body.item.body.concepts.map((c) => c.headline)).size === 6);
a = await get("/api/account");
check("K3 creative: ideas don't use the allowance", a.body?.allowances?.creative?.used === 0);
cr = await post("/api/studio/creative", { action: "visual", itemId: crId, conceptIndex: 0, source: "ai", brand });
check("K4 creative: the first visual is made", cr.body?.item?.body?.visuals?.length === 1 && cr.body.item.body.visuals[0].url);
a = await get("/api/account");
check("K5 creative: and it counts one creative", a.body?.allowances?.creative?.used === 1, `${a.body?.allowances?.creative?.used}`);
cr = await post("/api/studio/creative", { action: "visual", itemId: crId, conceptIndex: 1, source: "design", brand });
a = await get("/api/account");
check("K6 creative: a second visual doesn't count again", a.body?.allowances?.creative?.used === 1 && cr.body?.item?.body?.visuals?.length === 2);
cr = await post("/api/studio/creative", { action: "save", itemId: crId, patch: { headline: "Edited headline", theme: "dark", exported: true, counted: false } });
check("K7 creative: edits save; status ready after export; can't un-count", cr.body?.item?.body?.headline === "Edited headline" && cr.body.item.status === "ready" && cr.body.item.counted === true);
await post("/api/studio/creative", { action: "visual", itemId: crId, conceptIndex: 2, source: "design", brand });
await post("/api/studio/creative", { action: "visual", itemId: crId, conceptIndex: 3, source: "design", brand });
cr = await post("/api/studio/creative", { action: "visual", itemId: crId, conceptIndex: 4, source: "design", brand });
check("K8 creative: a 5th visual is refused with a clear reason", cr.status === 402 && /4 visuals/.test(cr.body?.error?.message || ""), cr.body?.error?.message);
cr = await post("/api/studio/creative", { action: "visual", itemId: crId, conceptIndex: 0, source: "upload", uploadPath: "someone-else/photos/x.jpg", brand });
check("K9 creative: can't use another person's upload", cr.status === 400 || cr.status === 402);

/* ------------------------------------------------------------ carousel */
s = await stream("/api/studio/ground", { type: "carousel", platform: "instagram", brand, targets });
const cpack = s.one?.("pack")?.pack;
let ca = await post("/api/studio/carousel", { action: "outline", pack: cpack, brand, targets, slides: 7 });
const caId = ca.body?.item?.id;
const slides = ca.body?.item?.body?.slides || [];
check("S1 carousel: outline with a hook first and a CTA last", slides.length >= 5 && slides[0].layout === "hook" && slides.at(-1).layout === "cta", slides.map((x) => x.layout).join(","));
a = await get("/api/account");
check("S2 carousel: outlining doesn't use the allowance", a.body?.allowances?.carousel?.used === 0);
ca = await post("/api/studio/carousel", { action: "generate", itemId: caId, slides: slides.slice(0, 2), brand });
check("S3 carousel: fewer than 3 slides is refused", ca.status === 400 && /3 slides/.test(ca.body?.error?.message || ""));
a = await get("/api/account");
check("S4 carousel: and nothing was counted", a.body?.allowances?.carousel?.used === 0);
ca = await post("/api/studio/carousel", { action: "generate", itemId: caId, slides, brand });
check("S5 carousel: generated, counted once", ca.body?.item?.body?.generated === true && ca.body.item.counted);
a = await get("/api/account");
check("S6 carousel: allowance shows one used", a.body?.allowances?.carousel?.used === 1);
const imgSlide = (ca.body?.item?.body?.slides || []).findIndex((x) => x.image);
check("S7 carousel: up to 2 slide photos made", (ca.body?.item?.body?.slides || []).filter((x) => x.image).length <= 2);
let redo = { status: 0 };
for (let i = 0; i < 4; i++) redo = await post("/api/studio/carousel", { action: "image", itemId: caId, slideIndex: Math.max(0, imgSlide), brand });
check("S8 carousel: a 4th photo redo is refused", redo.status === 402 && /3 photo redos/.test(redo.body?.error?.message || ""), redo.body?.error?.message);
ca = await post("/api/studio/carousel", { action: "outline", itemId: caId, pack: cpack, brand, targets });
check("S9 carousel: a generated carousel can't be re-outlined", ca.status === 400);

/* --------------------------------------------------------------- items */
let it = await get("/api/studio/items");
check("I1 library: lists the text post, creative and carousel", it.body?.items?.length === 3, `${it.body?.items?.length}`);
it = await post("/api/studio/items", { id: textId, title: "Renamed", body: { text: "Edited by hand" } }, "patch");
check("I2 library: rename and hand edits save", it.body?.item?.title === "Renamed" && it.body.item.body.text === "Edited by hand");

/* --------------------------------------------------------------- reels */
s = await stream("/api/studio/reels", { action: "brief", platform: "instagram", brand, targets, request: { goal: "Sales", topic: "3 signs your skin barrier is damaged", style: "faceless", cta: "Shop the barrier cream", references: ["https://www.instagram.com/reel/abc/", "not a link"] } });
const draft = s.one?.("reel")?.reel;
check("V1 reel: brief streams grounding, history and the brief", s.of("step").some((e) => e.id === "history") && draft?.brief?.hooks?.length === 3);
check("V2 reel: it reads the conversations and findings", /Read \d+ conversations and \d+ findings/.test(s.of("step").find((e) => e.id === "history" && e.status === "done")?.label || ""));
check("V3 reel: draft isn't counted; bad links dropped", draft?.status === "draft" && !draft.counted && draft.request?.references?.length === 1);
let v = await post("/api/studio/reels", { action: "submit", reelId: draft?.id, hookIndex: 1, notes: "Use our pastel palette" });
check("V4 reel: submitting requests it, due in about 24 hours", v.body?.reel?.status === "requested" && Math.abs(new Date(v.body.reel.due_at) - Date.now() - 86400000) < 600000);
check("V5 reel: chosen hook and notes kept", v.body?.reel?.request?.chosenHook === 1 && /pastel/.test(v.body?.reel?.request?.notes || ""));
a = await get("/api/account");
check("V6 reel: one reel used", a.body?.allowances?.reel?.used === 1);
v = await post("/api/studio/reels", { action: "submit", reelId: draft?.id });
a = await get("/api/account");
check("V7 reel: submitting twice doesn't count twice", a.body?.allowances?.reel?.used === 1);
v = await post("/api/studio/reels", { action: "cancel", reelId: draft?.id });
a = await get("/api/account");
check("V8 reel: cancelling before production gives it back", v.body?.reel?.status === "cancelled" && a.body?.allowances?.reel?.used === 0);

s = await stream("/api/studio/reels", { action: "brief", platform: "instagram", brand, targets, request: { topic: "Barrier repair in 20 seconds", style: "text" } });
const reel2 = s.one?.("reel")?.reel;
v = await post("/api/studio/reels", { action: "submit", reelId: reel2?.id });
const adm = await get("/api/admin");
check("V9 admin: the queue shows the reel", adm.body?.queue?.some((q) => q.id === reel2?.id));
v = await post("/api/admin", { action: "reel_start", id: reel2?.id });
check("V10 admin: production starts", v.body?.reel?.status === "in_production");
v = await post("/api/studio/reels", { action: "cancel", reelId: reel2?.id });
check("V11 reel: can't cancel once it's being made", v.status === 400 && /being made/.test(v.body?.error?.message || ""));
const up = await post("/api/admin", { action: "reel_upload_url", id: reel2?.id });
check("V12 admin: upload link for the video", up.body?.uploadUrl && up.body.path.includes(reel2?.id));
if (up.body?.uploadUrl) {
  const mp4 = Buffer.from("00000018667479706d703432000000006d7034326d703431", "hex");
  const put = await fetch(up.body.uploadUrl, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: mp4 });
  check("V13 admin: the video uploads to private storage", put.ok, `${put.status}`);
}
v = await post("/api/admin", { action: "reel_deliver", id: reel2?.id, path: up.body?.path, caption: "Barrier repair, fast." });
check("V14 admin: delivered", v.body?.reel?.status === "delivered");
v = await get(`/api/studio/reels?id=${reel2?.id}`);
check("V15 reel: the person gets a private video link", v.body?.reel?.status === "delivered" && /token=/.test(v.body.reel.videoUrl || ""));
v = await post("/api/studio/reels", { action: "results", reelId: reel2?.id, url: "https://www.instagram.com/reel/XYZ123/", views: 2400 });
check("V16a results: without a posting date it asks for one, and doesn't call it yet", v.body?.needsDate === true && v.body?.reel?.results?.worked === false);
v = await post("/api/studio/reels", { action: "results", reelId: reel2?.id, url: "https://www.instagram.com/reel/XYZ123/", views: 2400, postedAt: new Date(Date.now() - 2 * 86400000).toISOString() });
check("V16 results: 2,400 views two days after posting marks it worked", v.body?.reel?.results?.worked === true && v.body.reel.results.weekBest === 2400);
v = await post("/api/admin", { action: "reel_get", id: reel2?.id });
v = await post("/api/studio/reels", { action: "revise", reelId: reel2?.id, note: "Make the first line bigger" });
check("V17 reel: one free revision goes back to the queue", v.body?.reel?.status === "revision_requested" && v.body.reel.revisions_used === 1);
await post("/api/admin", { action: "reel_deliver", id: reel2?.id, path: up.body?.path });
v = await post("/api/studio/reels", { action: "revise", reelId: reel2?.id, note: "Again please" });
check("V18 reel: a second revision is refused", v.status === 400 && /revision/.test(v.body?.error?.message || ""));
a = await get("/api/account");
check("V19 reel: still one reel used after the revision", a.body?.allowances?.reel?.used === 1);

// A reel delivered more than 48 hours late goes back into the allowance.
s = await stream("/api/studio/reels", { action: "brief", platform: "tiktok", brand, targets, request: { topic: "Late one", style: "talking" } });
const reel3 = s.one?.("reel")?.reel;
await post("/api/studio/reels", { action: "submit", reelId: reel3?.id });
await rest(`reel_requests?id=eq.${reel3?.id}`, { method: "PATCH", body: JSON.stringify({ due_at: new Date(Date.now() - 25 * 3600000).toISOString(), counted_at: new Date(Date.now() - 49 * 3600000).toISOString() }) });
v = await get(`/api/studio/reels?id=${reel3?.id}`);
a = await get("/api/account");
check("V20 reel: 48 hours late gives the reel back, once", v.body?.reel?.request?.lateRefunded === true && a.body?.allowances?.reel?.used === 1, `${a.body?.allowances?.reel?.used}`);

/* --------------------------------------------------------- limits/plan */
await rest(`accounts?user_id=eq.${UID}`, { method: "PATCH", body: JSON.stringify({ credits: 50 }) });
s = await stream("/api/intel/ask", { question: "What's working?", brand, targets });
check("L1 credits: a question with 50 credits left is refused", s.status === 402 && s.body?.error?.code === "no_credits");
t = await get("/api/intel/threads");
check("L2 credits: and leaves no empty conversation behind", t.body?.threads?.length === 2, `${t.body?.threads?.length}`);
await rest(`accounts?user_id=eq.${UID}`, { method: "PATCH", body: JSON.stringify({ credits: 20000 }) });

// Twenty questions at once with credits for five: never below zero.
await rest(`accounts?user_id=eq.${UID}`, { method: "PATCH", body: JSON.stringify({ credits: 500 }) });
const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => stream("/api/intel/ask", { question: `What's working ${i}?`, brand, targets })));
const ok = burst.filter((b) => b.one?.("start")).length;
const refused = burst.filter((b) => b.status === 402).length;
const left = await credits();
check("L3 stress: 20 parallel questions with credits for 5 → exactly 5 run", ok === 5 && refused === 15 && left === 0, `${ok} ran, ${refused} refused, ${left} left`);
await rest(`accounts?user_id=eq.${UID}`, { method: "PATCH", body: JSON.stringify({ credits: 20000 }) });

// The allowance under a burst: 12 creatives claimed at once with 9 left.
const fresh = [];
for (let i = 0; i < 12; i++) {
  const c = await post("/api/studio/creative", { action: "concepts", pack, brand, targets });
  if (c.body?.item?.id) fresh.push(c.body.item.id);
}
const claims = await Promise.all(fresh.map((id) => post("/api/studio/creative", { action: "visual", itemId: id, conceptIndex: 0, source: "design", brand })));
a = await get("/api/account");
const made = claims.filter((x) => x.status === 200).length;
check("L4 stress: 12 creatives at once with 9 left → exactly 9 made", made === 9 && a.body?.allowances?.creative?.used === 10, `${made} made, ${a.body?.allowances?.creative?.used} used`);
const blocked = await post("/api/studio/creative", { action: "concepts", pack, brand, targets });
check("L5 allowance: a new creative after 10 says when it resets", blocked.status === 402 && /reset/.test(blocked.body?.error?.message || ""), blocked.body?.error?.message);

// Intelligence plan: no studio.
await resetAccount({ plan: "tier1" });
cr = await post("/api/studio/creative", { action: "concepts", pack, brand, targets });
check("L6 plan: Intelligence can't make content", cr.status === 402 && cr.body?.error?.code === "studio_only");
s = await stream("/api/intel/ask", { question: "What's working on tiktok?", brand, targets });
check("L7 plan: Intelligence can ask", Boolean(s.one?.("done")));
a = await get("/api/account");
check("L8 plan: Intelligence shows no allowances", a.body?.plan === "tier1" && a.body?.allowances === null);

// No plan: everything paid is closed, setup stays open.
await rest(`accounts?user_id=eq.${UID}`, { method: "PATCH", body: JSON.stringify({ plan: null, credits: 0, period_start: null, period_end: null }) });
s = await stream("/api/intel/ask", { question: "Hi", brand, targets });
check("L9 plan: without a plan, asking is closed", s.status === 402 && s.body?.error?.code === "no_plan");
let pr = await post("/api/account", { action: "request_plan", plan: "tier2", note: "QA" });
check("L10 plan: requesting Studio waits for approval", pr.body?.request?.status === "pending" && pr.body?.account?.pendingRequest?.plan === "tier2");
pr = await post("/api/account", { action: "request_plan", plan: "tier1" });
const pending = await rest(`plan_requests?user_id=eq.${UID}&status=eq.pending`);
check("L11 plan: asking again changes the one request", pending.length === 1 && pending[0].plan === "tier1");
const dec = await post("/api/admin", { action: "decide_request", id: pending[0]?.id, approve: true });
a = await get("/api/account");
check("L12 admin: approving starts the plan with a fresh month", dec.body?.ok && a.body?.plan === "tier1" && a.body?.credits === 20000);

const ov = await get("/api/admin");
check("L13 admin: overview has accounts, seats, hit rate and spend", ov.body?.accounts?.length && ov.body?.seats?.limit && ov.body?.reelHitRate && ov.body?.spend30d);

/* ------------------------------------------------------------- cleanup */
await resetAccount();
await rest(`content_items?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`reel_requests?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`intel_threads?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`intel_reports?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`intel_findings?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`plan_requests?user_id=eq.${UID}`, { method: "DELETE" });
if (up.body?.path) await fetch(`${SB}/storage/v1/object/reels/${up.body.path}`, { method: "DELETE", headers: H });
await browser.close();

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("Failed:");
  for (const x of failed) console.log(`  ${x.name}  ${x.detail}`);
  process.exitCode = 1;
}
