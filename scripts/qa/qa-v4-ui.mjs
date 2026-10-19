// Every v4 flow, clicked through in a real browser on the stand-in model, as
// the QA account. Written from the intended design: what the person should
// see, what each step costs, and what must not happen.
//
//   HUESY_AI_MOCK=1 ADMIN_EMAILS=qa.huesy@example.com npx next start -p 4311
//   BASE=http://localhost:4311 QA_PASSWORD=... SB_URL=... SB_KEY=... node scripts/qa/qa-v4-ui.mjs
//
// It resets the QA account to a fresh Studio month first and cleans up after.
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
import { mkdirSync, readFileSync, statSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:4311";
const EMAIL = process.env.QA_EMAIL || "qa.huesy@example.com";
const PASSWORD = process.env.QA_PASSWORD;
const SB = process.env.SB_URL;
const KEY = process.env.SB_KEY;
const OUT = process.env.QA_OUT || "/tmp/huesy-qa/v4-ui/";
const PHASE = process.env.PHASE || "all";
if (!PASSWORD || !SB || !KEY) throw new Error("Set QA_PASSWORD, SB_URL and SB_KEY");
mkdirSync(OUT, { recursive: true });
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const rest = (path, init = {}) => fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } }).then(async (r) => (r.status === 204 ? null : r.json().catch(() => null)));
const users = await (await fetch(`${SB}/auth/v1/admin/users?per_page=200`, { headers: H })).json();
const UID = users.users.find((u) => u.email === EMAIL)?.id;
if (!UID) throw new Error("No QA account");

