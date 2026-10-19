import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../lib/ai/errors";
import { getSupabaseAdmin, getSupabaseServer } from "../../../lib/supabase/server";
import { isSupabaseConfigured } from "../../../lib/supabase/env";

// The server's copy of a person's watchlists and everything they found. The
// browser merges it in on load, so a result can't be lost to a closed tab, a
// second device or signing out. Reading needs only a signed-in account (no
// plan, no spending check): it is the person's own data.
//
//   GET                  every watchlist and its signals
//   GET ?search=<id>     one watchlist's signals
//   DELETE ?search=<id>  forget a watchlist (its signals go with it)
//   PATCH { search, key, dismissed }  hide or restore one signal

async function signedIn() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw fail("sign_in", 401);
  return user;
}

const LIMIT = 400;

export async function GET(req) {
  try {
    const user = await signedIn();
    const admin = getSupabaseAdmin();
    if (!user || !admin) return NextResponse.json({ watchlists: [], signals: [] });
    const search = new URL(req.url).searchParams.get("search");
    let q = admin.from("watch_signals").select("search_id, signal_key, data, found_at").eq("user_id", user.id).is("dismissed_at", null).order("found_at", { ascending: false }).limit(LIMIT);
    if (search) q = q.eq("search_id", search.slice(0, 80));
    const [{ data: signals, error }, { data: lists }] = await Promise.all([
      q,
      search ? Promise.resolve({ data: [] }) : admin.from("watchlists").select("id, name, config, created_at, updated_at").eq("user_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(100),
    ]);
    if (error) throw fail("failed", 500);
    const { data: gone } = await admin.from("watchlists").select("id").eq("user_id", user.id).not("deleted_at", "is", null).limit(200);
    const deleted = new Set((gone || []).map((g) => g.id));
    return NextResponse.json({
      watchlists: (lists || []).filter((l) => !deleted.has(l.id)),
      signals: (signals || []).filter((s) => !deleted.has(s.search_id)).map((s) => ({ searchId: s.search_id, ...s.data, key: s.signal_key, foundAt: s.found_at })),
      deleted: [...deleted],
    });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req) {
  try {
    const user = await signedIn();
    const admin = getSupabaseAdmin();
    const search = new URL(req.url).searchParams.get("search");
    if (!search) throw fail("bad_request", 400);
    if (user && admin) {
      await admin.from("watchlists").upsert({ user_id: user.id, id: search.slice(0, 80), deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id,id" });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(req) {
  try {
    const user = await signedIn();
    const admin = getSupabaseAdmin();
    const body = await req.json().catch(() => null);
    const search = String(body?.search || "").slice(0, 80);
    if (!search) throw fail("bad_request", 400);
    if (user && admin) {
      if (body.restore === true) await admin.from("watchlists").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("id", search);
      if (body.key) await admin.from("watch_signals").update({ dismissed_at: body.dismissed ? new Date().toISOString() : null }).eq("user_id", user.id).eq("search_id", search).eq("signal_key", String(body.key).slice(0, 40));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
