import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (v, max) => String(v || "").trim().slice(0, max);

function utmFrom(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"]) {
    if (raw[k]) out[k] = text(raw[k], 120);
  }
  return Object.keys(out).length ? out : null;
}

// Join the waitlist. Answers with a one time token that lets this browser
// add the optional "what should Huesy watch" answer; a repeat join answers
// `already` and no token, so knowing an address never lets anyone edit it.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That didn't come through. Try again." }, { status: 400 });
  }

  // A field people never see. Bots fill it; they get a quiet success.
  if (text(body?.website, 200)) return NextResponse.json({ ok: true });

  const email = text(body?.email, 254).toLowerCase();
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "The waitlist isn't connected on this deployment yet." },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("waitlist")
    .insert({
      email,
      source: text(body?.source, 60) || "site",
      referrer: text(body?.referrer, 300) || null,
      utm: utmFrom(body?.utm),
    })
    .select("edit_token")
    .single();

  if (error?.code === "23505") return NextResponse.json({ ok: true, already: true });
  if (error) {
    console.error("[huesy:waitlist]", error.message);
    return NextResponse.json({ error: "Couldn't save that just now. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token: data?.edit_token || null });
}

// The optional follow-up answer, written with the token from the join.
export async function PATCH(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That didn't come through." }, { status: 400 });
  }

  const token = text(body?.token, 64);
  const watch = text(body?.watch, 160);
  if (!/^[0-9a-f-]{36}$/i.test(token) || !watch) {
    return NextResponse.json({ error: "That didn't come through." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Not connected." }, { status: 503 });

  const { error } = await supabase
    .from("waitlist")
    .update({ watch, updated_at: new Date().toISOString() })
    .eq("edit_token", token);

  if (error) {
    console.error("[huesy:waitlist] answer", error.message);
    return NextResponse.json({ error: "Couldn't save that just now." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
