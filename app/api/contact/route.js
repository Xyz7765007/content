import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = String(body?.name || "").trim().slice(0, 120);
  const email = String(body?.email || "").trim().toLowerCase();
  const company = String(body?.company || "").trim().slice(0, 120);
  const message = String(body?.message || "").trim().slice(0, 4000);

  if (!name) return NextResponse.json({ error: "Add your name." }, { status: 400 });
  if (!EMAIL.test(email))
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  if (message.length < 10)
    return NextResponse.json({ error: "Say a little more so we can help." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "The contact form is not connected on this deployment yet." },
      { status: 503 }
    );
  }

  const { error } = await supabase
    .from("contact_messages")
    .insert({ name, email, company: company || null, message });

  if (error) {
    return NextResponse.json({ error: "Could not send that just now. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