async function fresh(plan = "tier2") {
  for (const t of ["content_items", "reel_requests", "intel_threads", "intel_reports", "intel_findings", "plan_requests"]) await rest(`${t}?user_id=eq.${UID}`, { method: "DELETE" });
  // Stand-in usage rows count toward the 30-a-day text line; repeated runs would hit it.
  await rest(`ai_usage?user_id=eq.${UID}&mock=eq.true`, { method: "DELETE" });
  await rest(`accounts?on_conflict=user_id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: UID, email: EMAIL, plan, period_end: null, welcome_report_used: false }) });
  if (!plan) await rest(`accounts?user_id=eq.${UID}`, { method: "PATCH", body: JSON.stringify({ plan: null, credits: 0, period_start: null, period_end: null }) });
}

const browser = await chromium.launch();
const errors = [];
async function open(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem("huesy:utm", JSON.stringify({ utm: { utm_source: "qa-site" }, referrer: "" }));
    } catch {}
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|status of 40[1-4]|status of 402/.test(m.text())) errors.push(`console ${page.url()}: ${m.text().slice(0, 240)}`);
  });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/(home|waitlist|onboarding|plans)/, { timeout: 20000 });
  return { ctx, page };
}
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}${name}.png`, fullPage });
const visible = (loc, t = 10000) => loc.first().waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const credits = async () => (await rest(`accounts?user_id=eq.${UID}&select=credits`))?.[0]?.credits;
const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${label}: no sideways scroll`, o <= 0, o > 0 ? `${o}px` : "");
};

/* --------------------------------------------- 1: Today and the playbook */
if (PHASE === "all" || PHASE === "today") {
  await fresh();
  const { ctx, page } = await open();
  await page.goto(`${BASE}/home`, { waitUntil: "networkidle" });
  check("T1 Today offers the free first playbook", await visible(page.getByRole("button", { name: /Make my playbook/ })));
  // v5: the briefing covers every platform where the market talks.
  check("T2 Today shows the weekly briefing", await visible(page.getByText(/This week in your market|This week on /), 20000));
  check("T3 Today has quick actions to every flow", await visible(page.getByRole("link", { name: "Ask a question" })) && (await page.getByRole("link", { name: /Request a reel/ }).count()) > 0);
  await shot(page, "T-today");
  await page.getByRole("button", { name: /Make my playbook/ }).click();
  check("T4 the setup sheet says it's free", await visible(page.getByRole("dialog").getByText("Your first report is on Huesy.")));
  await page.getByRole("dialog").getByRole("button", { name: /Run report/ }).click();
  await page.waitForURL(/\/insights\/reports\//, { timeout: 15000 });
  check("T5 running shows Huesy at work", await visible(page.getByText(/Working on your content playbook|Ideas to make/)));
  check("T6 the report finishes with ideas", await visible(page.getByRole("heading", { name: "Ideas to make" }), 40000));
  check("T7 it has the numbers", await visible(page.getByText("Reach by opening")));
  check("T8 free, and credits untouched", (await credits()) === 20000 && (await visible(page.getByText("Free"))));
  const makeHref = await page.getByRole("link", { name: "Make this" }).first().getAttribute("href");
  check("T9 each idea opens Studio with its opening and the evidence", /\/studio\/\w+\?topic=.+&from=/.test(makeHref || ""), makeHref);
  await shot(page, "T-report");
  await page.goto(`${BASE}/home`, { waitUntil: "networkidle" });
  check("T10 the free playbook offer is gone once used", !(await visible(page.getByRole("button", { name: /Make my playbook/ }), 2500)));
  await page.goto(`${BASE}/insights/knowledge`, { waitUntil: "networkidle" });
  check("T11 What I know lists what the report learned", await visible(page.getByRole("heading", { name: "What works" })));
  await shot(page, "T-knowledge");
  await ctx.close();
}

/* ------------------------------------------------------------- 2: Ask */
if (PHASE === "all" || PHASE === "ask") {
  if (PHASE === "ask") await rest(`intel_threads?user_id=eq.${UID}`, { method: "DELETE" });
  const { ctx, page } = await open();
  const before = await credits();
  await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
  await page.fill("#ask-input", "hello");
  await page.keyboard.press("Enter");
  check("A1 a hello gets a free friendly reply", await visible(page.getByText(/Ask me about your market/)));
  check("A2 and costs nothing", (await credits()) === before);
  await page.locator("main").getByRole("button", { name: /What's working on/ }).last().click();
  check("A2b a suggestion fills the box instead of spending", (await page.inputValue("#ask-input")).startsWith("What's working on") && (await credits()) === before);
  await page.getByRole("button", { name: /^Ask/ }).click();
  check("A3 the answer streams with Huesy's steps", await visible(page.getByText(/Checking what I already know|Found \d+ things/)));
  check("A4 the answer lands with posts behind it", await visible(page.getByText("Posts behind this"), 30000));
  check("A5 and ways to make content from it", await visible(page.getByText("Make from this")));
  check("A6 it cost 100 credits", (await credits()) === before - 100, `${before}→${await credits()}`);
  check("A7 the conversation appears in the list", await visible(page.getByRole("button", { name: /What's working on/ }).nth(0)));
  await shot(page, "A-answer");
  await page.fill("#ask-input", "Which creators should we work with?");
  await page.keyboard.press("Enter");
  check("A8 a big question offers a priced report", await visible(page.getByRole("button", { name: /Run it/ }), 30000) && (await visible(page.getByText(/900 credits/))));
  await page.getByRole("button", { name: /Run it/ }).click();
  await page.waitForURL(/\/insights\/reports\//, { timeout: 15000 });
  check("A9 the creator shortlist runs", await visible(page.getByRole("heading", { name: "Ranked by fit" }), 40000));
  const c0 = await credits();
  await page.getByRole("button", { name: /Get contact/ }).first().click();
  await page.waitForTimeout(1500);
  const c1 = await credits();
  check("A10 a contact costs 20 credits, or nothing when there's none", c1 === c0 - 20 || c1 === c0, `${c0}→${c1}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const kept = (await page.getByRole("link", { name: /@/ }).filter({ hasText: /@\w/ }).count()) > 0 || (await page.getByText("No public contact").count()) > 0;
  check("A11 the contact is kept on the report after a reload", kept);
  await shot(page, "A-creators");
  const download = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
  await page.getByRole("button", { name: /Download CSV/ }).click();
  const csv = await download;
  check("A12 creators download as CSV", Boolean(csv) && /\.csv$/.test(csv?.suggestedFilename() || ""));
  // Stopping an answer is free.
  const s0 = await credits();
  await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
  await page.fill("#ask-input", "What's trending on tiktok this week? #slow");
  const lastId = (await rest(`credit_ledger?user_id=eq.${UID}&select=id&order=id.desc&limit=1`))?.[0]?.id || 0;
  await page.keyboard.press("Enter");
  // Stop opens once the answer has really started (and been paid for).
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Stop" && !b.disabled), null, { timeout: 10000 });
  const charged = await credits();
  const stoppedAt = Date.now();
  await page.getByRole("button", { name: "Stop" }).click();
  let back = await credits();
  for (let i = 0; i < 16 && back !== s0; i++) {
    await page.waitForTimeout(250);
    back = await credits();
  }
  check("A13 stopping an answer gives the credits back", charged === s0 - 100 && back === s0, `${s0}→${charged}→${back}`);
  check("A13c and quickly, not after the answer would have finished", Date.now() - stoppedAt < 3000, `${Date.now() - stoppedAt} ms`);
  const asks = await rest(`credit_ledger?user_id=eq.${UID}&reason=eq.ask&id=gt.${lastId}&select=id`);
  check("A13b and the question was only sent once", (asks || []).length === 1, `${(asks || []).length} sent`);
  check("A14 and puts the question back to send again", (await page.inputValue("#ask-input")).includes("trending"));
  await ctx.close();
}

