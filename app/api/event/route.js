import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase/server";

// Anonymous counts for the waitlist site, so the team can see which part of
// the page people join from. Stores an event name and where it happened;
// never an IP address, a user agent or a cookie.

const NAMES = new Set(["view", "focus", "join", "already", "answer", "sample_run", "sheet_open"]);
const text = (v, max) => String(v || "").trim().slice(0, max) || null;

// A rough brake against floods, per server instance.
const recent = new Map();
function tooMany(key) {
  const now = Date.now();
  const list = (recent.get(key) || []).filter((t) => now - t < 60_000);
  list.push(now);
  recent.set(key, list);
  if (recent.size > 5000) recent.clear();
  return list.length > 40;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const name = String(body?.name || "");
  if (!NAMES.has(name)) return new NextResponse(null, { status: 204 });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (tooMany(ip)) return new NextResponse(null, { status: 204 });

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const utm = {};
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"]) {
      const v = text(body?.utm?.[k], 120);
      if (v) utm[k] = v;
    }
    const { error } = await supabase.from("site_events").insert({
      name,
      source: text(body?.source, 60),
      path: text(body?.path, 200),
      referrer: text(body?.referrer, 300),
      utm: Object.keys(utm).length ? utm : null,
    });
    if (error) console.error("[huesy:event]", error.message);
  }
  return new NextResponse(null, { status: 204 });
}
