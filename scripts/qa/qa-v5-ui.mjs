// v5 screens, clicked through in a real browser on the stand-in, as the QA
// account. Each check is written from what the user found broken on 19 Oct
// (named in the check) and from the intended design, negatives included.
//
//   HUESY_AI_MOCK=1 ADMIN_EMAILS=qa.huesy@example.com npx next start -p 4311
//   BASE=http://localhost:4311 QA_PASSWORD=... SB_URL=... SB_KEY=... node scripts/qa/qa-v5-ui.mjs
//
// It resets the QA account to a fresh Studio month first and cleans up after.
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
import { mkdirSync, readFileSync, statSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:4311";
const EMAIL = process.env.QA_EMAIL || "qa.huesy@example.com";
const PASSWORD = process.env.QA_PASSWORD;
const SB = process.env.SB_URL;
const KEY = process.env.SB_KEY;
const OUT = process.env.QA_OUT || "/tmp/huesy-qa/v5-ui/";
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


const VENDORS = /treg|anyapi|harvest|tikhub|crawl4ai|influencers ?club|scrapecreators|litescrape|serpapi|dataforseo/i;
// Close a sheet and wait until it has really gone (its backdrop takes clicks while it fades).
const closeSheet = async (page) => {
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  await page.locator('div[role="presentation"].fixed').waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
};
await fresh("tier2");

/* ------------------------------------------------ 1: the new-report sheet */
{
  const { ctx, page } = await open();
  await page.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Content playbook/ }).first().click();
  const sheet = page.getByRole("dialog");
  check("U1 playbook sheet offers X and LinkedIn (complaint 1)", await visible(sheet.getByRole("radio", { name: "X" })) && (await sheet.getByRole("radio", { name: "LinkedIn" }).count()) > 0);
  check("U2 the sheet says what it will read before anyone pays", await visible(sheet.getByRole("region", { name: "What I'll read" }).getByText(/Recent .* posts/), 15000));
  await shot(page, "U-sheet-playbook", false);
  await closeSheet(page);
  await page.getByRole("button", { name: /Trend radar/ }).first().click();
  const allChecked = await sheet.getByRole("radio", { name: "All platforms", checked: true }).waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  check("U3 trend radar starts on all platforms (complaint 2, 6)", allChecked && (await sheet.getByRole("radio", { name: "Reddit" }).count()) > 0);
  await closeSheet(page);
  await page.getByRole("button", { name: /Competitor breakdown/ }).first().click();
  check("U4 competitor sheet has no platform picker: it covers every platform (complaint 3)", (await sheet.getByRole("radiogroup", { name: "Where" }).count()) === 0);
  await sheet.getByLabel("Competitors").fill("Glowlab, @dewdrop.notes, https://www.linkedin.com/company/brightside/");
  check("U5 names, @handles and links are all accepted", await sheet.getByRole("button", { name: /Run report/ }).isEnabled());
  check("U6 it says it reads ads, reviews and who talks about them", await visible(sheet.getByText(/Meta and LinkedIn ad libraries/)) && (await sheet.getByText(/Who talks about them/).count()) > 0);
  await shot(page, "U-sheet-competitors", false);
  await closeSheet(page);
  await page.getByRole("button", { name: /Audience voice/ }).first().click();
  check("U7 audience voice listens in forums and comments, not one platform (complaint 5)", await visible(sheet.getByText(/^Forums$|Forums/)) && (await sheet.getByText(/Comments/).count()) > 0);
  await closeSheet(page);
  await page.getByRole("button", { name: /Creator shortlist/ }).first().click();
  check("U8 creators can be found on X, LinkedIn and YouTube too (complaint 4)", (await sheet.getByRole("radio", { name: "X" }).count()) > 0 && (await sheet.getByRole("radio", { name: "LinkedIn" }).count()) > 0 && (await sheet.getByRole("radio", { name: "YouTube" }).count()) > 0);
  // Changing the platform moves the sliding pill; a moved pill used to keep a
  // closed sheet on the page as an invisible wall that took every click.
  await sheet.getByRole("radio", { name: "LinkedIn" }).click();
  await shot(page, "U-sheet-moved-pill", false);
  await page.keyboard.press("Escape");
  const gone = await page.locator('div[role="presentation"].fixed').waitFor({ state: "detached", timeout: 4000 }).then(() => true).catch(() => false);
  const clickable = gone && (await page.getByRole("button", { name: /Trend radar/ }).first().click({ timeout: 3000 }).then(() => true).catch(() => false));
  check("U9 a sheet closed after changing the platform leaves the page clickable", clickable);
  if (clickable) await closeSheet(page);
  await ctx.close();
}

