import { createHmac, timingSafeEqual } from "node:crypto";
import { cleanPack } from "./ground";

// The grounding pack makes a round trip through the browser between the
// evidence check and the writing. It's sealed on the way out and checked on
// the way back, so the evidence a piece is written on (and the proof shown
// with it) is exactly what the server measured.

const secret = () => process.env.HUESY_PACK_SECRET || process.env.SUPABASE_SECRET_KEY || null;
const sign = (clean, key) => createHmac("sha256", key).update(JSON.stringify(clean)).digest("base64url");

// The pack the browser receives: trimmed, with its seal.
export function sealPack(pack) {
  const clean = cleanPack(pack);
  const key = secret();
  return key ? { ...clean, sig: sign(clean, key) } : clean;
}

// The pack the browser sent back, or null when it was changed. Local
// development without a secret accepts it as is.
export function openPack(pack) {
  const clean = cleanPack(pack);
  if (!clean) return null;
  const key = secret();
  if (!key) return clean;
  const given = Buffer.from(String(pack?.sig || ""));
  const expected = Buffer.from(sign(clean, key));
  return given.length === expected.length && timingSafeEqual(given, expected) ? clean : null;
}
