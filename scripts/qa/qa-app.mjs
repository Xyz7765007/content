// End-to-end QA for the Huesy app on the stand-in model (HUESY_AI_MOCK=1),
// signed in as the QA account. Checks are written from the intended design:
// what the person should see and be able to do, including the negatives.
//
//   BASE=http://localhost:4311 node qa-app.mjs
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:4311";
const EMAIL = process.env.QA_EMAIL || "qa.huesy@example.com";
const PASSWORD = process.env.QA_PASSWORD;
if (!PASSWORD) throw new Error("Set QA_PASSWORD (the QA account password)");
const OUT = process.env.QA_OUT || "/tmp/huesy-qa/app/";
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const visible = (loc, t = 8000) => loc.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });
const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${label}: no sideways scroll`, o <= 0, o > 0 ? `${o}px` : "");
};

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/(home|waitlist|onboarding)/, { timeout: 20000 });
}

const browser = await chromium.launch();
// Every page this suite opens counts as utm_source=qa-site (the site keeps a
// visit's tags in sessionStorage), so its site events can be told apart from
// real visits and deleted.
const newContext = async (options) => {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript(() => {
    try {
      sessionStorage.setItem("huesy:utm", JSON.stringify({ utm: { utm_source: "qa-site" }, referrer: "" }));
    } catch {
      /* fine without */
    }
  });
  return ctx;
};
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Failed to load resource: the server responded with a status of 40[134]/.test(m.text())) errors.push(`${tag} console: ${m.text()}`);
  });
};

const phase = process.env.PHASE || "all";

/* ---------------------------------------------------------- A: migration */
if (phase === "all" || phase === "migrate") {
  const ctx = await newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page, "migrate");
  await login(page);
  await page.waitForTimeout(2500);
  const heading = await page.locator("main h2").first().textContent().catch(() => "");
  check("A1 old account state loads and greets the brand", /Loam/.test(heading || ""), heading);
  await page.goto(`${BASE}/saved`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const allChip = await page.getByRole("button", { name: /All saved/ }).textContent().catch(() => "");
  check("A2 old bookmarks became saves", /All saved\s*2/.test(allChip || ""), allChip);
  await shot(page, "A-saved-migrated");
  await ctx.close();
}

/* ------------------------------------------------------- B: first run */
if (phase === "all" || phase === "fresh") {
  const ctx = await newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page, "fresh");
  await login(page);
  await page.waitForTimeout(1500);
  check("B1 a new account is welcomed, not shown an empty page", await visible(page.getByText(/Hi, I[’']m Huesy\./)));
  check("B1b the welcome shows samples labelled as samples", (await page.getByText("Sample", { exact: true }).count()) >= 3);
  await shot(page, "B1-welcome");

  await page.getByRole("link", { name: /Set up my brand/ }).click();
  await page.waitForURL(/onboarding/);
  await page.fill("#ob-name", "Honest Glow");
  await page.fill("#ob-line", "Refillable skincare for people who hate throwing away half empty bottles.");
  await shot(page, "B2-onboarding-intro");
  await page.getByRole("button", { name: /Draft my brand/ }).click();
  check("B2 drafting says what it is doing", await page.getByText(/Reading up on Honest Glow/).isVisible().catch(() => false));
  await page.getByRole("heading", { name: /Here[’']s what I picked up/ }).waitFor({ timeout: 8000 });
  check("B3 the draft fills the brand", (await page.inputValue("#product")) === "Everyday skincare");
  check("B3b drafted fields are labelled as drafted", (await page.getByText("Drafted by Huesy").count()) === 3);
  check("B3c tones arrive for the preselected platforms", (await page.inputValue("#pp-instagram")).length > 5);
  await shot(page, "B3-onboarding-review");
  await page.getByRole("button", { name: /Start watching/ }).click();
  await page.waitForURL(/\/home/);
  check("B4 finishing setup starts the first search at once", await visible(page.getByText(/Planning where to look|Found \d+ so far|Checking/).first(), 5000));
  await page.waitForTimeout(1800);
  await shot(page, "B4-first-run-live");
  await page.getByText(/Best for Honest Glow/).waitFor({ timeout: 20000 });
  check("B5 results are ranked for the brand", await page.getByText(/Best for Honest Glow/).isVisible());
  check("B5b every card offers Write a post", (await page.getByRole("button", { name: "Write a post" }).count()) >= 6);
  check("B5c fit badges show", (await page.getByText("Top fit").count()) >= 1);
  const toast = await page.getByRole("status").filter({ hasText: /new for/ }).first().textContent({ timeout: 4000 }).catch(() => "");
  check("B5d a toast says how many are new", /\d+ new for/.test(toast || ""), toast);
  await page.waitForTimeout(600);
  await shot(page, "B5-today-ranked");

  // Write a post: it starts writing right away, for the brand's platforms.
  await page.getByRole("button", { name: "Write a post" }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.waitFor();
  check("B6 Write a post opens the signal sheet", await sheet.isVisible());
  check("B6b writing starts without another click", await visible(sheet.getByText(/Writing|Waiting its turn/).first(), 3000));
  await shot(page, "B6-sheet-writing");
  await sheet.getByText("AI draft. Edit any line in place").nth(1).waitFor({ timeout: 15000 });
  const cards = await sheet.locator("article").count();
  check("B7 posts arrive for Instagram and LinkedIn", cards === 2, `${cards} posts`);
  check("B7b the Instagram post has caption, brief and image prompt", (await sheet.getByText("Caption", { exact: true }).count()) === 1 && (await sheet.getByText("Creative brief", { exact: true }).count()) === 1 && (await sheet.getByText("Image prompt", { exact: true }).count()) === 1);
  await shot(page, "B7-sheet-posts");

  // Edit in place, then close and reopen: the edit is kept.
  const firstText = sheet.locator("article").filter({ hasText: "LinkedIn" }).locator("textarea").first();
  await firstText.click();
  await firstText.press("End");
  await firstText.type(" Edited by QA.");
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Open drafts|Write a post/ }).first().click();
  await sheet.waitFor();
  await sheet.getByText("AI draft. Edit any line in place").nth(1).waitFor({ timeout: 15000 });
  const kept = await sheet.locator("article").filter({ hasText: "LinkedIn" }).locator("textarea").first().inputValue();
  check("B8 an edit is kept after closing and reopening", /Edited by QA\./.test(kept));

  // Refine with undo.
  const linkedIn = sheet.locator("article").filter({ hasText: "LinkedIn" });
  const before = await linkedIn.locator("textarea").first().inputValue();
  await linkedIn.getByRole("button", { name: "Refine" }).click();
  await linkedIn.getByRole("button", { name: "Shorter" }).click();
  await page.getByRole("status").filter({ hasText: "Rewritten" }).first().waitFor({ timeout: 8000 });
  const after = await linkedIn.locator("textarea").first().inputValue();
  check("B9 Refine rewrites the post", after !== before);
  await page.getByRole("status").filter({ hasText: "Rewritten" }).getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(400);
  check("B9b Undo puts the previous version back", (await linkedIn.locator("textarea").first().inputValue()) === before);

  // Save the post and the signal.
  await linkedIn.getByRole("button", { name: "Save this post" }).click();
  check("B10 saving a post confirms with a Move option", await visible(page.getByRole("status").filter({ hasText: "Post saved" }).getByRole("button", { name: "Move" }), 3000));
  await sheet.getByRole("button", { name: /Save signal/ }).click();
  check("B10b the signal can be saved from the sheet", await visible(sheet.getByRole("button", { name: /^Saved$/ }), 3000));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  await page.goto(`${BASE}/saved`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  check("B11 Saved shows the post with its full text and Copy", (await page.getByRole("button", { name: "Copy the post" }).count()) === 1);
  check("B11b Saved shows the saved signal with Write a post", (await page.getByRole("button", { name: /Write a post|Open drafts/ }).count()) >= 1);
  await shot(page, "B11-saved");
  await page.getByRole("button", { name: "Remove" }).first().click();
  check("B12 removing offers Undo", await visible(page.getByRole("status").filter({ hasText: "Removed" }).getByRole("button", { name: "Undo" }), 3000));
  await page.getByRole("status").filter({ hasText: "Removed" }).getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(400);
  check("B12b Undo brings it back", /All saved\s*2/.test(await page.getByRole("button", { name: /All saved/ }).textContent()));

  // Watching, then a batch.
  await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  check("B13 a watchlist says when it last checked", await visible(page.getByText(/Last checked (just now|\d+ min ago)/).first()));
  await shot(page, "B13-watching");
  await page.getByRole("link", { name: "Open" }).first().click();
  await page.waitForURL(/\/search\/\w+/);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Select several to write/ }).click();
  // In select mode each card is a labelled checkbox.
  const boxes = page.getByRole("checkbox", { name: /^Select / });
  await boxes.nth(1).check({ force: true });
  await boxes.nth(2).check({ force: true });
  check("B14 selecting shows a count and a write button", await visible(page.getByText(/2 selected/)));
  await shot(page, "B14-select");
  await page.getByRole("button", { name: /Write posts for 2/ }).click();
  await page.waitForURL(/\/compose$/);
  check("B15 the batch says its size before it runs", await visible(page.getByText(/4 posts, about \d+ minute/)));
  await page.getByRole("button", { name: /Write 4 posts/ }).click();
  await page.getByText("AI draft. Edit any line in place").nth(3).waitFor({ timeout: 25000 });
  check("B15b all four posts are written", (await page.getByText("AI draft. Edit any line in place").count()) === 4);
  await shot(page, "B15-compose");

  // Empty and failed searches say so, with the next step.
  for (const [hook, expect, label] of [
    ["#empty", /Nothing in the last 7 days/, "B16 an empty search says so and offers a wider window"],
    ["#fail", /couldn't reach my sources/i, "B17 a failed search says so in plain words"],
  ]) {
    await page.goto(`${BASE}/search/new`, { waitUntil: "networkidle" });
    await page.fill("#b-niche", `Fintech ${hook}`);
    await page.getByRole("button", { name: "Launches and collabs" }).click();
    await page.getByRole("button", { name: /Start watching/ }).click();
    await page.waitForURL(/\/search\/\w+/);
    const seen = await visible(page.getByText(expect).first(), 20000);
    check(label, seen);
    if (hook === "#empty") check("B16b with a Widen to 30 days button", await visible(page.getByRole("button", { name: /Widen to 30 days/ })));
    if (hook === "#fail") check("B17b with Try again", await visible(page.getByRole("button", { name: "Try again" }).first()));
    await shot(page, `B-${hook.slice(1)}`);
  }
  const savedFailed = await page.evaluate(() => JSON.parse(localStorage.getItem("content-engine") || "{}")?.state?.searches?.find((s) => /#fail/.test(s.name))?.signals?.length);
  check("B17c a failed search never saves a fake signal", savedFailed === 0, `signals=${savedFailed}`);

  // Brand: tidy shows a before and after, with undo.
  await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await page.fill("#brandPersona", "warm   and plain spoken");
  await page.getByRole("button", { name: /Tidy with AI/ }).click();
  check("B18 tidy proposes changes instead of overwriting", await visible(page.getByText(/Nothing changes until you accept/), 5000));
  await shot(page, "B18-tidy");
  await page.getByRole("button", { name: "Use this" }).click();
  check("B18b accepted tidy can be undone", await visible(page.getByRole("status").filter({ hasText: "Brief tidied" }).getByRole("button", { name: "Undo" }), 3000));

  // Sign out clears this browser.
  await page.getByRole("tab", { name: "Account" }).click();
  await page.getByRole("button", { name: "Log out" }).last().click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  await page.waitForTimeout(800);
  const local = await page.evaluate(() => JSON.parse(localStorage.getItem("content-engine") || "{}")?.state);
  check("B19 signing out clears the brand from this browser", !local?.brand?.brandName && !local?.searches?.length, local?.brand?.brandName || "");
  await ctx.close();
}

/* -------------------------------------------------------------- C: phone */
if (phase === "all" || phase === "phone") {
  const ctx = await newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  watch(page, "phone");
  await login(page);
  await page.waitForTimeout(2500);
  await shot(page, "C1-phone-today");
  await noOverflow(page, "C1 phone Today");
  check("C1b the tab bar shows four places", (await page.locator("nav[aria-label=Main]").last().getByRole("link").count()) === 4);
  const write = page.getByRole("button", { name: /Write a post|Open drafts/ }).first();
  if (await write.isVisible().catch(() => false)) {
    await write.click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(600);
    const box = await page.getByRole("dialog").boundingBox();
    check("C2 the sheet rises from the bottom on a phone", box && box.y > 40 && Math.round(box.y + box.height) >= 843, box ? `${Math.round(box.y)}+${Math.round(box.height)}` : "");
    await shot(page, "C2-phone-sheet");
    await page.keyboard.press("Escape");
  }
  for (const path of ["/search", "/saved", "/profile", "/search/new"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await noOverflow(page, `C3 phone ${path}`);
    await shot(page, `C3-phone${path.replace(/\//g, "-")}`);
  }
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (errors.length) console.log("Browser errors:\n" + [...new Set(errors)].slice(0, 20).join("\n"));
process.exit(failed.length ? 1 : 0);
