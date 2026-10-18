import { NextResponse } from "next/server";
import { getSupabaseServer } from "../../../lib/supabase/server";

// Google sign in, email confirmation and password recovery all land here with
// a one time code. Exchange it for a session, then continue to wherever the
// flow asked to go.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/home";
  const safeNext = next.startsWith("/") ? next : "/home";

  if (code) {
    const supabase = await getSupabaseServer();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
