// Browser wrappers for the AI routes. Every call resolves, never throws: a
// result, or { error: { code, message } } with a sentence fit for the screen.

const OFFLINE = {
  code: "network",
  message: "I couldn't reach Huesy. Check your connection and try again.",
};

async function post(url, payload, signal) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) {
      return { error: data?.error?.message ? data.error : { code: "failed", message: "Something went wrong. Try again." } };
    }
    return data || {};
  } catch (e) {
    if (e?.name === "AbortError") return { error: { code: "aborted", message: "Stopped." } };
    return { error: OFFLINE };
  }
}

// What the server needs to know about the brand, without the reference
// images, which can run to megabytes and only Instagram writing uses.
export function slimBrand(brand) {
  if (!brand) return {};
  const { instaRefImages, refCreativeImages, ...rest } = brand;
  return rest;
}

const slimSignal = (s) => ({
  id: s.id,
  headline: s.headline,
  brand: s.brand,
  type: s.type,
  source: s.source,
  url: s.url,
  date: s.date,
  summary: s.summary,
  significance: s.significance,
});

export const brandImages = (brand) =>
  [...(brand?.instaRefImages || []), ...(brand?.refCreativeImages || [])].filter(Boolean);

export function writePost({ platform, signal, brand, options }, abortSignal) {
  return post(
    "/api/ai",
    {
      task: "write",
      platform,
      signal: slimSignal(signal),
      brand: slimBrand(brand),
      options,
      images: platform === "instagram" ? brandImages(brand) : [],
    },
    abortSignal
  );
}

export function rewrite({ platform, signal, brand, label, value, feedback, whole = false }) {
  return post("/api/ai", {
    task: "rewrite",
    platform,
    signal: slimSignal(signal),
    brand: slimBrand(brand),
    label,
    value,
    feedback,
    whole,
  });
}

export const quickJob = (task, input) => post("/api/ai", { task, input });

export const rankSignals = (brand, signals) =>
  post("/api/ai", { task: "rank", brand: slimBrand(brand), signals: signals.map(slimSignal) });

/**
 * Runs a search and calls onEvent for every line the server streams
 * ({ t: "status" | "query" | "reading" | "signal" | "ranked" | "done" | "error" }).
 * Resolves with { ok, ended } where ended is false when the stream stopped
 * without saying it was done (a dropped connection or a server timeout).
 */
export async function streamSearch({ config, brand }, onEvent, abortSignal) {
  let res;
  try {
    res = await fetch("/api/ai-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, brand: slimBrand(brand) }),
      signal: abortSignal,
    });
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, aborted: true };
    onEvent({ t: "error", ...OFFLINE });
    return { ok: false };
  }

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    onEvent({ t: "error", ...(data?.error?.message ? data.error : { code: "failed", message: "Something went wrong. Try again." }) });
    return { ok: false };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;
  let failed = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.t === "done") ended = true;
        if (event.t === "error") failed = true;
        onEvent(event);
      }
    }
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, aborted: true };
  }
  return { ok: ended && !failed, ended, failed };
}

// Image generation runs from the browser against Google with the key from
// Profile, so it is not bound by the server's time limit.
export async function genImage(prompt, googleKey) {
  if (!googleKey) return { error: "Add your Google AI key in Brand settings to render creatives." };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${googleKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      }
    );
    const d = await res.json();
    if (d.error) return { error: d.error.message || "Google returned an error." };
    const parts = d.candidates?.[0]?.content?.parts || [];
    const im = parts.find((p) => p.inlineData);
    if (im) return { image: `data:${im.inlineData.mimeType};base64,${im.inlineData.data}` };
    return { error: "No image came back. Try refining the prompt." };
  } catch (e) {
    return { error: e.message };
  }
}
