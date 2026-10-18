// Waitlist, events and the access gate, end to end against the real
// Supabase project with clearly fake test addresses, cleaned up at the end.
//   BASE=http://localhost:4311 SB_URL=... SB_KEY=... node qa-site-api.mjs
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:4311";
const SB = process.env.SB_URL;
const KEY = process.env.SB_KEY;
const OUT = process.env.QA_OUT || "/tmp/huesy-qa/site/";
mkdirSync(OUT, { recursive: true });
const stamp = Date.now();
const startedAt = new Date().toISOString();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const visible = (loc, t = 8000) => loc.waitFor({ state: "visible", timeout: t }).then(() => true).catch(() => false);
const sb = (path, init = {}) =>
  fetch(`${SB}${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });
const post = (path, body, method = "POST") =>
  fetch(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/* ------------------------------------------------- API: the gate holds */
{
  const r1 = await post("/api/ai", { task: "tidy", input: { brandName: "x" } });
  const j1 = await r1.json();
  check("G1 AI route refuses a visitor who isn't signed in", r1.status === 401 && j1.error?.code === "sign_in", `${r1.status} ${j1.error?.code}`);
  const r2 = await post("/api/ai-search", { config: { niche: "x" }, brand: {} });
  check("G2 search route refuses too, before streaming anything", r2.status === 401, String(r2.status));
  const r3 = await post("/api/generate-image", { prompt: "x" });
  check("G3 image route refuses too", r3.status === 401, String(r3.status));
  const j3 = await (await post("/api/ai", { task: "tidy" })).json();
  check("G4 the refusal is a plain sentence, no internals", !/ANTHROPIC|Vercel|env/i.test(JSON.stringify(j3)), j3.error?.message);
}

/* --------------------------------------------------- API: the waitlist */
const e1 = `qa+huesy-${stamp}-a@example.com`;
const e2 = `qa+huesy-${stamp}-b@example.com`;
{
  const r = await post("/api/waitlist", { email: e1, source: "qa", utm: { utm_source: "qa-run" }, referrer: "https://qa.example" });
  const j = await r.json();
  check("W1 joining returns a one time token", r.ok && /^[0-9a-f-]{36}$/.test(j.token || ""), JSON.stringify(j));
  const p = await post("/api/waitlist", { token: j.token, watch: "Beauty" }, "PATCH");
  check("W2 the follow-up answer saves with that token", p.ok);
  const again = await (await post("/api/waitlist", { email: e1.toUpperCase(), source: "qa" })).json();
  check("W3 joining twice is fine, and gives no token", again.ok && again.already && !again.token, JSON.stringify(again));
  const bad = await post("/api/waitlist", { email: "not-an-email" });
  check("W4 a bad address is refused in plain words", bad.status === 400 && /email/i.test((await bad.json()).error || ""));
  const bot = await (await post("/api/waitlist", { email: `qa+huesy-${stamp}-bot@example.com`, website: "http://spam" })).json();
  const botRow = await (await sb(`/rest/v1/waitlist?email=eq.${encodeURIComponent(`qa+huesy-${stamp}-bot@example.com`)}&select=id`)).json();
  check("W5 the bot trap answers ok but stores nothing", bot.ok && botRow.length === 0);
  const badToken = await post("/api/waitlist", { token: "00000000-0000-0000-0000-000000000000", watch: "x" }, "PATCH");
  check("W6 a made up token changes nothing", badToken.ok);
  const row = (await (await sb(`/rest/v1/waitlist?email=eq.${encodeURIComponent(e1)}&select=email,source,watch,utm,referrer`)).json())[0];
  check("W7 the row holds email, source, answer and campaign", row && row.watch === "Beauty" && row.source === "qa" && row.utm?.utm_source === "qa-run", JSON.stringify(row));
}

/* ------------------------------------------------- browser: the site */
const browser = await chromium.launch();
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/?utm_source=qa-site`, { waitUntil: "networkidle" });
  const form = page.locator("[data-hero-join]");
  await form.locator("input[type=email]").fill(`${e2.split("@")[0]}@gmial.com`);
  check("S1 a typo in the domain gets a suggestion", await visible(form.getByText(/Did you mean/)));
  await form.getByRole("button", { name: /gmail\.com/ }).click();
  await form.locator("input[type=email]").fill(e2);
  await form.getByRole("button", { name: /Join the waitlist/ }).click();
  check("S2 joining confirms in place", await visible(form.getByText(/You[’']re on the list\./)));
  check("S2b and echoes the address back", await visible(form.getByText(e2)));
  check("S2c and says no email is promised beyond the invite", !(await form.getByText(/check your inbox/i).count()));
  await page.screenshot({ path: `${OUT}S2-joined.png` });
  await form.getByRole("button", { name: "Fashion" }).click();
  check("S3 the optional answer is acknowledged", await visible(form.getByText(/Noted\. Huesy will start with fashion when your place opens/)));
  await page.screenshot({ path: `${OUT}S3-answered.png` });
  await page.reload({ waitUntil: "networkidle" });
  check("S4 a returning visitor sees they're on the list", await visible(page.locator("[data-hero-join]").getByText(/You[’']re on the list\./)));
  await page.evaluate(() => window.scrollTo(0, 1400));
  check("S5 the bar says so too, once the hero is out of view", await visible(page.getByText(/^You[’']re on the list$/)));
  const row = (await (await sb(`/rest/v1/waitlist?email=eq.${encodeURIComponent(e2)}&select=source,watch,utm`)).json())[0];
  check("S6 the join reached Supabase with where it came from", row?.source === "hero" && row?.watch === "Fashion" && row?.utm?.utm_source === "qa-site", JSON.stringify(row));
  check("S7 no page errors on the site", errors.length === 0, errors.join(" | "));
  await ctx.close();
}
{
  // A new visitor arriving from an app link: /?join=1 opens the sheet.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?join=1&utm_source=qa-site`, { waitUntil: "networkidle" });
  const sheet = page.getByRole("dialog");
  check("S8 /?join=1 opens the join sheet", await visible(sheet));
  await page.screenshot({ path: `${OUT}S8-sheet-phone.png` });
  await page.keyboard.press("Escape");
  check("S9 Escape closes it", await sheet.waitFor({ state: "detached", timeout: 4000 }).then(() => true).catch(() => false));
  await ctx.close();
}

/* --------------------------------------- the gate for uninvited accounts */
const outsider = `qa.notinvited+${stamp}@example.com`;
// A fresh password each run, for an account that is deleted at the end.
const outsiderPassword = `Qa-${crypto.randomUUID()}`;
const created = await (await sb("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: outsider, password: outsiderPassword, email_confirm: true }) })).json();
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", outsider);
  await page.fill("#password", outsiderPassword);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/(waitlist|home)/, { timeout: 20000 }).catch(() => {});
  check("X1 an uninvited account lands on You're on the list", /\/waitlist$/.test(new URL(page.url()).pathname) && (await visible(page.getByRole("heading", { name: /You[’']re on the list/ }))), page.url());
  await page.screenshot({ path: `${OUT}X1-on-the-list.png` });
  await page.goto(`${BASE}/home`);
  check("X2 the app stays closed to it", /\/waitlist$/.test(new URL(page.url()).pathname), page.url());
  await page.goto(`${BASE}/onboarding`);
  check("X2b brand setup is closed too while Huesy is a waitlist", /\/waitlist$/.test(new URL(page.url()).pathname), page.url());
  const apiStatus = await page.evaluate(async () => {
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "tidy", input: {} }) });
    return [r.status, (await r.json()).error?.code];
  });
  check("X3 and its AI calls are refused", apiStatus[0] === 403 && apiStatus[1] === "waitlist", apiStatus.join(" "));
  const row = (await (await sb(`/rest/v1/waitlist?email=eq.${encodeURIComponent(outsider)}&select=source`)).json())[0];
  check("X4 signing up early still puts them on the waitlist", row?.source === "account", JSON.stringify(row));
  await ctx.close();
}
await browser.close();

/* ---------------------------------------------------------------- events */
{
  const rows = await (await sb(`/rest/v1/site_events?created_at=gte.${encodeURIComponent(startedAt)}&utm->>utm_source=eq.qa-site&select=name,source,utm`)).json();
  const names = new Set(rows.map((r) => r.name));
  check("E1 the site counted views, focus, joins and answers", ["view", "focus", "join", "answer"].every((n) => names.has(n)), [...names].join(","));
  check("E2 joins are counted by where they happened", rows.some((r) => r.name === "join" && r.source === "hero"));
  check("E3 events carry no personal data", rows.every((r) => !JSON.stringify(r).includes("@")));
}

/* ------------------------------------------------------------- clean up */
const del = async (path) => (await sb(path, { method: "DELETE" })).status;
const cleaned = [
  await del(`/rest/v1/waitlist?email=like.${encodeURIComponent(`qa+huesy-${stamp}%`)}`),
  await del(`/rest/v1/waitlist?email=eq.${encodeURIComponent(outsider)}`),
  // Only this run's events: every page it opens carries utm_source=qa-site, and
  // production writes to the same table.
  await del(`/rest/v1/site_events?created_at=gte.${encodeURIComponent(startedAt)}&utm->>utm_source=eq.qa-site`),
  created?.id ? (await sb(`/auth/v1/admin/users/${created.id}`, { method: "DELETE" })).status : "no user",
];
const left = await (await sb(`/rest/v1/waitlist?email=like.${encodeURIComponent("qa+huesy-%")}&select=id`)).json();
check("Z1 test rows and the test account are removed", left.length === 0, cleaned.join(","));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
