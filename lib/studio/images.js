import { randomUUID } from "node:crypto";
import { isMock } from "../ai/client";
import { fail } from "../ai/errors";
import { recordSpend } from "../ai/usage";
import { getSupabaseAdmin } from "../supabase/server";

// Visuals for creatives and carousel slides.
//
// The image API (HIGGSFIELD_CREDENTIALS = "key_id:key_secret") is asynchronous:
// submit, then poll until the image is ready. Every submission carries an
// Idempotency-Key, so a retried request is never charged twice. Finished
// images are copied into Huesy's own storage, because the API's links expire
// after a week. Photos use a photoreal model (about $0.006 each); designs that
// need lettering use a typography model ($0.03).
//
// With the stand-in on, a calm abstract picture is drawn from the prompt, so
// layouts can be tried without spending anything.

const BASE = "https://api.higgsfield.ai";
const MODELS = {
  photo: { id: "higgsfield-ai/soul/v2/standard", usd: 0.0057, input: (prompt, aspect) => ({ prompt, aspect_ratio: aspect, resolution: "1080p", batch_size: 1, enhance_prompt: true }) },
  design: { id: "ideogram/v4.0", usd: 0.03, input: (prompt, aspect) => ({ prompt, aspect_ratio: aspect, rendering_speed: "DEFAULT" }) },
};

// Instagram's 4:5 portrait is cropped from 3:4.
const ASPECT = { "4:5": "3:4", "1:1": "1:1", "9:16": "9:16", "16:9": "16:9", "3:4": "3:4" };

export const imagesConnected = () => isMock() || Boolean(process.env.HIGGSFIELD_CREDENTIALS);

const headers = () => ({
  Authorization: `Key ${process.env.HIGGSFIELD_CREDENTIALS}`,
  "Content-Type": "application/json",
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(model, prompt, aspect) {
  const body = model.input(prompt, ASPECT[aspect] || "3:4");
  const send = (b) =>
    fetch(`${BASE}/${model.id}`, { method: "POST", headers: { ...headers(), "Idempotency-Key": randomUUID() }, body: JSON.stringify(b), signal: AbortSignal.timeout(20000) });
  let res = await send(body);
  // An unsupported ratio shouldn't cost the picture: try once without it.
  if (res.status === 400 || res.status === 422) {
    const { aspect_ratio: _drop, ...rest } = body;
    res = await send(rest);
  }
  const data = await res.json().catch(() => null);
  if (res.status === 403) throw Object.assign(fail("out_of_credit", 503), { detail: "image credit" });
  if (!res.ok || !data?.status_url) {
    console.error("[huesy:images] submit", res.status, JSON.stringify(data).slice(0, 300));
    throw fail("failed", 502);
  }
  return data;
}

async function poll(statusUrl, { timeoutMs = 90000 } = {}) {
  const started = Date.now();
  let delay = 2000;
  for (;;) {
    const res = await fetch(statusUrl, { headers: headers(), signal: AbortSignal.timeout(15000) });
    const data = await res.json().catch(() => null);
    const status = data?.status;
    if (status === "completed") return data;
    if (status === "nsfw") throw Object.assign(fail("declined", 422), { detail: "image filtered" });
    if (status === "failed" || status === "canceled") throw fail("failed", 502);
    if (Date.now() - started > timeoutMs) throw fail("busy", 504);
    await wait(delay);
    delay = Math.min(10000, Math.round(delay * 1.5));
  }
}

// Copies a finished image into private storage. Returns its path.
async function keep(url, userId) {
  const admin = getSupabaseAdmin();
  if (!admin || !userId || userId === "local") return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") || "image/jpeg";
  const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/visuals/${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from("uploads").upload(path, Buffer.from(await res.arrayBuffer()), { contentType: type, upsert: false });
  if (error) {
    console.error("[huesy:images] keep", error.message);
    return null;
  }
  return path;
}

export async function signedUrl(path, seconds = 60 * 60 * 24 * 7) {
  if (!path) return null;
  if (path.startsWith("data:") || path.startsWith("http")) return path;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.storage.from("uploads").createSignedUrl(path, seconds);
  return data?.signedUrl || null;
}

/* -------------------------------------------------------------- stand-in -- */

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const PALETTES = [
  ["#f4d8cd", "#e8a598", "#3d2b2b"],
  ["#dfe7e2", "#9cb8a8", "#23332b"],
  ["#efe3cf", "#d1a96b", "#3a2d1c"],
  ["#dde3ef", "#94a3c4", "#1f2638"],
  ["#f1dfe8", "#c792ad", "#3a2231"],
];

export function sampleVisual(prompt, aspect = "4:5") {
  const h = hash(prompt);
  const [bg, mid, ink] = PALETTES[h % PALETTES.length];
  const [w, hgt] = aspect === "1:1" ? [1080, 1080] : aspect === "9:16" ? [1080, 1920] : [1080, 1350];
  const cx = 300 + (h % 480);
  const cy = 360 + ((h >> 8) % 520);
  const r = 220 + ((h >> 16) % 200);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient><radialGradient id="s" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#s)"/><rect x="${w * 0.18}" y="${hgt * 0.42}" width="${w * 0.22}" height="${hgt * 0.34}" rx="36" fill="${ink}" fill-opacity="0.16"/><rect x="${w * 0.46}" y="${hgt * 0.36}" width="${w * 0.16}" height="${hgt * 0.4}" rx="60" fill="${ink}" fill-opacity="0.12"/><rect x="${w * 0.66}" y="${hgt * 0.5}" width="${w * 0.14}" height="${hgt * 0.26}" rx="28" fill="${ink}" fill-opacity="0.2"/><rect y="${hgt * 0.76}" width="100%" height="${hgt * 0.24}" fill="${ink}" fill-opacity="0.08"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/* ------------------------------------------------------------------- run -- */

// Makes one visual. `style` is "photo" or "design".
export async function generateImage({ prompt, aspect = "4:5", style = "photo", user }) {
  if (isMock()) {
    await wait(400);
    await recordSpend({ userId: user?.id, kind: "image", model: "stand-in", usd: 0, mock: true });
    return { url: sampleVisual(prompt, aspect), path: null, model: "stand-in", sample: true };
  }
  if (!process.env.HIGGSFIELD_CREDENTIALS) throw fail("not_connected", 503);
  const model = MODELS[style] || MODELS.photo;
  const job = await submit(model, prompt, aspect);
  const done = await poll(job.status_url);
  const url = done.images?.[0]?.url || done.output?.images?.[0]?.url || done.payload?.images?.[0]?.url;
  if (!url) throw fail("failed", 502);
  await recordSpend({ userId: user?.id, kind: "image", model: model.id, usd: model.usd });
  const path = await keep(url, user?.id);
  // With storage available, a picture that couldn't be kept fails, so the
  // piece isn't counted and no provider link is ever stored or shown.
  if (!path && getSupabaseAdmin() && user?.id && user.id !== "local") throw fail("failed", 502);
  return { url: path ? await signedUrl(path) : url, path, model: model.id, sample: false };
}

// The prompt an image model gets: the scene, the brand's look, and no text.
export function imagePrompt(scene, brand) {
  const direction = String(brand?.creativeDirection || "").slice(0, 400);
  return `${scene}. Photographic, natural light, clean composition with calm empty space for a headline. ${direction ? `Brand look: ${direction}. ` : ""}No text, no letters, no logos, no watermarks.`;
}