/* -------------------------------------------------------- 3: creative */
if (PHASE === "all" || PHASE === "creative") {
  const { ctx, page } = await open();
  await page.goto(`${BASE}/studio/creative`, { waitUntil: "networkidle" });
  await page.fill("#st-topic", "sensitive skin myths");
  await page.getByRole("button", { name: /Find what works and write 3 ideas/ }).click();
  check("K1 grounding narrates, then 3 ideas", await visible(page.getByRole("heading", { name: "Pick an idea" }), 30000));
  check("K2 the proof card says what it's built on", await visible(page.getByText(/openings .* reach about|general best practice/)));
  check("K3 the URL now points at the saved draft", await page.waitForURL(/\/studio\/creative\?id=/, { timeout: 5000 }).then(() => true).catch(() => false));
  await shot(page, "K-ideas");
  const used0 = (await rest(`content_items?user_id=eq.${UID}&kind=eq.creative&counted=eq.true&select=id`))?.length || 0;
  await page.getByRole("button", { name: /Use this idea/ }).first().click();
  check("K4 the picture sheet says it uses a creative", await visible(page.getByRole("dialog").getByText(/Uses 1 of your 10 creatives/)));
  await page.getByRole("dialog").getByRole("button", { name: "Make it" }).click();
  check("K5 the editor opens with the design", await visible(page.getByRole("img", { name: /Your creative/ }), 20000));
  const used1 = (await rest(`content_items?user_id=eq.${UID}&kind=eq.creative&counted=eq.true&select=id`))?.length || 0;
  check("K6 now it counts, once", used1 === used0 + 1);
  await page.fill("#cr-head", "Your skin isn't broken");
  await page.getByRole("button", { name: "Words only" }).click();
  await page.getByRole("button", { name: "Ink" }).click();
  await page.waitForTimeout(1500);
  check("K7 edits save themselves", await visible(page.getByText("Saved")));
  await shot(page, "K-editor", false);
  const dl = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
  await page.getByRole("button", { name: /Download PNG/ }).click();
  const png = await dl;
  let size = 0;
  if (png) {
    const p = `${OUT}creative.png`;
    await png.saveAs(p);
    size = statSync(p).size;
    const head = readFileSync(p).subarray(0, 24);
    const w = head.readUInt32BE(16);
    const h = head.readUInt32BE(20);
    check("K8 the PNG is full size, 1080 by 1350", w === 1080 && h === 1350, `${w}x${h}, ${Math.round(size / 1024)} KB`);
  } else check("K8 the PNG is full size, 1080 by 1350", false, "no download");
  check("K9 downloading marks it ready", await visible(page.getByText("Ready").first()));
  await page.getByRole("button", { name: "Another picture" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Use words and colour/ }).click();
  await page.waitForTimeout(1500);
  const used2 = (await rest(`content_items?user_id=eq.${UID}&kind=eq.creative&counted=eq.true&select=id`))?.length || 0;
  check("K10 another picture doesn't count again", used2 === used1);
  await page.reload({ waitUntil: "networkidle" });
  check("K11 a reload keeps the edits", (await page.inputValue("#cr-head").catch(() => "")) === "Your skin isn't broken");
  await ctx.close();
}

