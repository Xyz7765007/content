import { NextResponse } from "next/server";
import { errorJson } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { latestOnly, queryFindings } from "../../../../lib/intel/findings";

// What Huesy knows about this person's market: the newest fact per pattern.
export async function GET(req) {
  try {
    const { user } = await requireMember("any");
    const url = new URL(req.url);
    const platform = url.searchParams.get("platform") || undefined;
    const kind = url.searchParams.get("kind");
    const ids = url.searchParams.get("ids");
    const findings = await queryFindings(user, {
      platform,
      kinds: kind ? [kind] : undefined,
      ids: ids ? ids.split(",").filter(Boolean).slice(0, 40) : undefined,
      sinceDays: 90,
      limit: 200,
    });
    return NextResponse.json({ findings: ids ? findings : latestOnly(findings) });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
