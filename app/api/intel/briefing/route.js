import { NextResponse } from "next/server";
import { errorJson } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { brandContext } from "../../../../lib/intel/brand";
import { dataConnected } from "../../../../lib/intel/source";
import { buildBriefing, isFresh, latestBriefing } from "../../../../lib/intel/briefing";

export const maxDuration = 120;

// The weekly briefing: GET reads the latest, POST makes this week's when the
// last one is a week old. Free, and at most one a week.
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

export async function POST(req) {
  try {
    const { user } = await requireMember("any");
    const latest = await latestBriefing(user);
    if (isFresh(latest)) return NextResponse.json({ briefing: latest, fresh: true });
    if (!dataConnected() || building.has(user.id)) return NextResponse.json({ briefing: latest, fresh: false, pending: building.has(user.id) });
    const body = await req.json().catch(() => ({}));
    building.add(user.id);
    try {
      const briefing = await buildBriefing({ user, ctx: brandContext(body.brand || {}, body.targets || {}) });
      return NextResponse.json({ briefing, fresh: true });
    } finally {
      building.delete(user.id);
    }
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
