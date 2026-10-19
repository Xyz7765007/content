import { NextResponse } from "next/server";
import { errorJson } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { brandContext } from "../../../../lib/intel/brand";
import { marketMap } from "../../../../lib/intel/market";

export const maxDuration = 60;

// The market map for the signed-in brand: where its market talks, the words
// to search it with, its communities, competitors and review sources. Built
// once per brand profile (about $0.02) and cached, so screens can show what
// a piece of work will read before anyone spends credits on it.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { user } = await requireMember("any");
    const ctx = brandContext(body?.brand || {}, body?.targets || {});
    const map = await marketMap(ctx, { user, fresh: body?.fresh === true });
    return NextResponse.json({
      map: {
        businessType: map.businessType,
        summary: map.summary,
        country: map.country,
        platforms: map.platforms,
        terms: map.terms,
        hashtags: map.hashtags,
        subreddits: map.subreddits,
        competitors: map.competitors.map((c) => ({ name: c.name, website: c.website, instagram: c.instagram, x: c.x, linkedin: c.linkedin, youtube: c.youtube, tiktok: c.tiktok, suggested: c.suggested })),
        reviewSources: map.reviewSources,
        notes: map.notes,
        builtAt: map.builtAt,
      },
    });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
