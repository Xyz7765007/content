import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { requireTextAllowance } from "../../../../lib/billing/account";
import { brandContext } from "../../../../lib/intel/brand";
import { TEXT_PLATFORMS, writeText } from "../../../../lib/studio/write";
import { createItem, getItem, updateItem } from "../../../../lib/studio/items";
import { openPack } from "../../../../lib/studio/seal";

export const maxDuration = 120;

// A text post built on a grounding pack. Unlimited in Studio, with a daily
// fair-use line. Saved to the Library as it is written.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!TEXT_PLATFORMS.includes(body?.platform)) throw fail("bad_request", 400);
    const { user } = await requireMember("studio");
    await requireTextAllowance(user);
    const ctx = brandContext(body.brand || {}, body.targets || {});
    const topic = String(body.topic || "").trim().slice(0, 120) || null;
    const existing = body.itemId ? await getItem(user, body.itemId) : null;
    if (body.itemId && !existing) throw fail("not_found", 404);
    const pack = existing ? existing.grounding : openPack(body.pack);
    if (!pack) throw Object.assign(fail("bad_request", 400), { message: "The evidence check needs to run again. Start the post once more." });
    const feedback = String(body.feedback || "").trim().slice(0, 300) || null;
    const text = await writeText({ platform: body.platform, pack, ctx, topic: topic || existing?.body?.topic || null, goal: body.goal, user, previous: feedback ? existing?.body?.text : null, feedback });
    const content = { platform: body.platform, text, topic: topic || existing?.body?.topic || null, proof: pack.proof };
    let item;
    if (existing) {
      item = await updateItem(user, body.itemId, { body: { ...existing.body, ...content, versions: [...(existing.body?.versions || []), existing.body?.text].filter(Boolean).slice(-5) } });
    } else {
      item = await createItem(user, { kind: "text", title: (topic || text.split("\n").find((l) => l && !l.startsWith("==="))) || "Post", grounding: pack, body: content });
    }
    return NextResponse.json({ item });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
