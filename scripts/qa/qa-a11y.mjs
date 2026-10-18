const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
const BASE = process.env.BASE || "http://localhost:4311";
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? `  (${d})` : ""}`); };
const b = await chromium.launch();

// Reduced motion: the sample run shows its finished state at once, nothing moves.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?utm_source=qa-site`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  check("M1 reduced motion: the sample run is already finished", await p.getByText("Get this for my market").isVisible());
  const animating = await p.evaluate(() => {
    const els = [...document.querySelectorAll(".huesy-body, .huesy-ring, .skeleton, .progress-wave")];
    return els.filter((e) => {
      const cs = getComputedStyle(e);
      if (cs.display === "none") return false;
      const d = cs.animationDuration.split(",").map((x) => parseFloat(x));
      return cs.animationName !== "none" && d.some((x) => x > 0.01);
    }).length;
  });
  check("M2 reduced motion: no looping animation runs", animating === 0, `${animating} animating`);
  await ctx.close();
}

// Keyboard: skip link first, focus visible, the sheet traps focus and returns it.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?utm_source=qa-site`, { waitUntil: "networkidle" });
  await p.keyboard.press("Tab");
  const first = await p.evaluate(() => document.activeElement?.textContent?.trim());
  check("K1 the first Tab reaches Skip to content", first === "Skip to content", first);
  await p.keyboard.press("Tab");
  const ring = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  check("K2 focus is visible", ring && ring !== "none", ring);
  // Open the sheet from the bar once the hero is scrolled away.
  await p.evaluate(() => window.scrollTo(0, 1600));
  const btn = p.getByRole("button", { name: "Join the waitlist" }).first();
  await btn.waitFor();
  await btn.focus();
  await p.keyboard.press("Enter");
  await p.getByRole("dialog").waitFor();
  await p.waitForTimeout(200);
  const focused = await p.evaluate(() => ({ inDialog: Boolean(document.activeElement?.closest("[role=dialog]")), type: document.activeElement?.type, name: document.activeElement?.name }));
  check("K3 opening the sheet puts focus on the email field, never the hidden trap", focused.inDialog && focused.type === "email", JSON.stringify(focused));
  for (let i = 0; i < 8; i++) await p.keyboard.press("Tab");
  const stillIn = await p.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")));
  check("K4 Tab stays inside the sheet", stillIn);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  const back = await p.evaluate(() => document.activeElement?.textContent?.trim());
  check("K5 Escape closes it and focus returns to the opener", /Join the waitlist/.test(back || ""), back);
  await ctx.close();
}
// Keyboard selection of signals, and Undo legible in dark mode.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.fill("#email", "qa.huesy@example.com");
  await p.fill("#password", process.env.QA_PASSWORD || "");
  await p.click("button[type=submit]");
  await p.waitForURL(/home/);
  await p.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await p.getByRole("link", { name: "Beauty and skincare" }).click();
  await p.getByRole("button", { name: /Select several to write/ }).click();
  const box = p.getByRole("checkbox", { name: /^Select / }).first();
  await box.focus();
  await p.keyboard.press("Space");
  check("K6 a signal can be selected with the keyboard", await p.getByText(/1 selected/).isVisible().catch(() => false));
  await p.getByRole("button", { name: /Done selecting/ }).click();
  // Save a signal, then measure the toast's Undo against its background.
  await p.getByRole("button", { name: /^Save$/ }).first().click();
  const toast = p.getByRole("status").filter({ hasText: "Saved" }).first();
  await toast.waitFor();
  const ratio = await toast.evaluate((el) => {
    const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = ([r, g, bb]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bb);
    };
    const btn = el.querySelector("button");
    const a = lum(rgb(getComputedStyle(btn).color));
    const bg = lum(rgb(getComputedStyle(el).backgroundColor));
    const [hi, lo] = a > bg ? [a, bg] : [bg, a];
    return (hi + 0.05) / (lo + 0.05);
  });
  check("K7 the toast's action reads clearly in dark mode", ratio >= 4.5, `${ratio.toFixed(2)}:1`);
  await toast.getByRole("button").first().click();
  await ctx.close();
}
// Design rules from the pre-ship review, checked by measurement.
{
  const login = async (p) => {
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await p.fill("#email", "qa.huesy@example.com");
    await p.fill("#password", process.env.QA_PASSWORD || "");
    await p.click("button[type=submit]");
    await p.waitForURL(/home/);
    await p.waitForTimeout(2500);
  };
  // D1: on a touch screen every control is at least 44px tall.
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  await login(pp);
  for (const path of ["/home", "/search", "/saved", "/profile", "/search/new", "/?utm_source=qa-site"]) {
    await pp.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await pp.waitForTimeout(900);
    const small = await pp.evaluate(() =>
      [...document.querySelectorAll("button, [role=tab], [role=radio], nav a, header a, select, input:not([type=checkbox]):not([type=hidden])")]
        .filter((el) => el.offsetParent && !el.closest("[aria-hidden=true]") && !el.matches(".sr-only"))
        .map((el) => ({ h: Math.round(el.getBoundingClientRect().height), t: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30) }))
        .filter((x) => x.h > 0 && x.h < 44)
    );
    check(`D1 ${path}: touch targets at least 44px`, small.length === 0, small.slice(0, 4).map((x) => `${x.t}=${x.h}`).join(", "));
  }
  await phone.close();

  const desk = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await desk.newPage();
  await login(dp);
  for (const path of ["/home", "/search", "/saved", "/profile"]) {
    await dp.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await dp.waitForTimeout(1200);
    const counts = await dp.evaluate(() => {
      const inView = (el) => {
        const r = el.getBoundingClientRect();
        return el.offsetParent && r.bottom > 0 && r.top < innerHeight && r.width > 0;
      };
      const blush = [...document.querySelectorAll("main *, header *")].filter(
        (el) => inView(el) && getComputedStyle(el).backgroundColor === "rgb(255, 194, 209)"
      ).length;
      const huesy = [...document.querySelectorAll(".huesy")].filter((el) => inView(el) && !el.closest("a[aria-label='Huesy home']")).length;
      return { blush, huesy };
    });
    check(`D2 ${path}: blush is kept for the main action (at most 3 in view)`, counts.blush <= 3, `${counts.blush}`);
    check(`D3 ${path}: one Huesy speaks at a time`, counts.huesy <= 1, `${counts.huesy}`);
  }
  // A watchlist page, then the signal sheet open over it.
  await dp.goto(`${BASE}/search`, { waitUntil: "networkidle" });
  await dp.getByRole("link", { name: "Beauty and skincare" }).click();
  await dp.waitForTimeout(1200);
  const measure = () =>
    dp.evaluate(() => {
      const inView = (el) => {
        const r = el.getBoundingClientRect();
        return el.offsetParent && r.bottom > 0 && r.top < innerHeight && r.width > 0;
      };
      const root = document.querySelector("[role=dialog]") || document;
      const blush = [...root.querySelectorAll("main *, header *, [role=dialog] *")].filter((el) => inView(el) && getComputedStyle(el).backgroundColor === "rgb(255, 194, 209)").length;
      const huesy = [...root.querySelectorAll(".huesy")].filter((el) => inView(el) && !el.closest("a[aria-label='Huesy home']")).length;
      return { blush, huesy };
    });
  let m = await measure();
  check("D2 watchlist page: blush is kept for the main action", m.blush <= 3, `${m.blush}`);
  await dp.getByRole("button", { name: /Write a post|Open drafts/ }).first().click();
  await dp.getByRole("dialog").waitFor();
  await dp.waitForTimeout(2600);
  m = await measure();
  check("D2 signal sheet: blush is kept for the main action", m.blush <= 3, `${m.blush}`);
  check("D3 signal sheet: at most one Huesy", m.huesy <= 1, `${m.huesy}`);
  await desk.close();
}