/* --------------------------------------- 2: competitor and creator reports */
{
  const { ctx, page } = await open();
  await page.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Competitor breakdown/ }).first().click();
  await page.getByRole("dialog").getByLabel("Competitors").fill("Glowlab, @dewdrop.notes");
  await page.getByRole("dialog").getByRole("button", { name: /Run report/ }).click();
  await page.waitForURL(/\/insights\/reports\//, { timeout: 20000 });
  check("R1 competitor report: one card per competitor, platform by platform", await visible(page.getByRole("heading", { name: "Competitor by competitor" }), 60000));
  check("R2 each card counts ads, reviews and mentions", await visible(page.getByText("Ads running")) && (await page.getByText("Mentions, 30d").count()) > 0);
  check("R3 the report says what it read", await visible(page.getByText(/What I read:/)));
  check("R4 no data provider named on the page", !VENDORS.test(await page.locator("main").innerText()));
  await shot(page, "R-competitors");
  await page.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Creator shortlist/ }).first().click();
  await page.getByRole("dialog").getByRole("radio", { name: "X" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Run report/ }).click();
  await page.waitForURL(/\/insights\/reports\//, { timeout: 20000 });
  check("R5 X creators are ranked (complaint 4)", await visible(page.getByRole("heading", { name: "Ranked by fit" }), 60000));
  const getOne = page.getByRole("button", { name: /^Get contact/ }).first();
  check("R6 every creator can be enriched, not just Instagram's (complaint 4)", await visible(getOne));
  check("R7 the top ten can be enriched in one go", await visible(page.getByRole("button", { name: /Get the top \d+ contacts/ })));
  await getOne.click();
  check("R8 enrichment shows an email (complaint 4: it never worked before)", await visible(page.locator("main").getByRole("link", { name: /@.*\.example/ }), 20000));
  await shot(page, "R-creators-x");
  await ctx.close();
}

/* ------------------------------------------------- 3: Today, every platform */
{
  await rest(`intel_reports?user_id=eq.${UID}&kind=eq.briefing`, { method: "DELETE" });
  const { ctx, page } = await open();
  await page.goto(`${BASE}/home`, { waitUntil: "networkidle" });
  check("B1 Today covers the market, not one platform (complaint 6)", await visible(page.getByRole("heading", { name: "This week in your market" }), 40000));
  const tabs = page.getByRole("tablist", { name: "Platforms" }).getByRole("tab");
  check("B2 there is a tab per platform", (await tabs.count()) >= 3, `${await tabs.count()} tabs`);
  check("B3 the week's news is there", await visible(page.getByRole("heading", { name: "In the news" })));
  await tabs.nth(1).click();
  check("B4 a platform tab shows what's talked about there", await visible(page.getByText(/Most talked about|Quiet week here|Most used tags|Rising tags/)));
  check("B5 posts taking off are shown without 'x a typical post'", !(await page.locator("[data-briefing=v2]").innerText()).includes("a typical post"));
  await shot(page, "B-today");
  await ctx.close();
}

