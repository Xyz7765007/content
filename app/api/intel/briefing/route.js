import { NextResponse } from "next/server";
import { errorJson } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { brandContext } from "../../../../lib/intel/brand";
import { dataConnected } from "../../../../lib/intel/source";
import { buildBriefing, isFresh, latestBriefing, pickedPlatforms } from "../../../../lib/intel/briefing";
import { getSupabaseAdmin } from "../../../../lib/supabase/server";

export const maxDuration = 120;

// The weekly briefing: GET reads the latest, POST makes this week's when the
// last one is a week old. Free. Changing its platforms rebuilds it at once,
// a few times a day at most (each one reads every platform afresh).
export async function GET() {
  try {
    const { user } = await requireMember("any");
    const briefing = await latestBriefing(user);
    return NextResponse.json({ briefing, fresh: isFresh(briefing) });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}

const building = new Set();
const CHANGES_A_DAY = 3;

const same = (a = [], b = []) => a.length === b.length && a.every((p) => b.includes(p));

async function changesToday(user) {
  const admin = getSupabaseAdmin();
  if (!admin || user?.id === "local") return 0;
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from("intel_reports").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("kind", "briefing").gte("created_at", since).eq("params->>picked", "true");
  return count || 0;
}

export async function POST(req) {
  try {
    const { user } = await requireMember("any");
    const body = await req.json().catch(() => ({}));
    const picked = pickedPlatforms(body.platforms);
    const latest = await latestBriefing(user);
    // New platforms picked: rebuild now, within the day's few changes.
    const changed = body.refresh && picked.length && !same(picked, latest?.body?.asked || latest?.body?.platforms?.map((p) => p.platform) || []);
    if (changed && (await changesToday(user)) >= CHANGES_A_DAY) {
      return NextResponse.json({ briefing: latest, fresh: isFresh(latest), limited: true, message: "You've changed the platforms a few times today. The briefing reads the new ones from tomorrow." });
    }
    if (isFresh(latest) && !changed) return NextResponse.json({ briefing: latest, fresh: true });
    if (!dataConnected() || building.has(user.id)) return NextResponse.json({ briefing: latest, fresh: false, pending: building.has(user.id) });
    building.add(user.id);
    try {
      const briefing = await buildBriefing({ user, ctx: brandContext(body.brand || {}, body.targets || {}), picked });
      return NextResponse.json({ briefing, fresh: true });
    } finally {
      building.delete(user.id);
    }
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