/* -------------------------------------------------------- 4: carousel */
if (PHASE === "all" || PHASE === "carousel") {
  const { ctx, page } = await open();
  await page.goto(`${BASE}/studio/carousel`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Find what works and outline it/ }).click();
  check("S1 the outline arrives", await visible(page.getByRole("heading", { name: "The outline" }), 30000));
  const n0 = await page.locator("ol > li").count();
  await page.getByRole("button", { name: "Move slide 2 down" }).click();
  await page.getByRole("button", { name: /Add a slide/ }).click();
  check("S2 slides can be moved and added", (await page.locator("ol > li").count()) === n0 + 1);
  await page.locator('input[id^="h-"]').first().fill("5 skincare myths to drop today");
  await page.waitForTimeout(1500);
  check("S3 outline edits save themselves", await visible(page.getByText("Saved")));
  check("S4 generating says it uses a carousel", await visible(page.getByText(/Uses 1 of your 10 carousels/)));
  await shot(page, "S-outline");
  await page.getByRole("button", { name: /Generate carousel/ }).click();
  check("S5 the slides render", await visible(page.getByRole("list", { name: "Slides" }), 30000));
  const slides = await page.getByRole("listitem").filter({ has: page.getByRole("img", { name: /^Slide/ }) }).count();
  check("S6 every slide is there", slides === n0 + 1, `${slides}`);
  check("S7 the first slide kept the edit", await visible(page.getByRole("img", { name: /Slide 1: 5 skincare myths/ })));
  await shot(page, "S-slides", false);
  const pdfDl = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
  await page.getByRole("button", { name: /Download PDF/ }).click();
  const pdf = await pdfDl;
  if (pdf) {
    await pdf.saveAs(`${OUT}carousel.pdf`);
    const bytes = readFileSync(`${OUT}carousel.pdf`);
    const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    check("S8 the PDF has one page per slide", pages === slides, `${pages} pages`);
  } else check("S8 the PDF has one page per slide", false, "no download");
  const zipDl = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
  await page.getByRole("button", { name: /Slides as PNGs/ }).click();
  const zip = await zipDl;
  check("S9 the slides download as a zip", Boolean(zip) && /\.zip$/.test(zip?.suggestedFilename() || ""));
  await page.getByRole("button", { name: "Edit slide 2" }).click();
  check("S10 a slide opens for editing", await visible(page.getByRole("dialog").getByText("Slide 2")));
  await page.keyboard.press("Escape");
  await ctx.close();
}

/* ------------------------------------------------------------ 5: text */
if (PHASE === "all" || PHASE === "text") {
  const { ctx, page } = await open();
  await page.goto(`${BASE}/studio/text`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "LinkedIn post" }).click();
  await page.getByRole("button", { name: /Find what works and write it/ }).click();
  check("X1 the post is written", await visible(page.getByRole("button", { name: "Copy all" }), 30000));
  await page.getByRole("button", { name: "Shorter" }).click();
  check("X2 a change keeps the earlier version", await visible(page.getByText(/Earlier versions \(1\)/), 15000));
  await page.getByRole("button", { name: "Copy all" }).click();
  check("X3 copying marks it ready", await visible(page.getByText("Copied")));
  const others = page.getByRole("button", { name: "X post" });
  await others.click();
  await page.waitForURL((u) => /\/studio\/text\?id=/.test(u.href), { timeout: 15000 });
  check("X4 it can be written again for another platform", await visible(page.getByText("X post")));
  await shot(page, "X-text");
  await ctx.close();
}

/* ------------------------------------------------------------- 6: reel */
if (PHASE === "all" || PHASE === "reel") {
  const { ctx, page } = await open();
  await page.goto(`${BASE}/studio/reel`, { waitUntil: "networkidle" });
  await page.fill("#rl-topic", "3 signs your skin barrier is damaged");
  await page.getByRole("button", { name: /Text on screen/ }).click();
  await page.getByRole("button", { name: /Build the brief/ }).click();
  check("V1 the brief reads the history and arrives", await visible(page.getByRole("heading", { name: "Pick the opening" }), 40000));
  await page.getByRole("radiogroup", { name: "Opening" }).getByRole("radio").nth(1).click();
  await page.fill("#rl-notes", "Keep it calm, pastel colours");
  check("V2 sending says it uses a reel", await visible(page.getByText(/Uses 1 of your 3 reels/)));
  await shot(page, "V-brief");
  await page.getByRole("button", { name: /Send it to be made/ }).click();
  check("V3 it's in the queue with a countdown", await visible(page.getByText(/Ready within \d+ h/), 15000));
  const reelId = new URL(page.url()).searchParams.get("id");
  await shot(page, "V-queued", false);
  // The owner makes it.
  const { ctx: actx, page: admin } = await open();
  await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  check("V4 the owner sees it in the queue", await visible(admin.getByRole("heading", { name: "Reel queue" })) && (await admin.getByRole("button", { name: "Open" }).count()) > 0);
  await admin.getByRole("button", { name: "Open" }).first().click();
  check("V5 the brief shows the chosen opening and notes", await visible(admin.getByRole("dialog").getByText(/Keep it calm/)));
  await admin.getByRole("button", { name: /Start making it/ }).click();
  await admin.waitForTimeout(800);
  const mp4 = Buffer.from("00000018667479706d703432000000006d7034326d703431", "hex");
  await admin.locator('input[type="file"][accept^="video"]').setInputFiles({ name: "reel.mp4", mimeType: "video/mp4", buffer: mp4 });
  await admin.getByRole("button", { name: "Deliver" }).click();
  check("V6 delivering works", await visible(admin.getByText(/Delivered\. They can watch it now/), 15000));
  await shot(admin, "V-admin");
  await actx.close();
  await page.goto(`${BASE}/studio/reel?id=${reelId}`, { waitUntil: "networkidle" });
  check("V7 the person sees it's ready, with the video", await visible(page.getByRole("heading", { name: "It's ready" })) && (await page.locator("video").count()) === 1);
  await page.fill("#rl-url", "https://www.instagram.com/reel/QA123/");
  await page.getByRole("button", { name: "Start tracking" }).click();
  check("V8 tracking asks for views when it can't read them, or reads them", await visible(page.getByText(/Type them in|views/), 15000));
  if (await visible(page.locator("#rl-views"), 2000)) {
    await page.fill("#rl-views", "2400");
    await page.getByRole("button", { name: /Check again|Start tracking/ }).click();
  }
  check("V9 2,400 views marks it working", await visible(page.getByText(/Passed 1,500 views/), 10000));
  await page.getByRole("button", { name: "Ask for a change" }).click();
  await page.fill("#rl-change", "Make the first line bigger");
  await page.getByRole("button", { name: "Send the change" }).click();
  const changed = await visible(page.getByText(/Your change is being made/), 10000);
  const alert = changed ? "" : await page.locator('[role="alert"]').allTextContents().then((a) => a.join(" | ")).catch(() => "");
  check("V10 a change goes back to the queue", changed, alert);
  await shot(page, "V-change", false);
  await ctx.close();
}