/* ------------------------------------- 4: watchlists, 8 sources, kept safe */
{
  const { ctx, page } = await open();
  await page.goto(`${BASE}/search/new`, { waitUntil: "networkidle" });
  for (const label of ["News", "Instagram", "X", "LinkedIn", "Reddit", "TikTok", "YouTube", "Ad libraries"]) {
    const chip = page.getByRole("button", { name: label, exact: true });
    if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
  }
  check("W1 where to look has every source (complaint 8)", (await page.getByRole("button", { pressed: true }).filter({ hasText: /^(News|Instagram|X|LinkedIn|Reddit|TikTok|YouTube|Ad libraries)$/ }).count()) === 8);
  await page.fill("#b-niche", "beauty brands");
  await page.getByRole("button", { name: /Start watching|Save and check/ }).last().click();
  await page.waitForURL((u) => /\/search\/(?!new$)[\w-]+$/.test(u.pathname), { timeout: 20000 });
  const searchId = page.url().split("/").pop();
  check("W2 the check finds signals", await visible(page.locator("article").first(), 60000));
  check("W3 a move seen in several places links each of them", await visible(page.getByText("also on"), 20000));
  await shot(page, "W-signals");
  // Lose this browser's copy entirely, as a sign-out on another device could.
  // The account's real copy is kept and put back afterwards.
  const saved = (await rest(`user_state?user_id=eq.${UID}&select=state,version`))?.[0];
  await rest(`user_state?user_id=eq.${UID}`, { method: "PATCH", body: JSON.stringify({ state: {} }) });
  await ctx.close();
  const again = await open();
  // A direct link to the watchlist, on a browser that has nothing.
  await again.page.evaluate(() => localStorage.clear());
  await again.page.goto(`${BASE}/search/${searchId}`, { waitUntil: "networkidle" });
  check("W4 signals come back from the server after the browser copy is lost (complaint 9)", await visible(again.page.locator("article").first(), 20000));
  await shot(again.page, "W-restored");
  await again.ctx.close();
  if (saved) await rest(`user_state?user_id=eq.${UID}`, { method: "PATCH", body: JSON.stringify({ state: { ...saved.state, updatedAt: Date.now() }, version: saved.version }) });
}

/* ----------------------------------------------- 5: Ask, the launches question */
{
  await rest(`intel_threads?user_id=eq.${UID}`, { method: "DELETE" });
  const { ctx, page } = await open();
  await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
  await page.fill("#ask-input", "tell me the latest brand launches or collaboration by beauty brands in india");
  await page.keyboard.press("Enter");
  check("K1 Ask checks the news (complaint 7)", await visible(page.getByText(/days of news/), 30000));
  check("K2 and the platforms where the market talks", await visible(page.getByText(/Searching (Instagram|X|LinkedIn|Reddit|TikTok|YouTube) for/), 30000));
  check("K3 the answer lands with linked, dated items", await visible(page.locator("main").getByRole("link").filter({ hasText: /\w/ }).nth(2), 30000));
  check("K4 no data provider named", !VENDORS.test(await page.locator("main").innerText()));
  await shot(page, "K-ask");
  // 19 Oct, live: after a reload mid-answer the question sat there unanswered, so it was
  // asked (and paid for) again. Opened elsewhere while it's written, it says it's coming.
  await page.goto(`${BASE}/ask`, { waitUntil: "networkidle" });
  await page.fill("#ask-input", "what's trending this week #slow");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/ask\?t=/, { timeout: 15000 });
  const other = await open();
  await other.page.goto(page.url(), { waitUntil: "networkidle" });
  check("K5 a conversation opened while its answer is written says it's coming", await visible(other.page.getByText("Still answering this question"), 8000));
  check("K6 and it can't be asked again meanwhile", (await other.page.getByRole("button", { name: /^Ask\b/ }).count()) === 0 && (await other.page.getByRole("button", { name: "Stop" }).isDisabled({ timeout: 3000 }).catch(() => false)));
  check("K7 then the answer appears there by itself", await visible(other.page.locator("main").getByText(/100 credits|Free/).first(), 30000) && !(await other.page.getByText("Still answering this question").isVisible().catch(() => false)));
  await shot(other.page, "K-waiting-done");
  await other.ctx.close();
  await ctx.close();
}

/* ------------------------------------------------------------ 6: phone */
{
  const { ctx, page } = await open({ width: 390, height: 844 });
  for (const path of ["/home", "/insights", "/search/new", "/ask"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await noOverflow(page, `P ${path} on a phone`);
  }
  await page.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Competitor breakdown/ }).first().click();
  await page.waitForTimeout(800);
  await noOverflow(page, "P the competitor sheet on a phone");
  await shot(page, "P-sheet", false);
  await ctx.close();
}

await browser.close();
await rest(`watchlists?user_id=eq.${UID}`, { method: "DELETE" });
await rest(`watch_signals?user_id=eq.${UID}`, { method: "DELETE" });
console.log(errors.length ? `Console:\n${[...new Set(errors)].join("\n")}` : "No console errors");
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} passed`);
if (ok !== results.length) process.exitCode = 1;
