// One small real-model pass through the app's own routes, signed in as the QA
// account: each request shape Huesy sends (Haiku structured output, Sonnet
// writing with the fallback, the streamed web search, ranking) once. Spend
// is read back from the ai_usage ledger.
//
// Start the server WITHOUT HUESY_AI_MOCK, with ANTHROPIC_API_KEY and a low
// HUESY_DAILY_USD_CAP (the server refuses past it), then:
//   BASE=http://localhost:4311 QA_PASSWORD=... SB_URL=... SB_KEY=... node scripts/qa/probe-real.mjs
const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");

const BASE = process.env.BASE || "http://localhost:4311";
const EMAIL = process.env.QA_EMAIL || "qa.huesy@example.com";
const PASSWORD = process.env.QA_PASSWORD;
if (!PASSWORD) throw new Error("Set QA_PASSWORD");
const startedAt = new Date().toISOString();

const results = [];
const check = (name, ok, detail = "") => {
  results.push(Boolean(ok));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${String(detail).slice(0, 220)})` : ""}`);
};

const brand = {
  brandName: "Honest Glow",
  product: "Refillable skincare",
  brandDescription: "A small range of refillable skincare people actually finish.",
  targetAudience: "Women 22 to 35 in cities who buy on Instagram.",
  brandPersona: "Warm, plain spoken, never hypey.",
  brandValues: "Refill first, honest claims",
  activePlatforms: ["instagram", "linkedin"],
  platformPersonality: { linkedin: "Founder perspective, short paragraphs." },
};
const signal = {
  id: "probe-1",
  headline: "A skincare brand launches refill pouches for its best seller",
  brand: "Sample brand",
  type: "Launch",
  source: "Google News",
  url: "https://example.com/probe",
  date: new Date().toISOString().slice(0, 10),
  summary: "The brand now sells refill pouches that use less plastic than a new bottle.",
  significance: "Refills are a theme this audience follows closely.",
};

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await page.click("button[type=submit]");
await page.waitForURL(/\/(home|onboarding)/, { timeout: 20000 });

const call = (body) =>
  page.evaluate(async (b) => {
    const t = Date.now();
    const r = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    return { status: r.status, ms: Date.now() - t, json: await r.json() };
  }, body);

const tidy = await call({ task: "tidy", input: { ...brand, brandPersona: "warm   plain spoken never hypey" } });
check("R1 Haiku tidy returns structured fields", tidy.status === 200 && typeof tidy.json.data?.brandPersona === "string", `${tidy.ms}ms ${JSON.stringify(tidy.json).slice(0, 160)}`);

const draft = await call({ task: "brand-draft", input: { brandName: "Honest Glow", oneLiner: "Refillable skincare for people who hate throwing away half empty bottles." } });
check("R2 Haiku brand draft returns every field", draft.status === 200 && draft.json.data?.tones?.linkedin && Array.isArray(draft.json.data?.accounts), `${draft.ms}ms`);

const li = await call({ task: "write", platform: "linkedin", signal, brand });
check("R3 Sonnet writes a LinkedIn post in the expected shape", li.status === 200 && /===POST===/.test(li.json.text || ""), `${li.ms}ms ${(li.json.text || JSON.stringify(li.json)).slice(0, 160)}`);

const ig = await call({ task: "write", platform: "instagram", signal, brand });
check(
  "R4 Sonnet writes Instagram as one call with three sections",
  ig.status === 200 && ["===CAPTION===", "===CREATIVE_DETAILS===", "===IMAGE_PROMPT==="].every((m) => (ig.json.text || "").includes(m)),
  `${ig.ms}ms`
);
check("R4b no hyphens or dashes in the copy", !/[—–]/.test(ig.json.text || "") && !/[—–]/.test(li.json.text || ""));

const search = await page.evaluate(async () => {
  const t = Date.now();
  const r = await fetch("/api/ai-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: { targetMode: "niche", niche: "Skincare", researchPlatforms: ["google"], researchLocations: ["Global"], resultRange: [3, 5], lookbackDays: 7 },
      brand: { brandName: "Honest Glow", product: "Refillable skincare", targetAudience: "Women 22 to 35" },
    }),
  });
  const text = await r.text();
  const events = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { status: r.status, ms: Date.now() - t, events };
});
const kinds = search.events.map((e) => e.t);
const found = search.events.filter((e) => e.t === "signal").map((e) => e.signal);
check("R5 the search streams queries as it runs", kinds.includes("query"), kinds.join(","));
check("R5b and finds signals with source links and dates", found.length >= 1 && found.every((s) => /^https?:/.test(s.url) && /^\d{4}-\d{2}-\d{2}$/.test(s.date)), `${found.length} found, ${search.ms}ms: ${found.map((s) => s.headline).join(" | ").slice(0, 200)}`);
check("R5c the finds are ranked for the brand", search.events.some((e) => e.t === "ranked" && e.ranks?.length), JSON.stringify(search.events.find((e) => e.t === "ranked")?.ranks?.[0] || {}));
check("R5d the stream ends with done and no error", kinds.at(-1) === "done" && !kinds.includes("error"), JSON.stringify(search.events.find((e) => e.t === "error") || {}));
await browser.close();

if (process.env.SB_URL && process.env.SB_KEY) {
  const r = await fetch(`${process.env.SB_URL}/rest/v1/ai_usage?created_at=gte.${encodeURIComponent(startedAt)}&select=kind,model,input_tokens,output_tokens,cache_read_tokens,web_searches,usd`, {
    headers: { apikey: process.env.SB_KEY, Authorization: `Bearer ${process.env.SB_KEY}` },
  });
  const rows = await r.json();
  console.table(rows);
  console.log(`Spend this probe: $${rows.reduce((s, x) => s + Number(x.usd), 0).toFixed(4)}`);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