/* --------------------------------------------------- 7: plans and locks */
if (PHASE === "all" || PHASE === "plans") {
  await fresh("tier1");
  let { ctx, page } = await open();
  await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
  check("P1 Intelligence sees Studio locked, with seats left", await visible(page.getByText("Make content from what's working")) && (await visible(page.getByText(/Studio seats left/))));
  await page.goto(`${BASE}/studio/creative`, { waitUntil: "networkidle" });
  check("P2 a studio link opens a lock, not an error", await visible(page.getByText("Creatives are part of Studio")));
  await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /What's working on/ }).first().click();
  await page.getByRole("button", { name: /^Ask/ }).click();
  await visible(page.getByText("Make from this"), 30000);
  check("P3 Intelligence answers show Studio actions as locked", (await page.locator('a[href="/plans"]').filter({ hasText: "Creative" }).count()) === 1);
  await page.goto(`${BASE}/plans`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Switch to Studio" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Send request/ }).click();
  check("P4 asking for Studio shows it's waiting", await visible(page.getByText(/It starts as soon as it's approved/)));
  await shot(page, "P-plans-pending");
  await ctx.close();

  await fresh(null);
  ({ ctx, page } = await open());
  await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
  check("P5 without a plan, Ask explains and points to plans", await visible(page.getByText("Ask me anything about your market")) && (await visible(page.getByRole("link", { name: "See plans" }))));
  await page.goto(`${BASE}/home`, { waitUntil: "networkidle" });
  check("P6 Today leads with choosing a plan", await visible(page.getByText("Choose how you'd like to use Huesy")));
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  if ((await page.getByRole("button", { name: /Check now/ }).count()) > 0) {
    await page.getByRole("button", { name: /Check now/ }).first().click();
    check("P7 a watchlist check without a plan says why", await visible(page.getByText(/Pick a plan to use this/), 10000));
  }
  await shot(page, "P-noplan");
  await ctx.close();
  await fresh("tier2");
}

/* ------------------------------------------------------------ 8: phone */
if (PHASE === "all" || PHASE === "phone") {
  const { ctx, page } = await open({ width: 390, height: 844 });
  for (const path of ["/home", "/ask", "/insights", "/insights/knowledge", "/studio", "/studio/creative", "/studio/carousel", "/studio/reel", "/studio/text", "/plans", "/profile?tab=market", "/profile?tab=account"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    await noOverflow(page, `phone ${path}`);
  }
  await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
  const box = await page.locator("form").filter({ has: page.locator("#ask-input") }).boundingBox();
  const nav = await page.locator('nav[aria-label="Main"]').last().boundingBox();
  check("phone: the ask box sits above the tab bar", box && nav && box.y + box.height <= nav.y + 1, box && nav ? `${Math.round(box.y + box.height)} vs ${Math.round(nav.y)}` : "");
  await shot(page, "phone-ask", false);
  await ctx.close();
}

await browser.close();
console.log(errors.length ? `\nConsole:\n${[...new Set(errors)].join("\n")}` : "\nNo console errors");
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("Failed:");
  for (const x of failed) console.log(`  ${x.name}  ${x.detail}`);
  process.exitCode = 1;
}