// Appearance: someone on a dark device can switch to light, it sticks from the
// first paint, the keyboard works, and "Match my device" hands back to the system.
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const p = await ctx.newPage();
  const theme = () => p.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const group = (scope = p) => scope.getByRole("radiogroup", { name: "Appearance" }).first();
  await p.goto(`${BASE}/?utm_source=qa-site`, { waitUntil: "networkidle" });
  check("T1 a dark device opens the site dark", (await theme()) === "dark");
  await group().scrollIntoViewIfNeeded();
  await group().getByRole("radio", { name: "Light" }).click();
  check("T2 Light in the footer turns the page light", (await theme()) === "light");
  const bars = await p.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content));
  check("T2b and the browser bar colour follows", bars.length > 0 && bars.every((c) => c === "#fcf5ef"), bars.join(","));
  await p.reload({ waitUntil: "domcontentloaded" });
  check("T3 it stays light after a reload, before the page draws", (await theme()) === "light");
  await p.waitForLoadState("networkidle");
  await group().getByRole("radio", { checked: true }).focus();
  await p.keyboard.press("ArrowRight");
  check("T4 the arrow keys move the choice (Light to Dark)", (await theme()) === "dark");
  await group().getByRole("radio", { name: "Match my device" }).click();
  check(
    "T5 Match my device follows the system again and forgets the choice",
    (await theme()) === "dark" && (await p.evaluate(() => localStorage.getItem("huesy:theme"))) === null
  );
  // In the app: the sidebar on a laptop, and a labelled switch in Brand > Account.
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p.fill("#email", "qa.huesy@example.com");
  await p.fill("#password", process.env.QA_PASSWORD || "");
  await p.click("button[type=submit]");
  await p.waitForURL(/home/);
  await group(p.locator("aside")).getByRole("radio", { name: "Light" }).click();
  check("T6 the app's sidebar has the switch and it works", (await theme()) === "light");
  await p.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
  await p.getByRole("tab", { name: "Account" }).click();
  const labelled = group(p.locator("main"));
  await labelled.waitFor({ timeout: 8000 }).catch(() => {});
  check(
    "T7 Brand > Account shows the choice in words, with Light picked",
    (await labelled.getByText("Dark", { exact: true }).isVisible()) &&
      (await labelled.getByRole("radio", { name: /Light/ }).getAttribute("aria-checked")) === "true"
  );
  await labelled.getByRole("radio", { name: /Dark/ }).click();
  const sidebarDark = await group(p.locator("aside")).getByRole("radio", { name: "Dark" }).getAttribute("aria-checked");
  check("T7b both switches on the page move together", (await theme()) === "dark" && sidebarDark === "true", `sidebar Dark checked: ${sidebarDark}`);
  const other = await ctx.newPage();
  await other.goto(`${BASE}/home`, { waitUntil: "networkidle" });
  await labelled.getByRole("radio", { name: /Light/ }).click();
  await other.waitForTimeout(400);
  check("T7c another open tab follows the change", (await other.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light");
  await labelled.getByRole("radio", { name: /Device/ }).click();
  await ctx.close();
  // On a phone each option is a full 44 by 44 target.
  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  await pp.goto(`${BASE}/?utm_source=qa-site`, { waitUntil: "networkidle" });
  const sizes = await pp.evaluate(() =>
    [...document.querySelectorAll('[role=radiogroup][aria-label="Appearance"] [role=radio]')].map((el) => {
      const r = el.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)];
    })
  );
  check("T8 on a phone each Appearance option is at least 44 by 44", sizes.length === 3 && sizes.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(sizes));
  await phone.close();
}
await b.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
