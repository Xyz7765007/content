import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { brandContext, PLATFORM_IDS } from "../../../../lib/intel/brand";
import { dataConnected } from "../../../../lib/intel/source";
import { NEEDS, ground } from "../../../../lib/studio/ground";
import { sealPack } from "../../../../lib/studio/seal";

export const maxDuration = 120;

// Checks what Huesy knows before making something, researches only the gaps
// (included in Studio), and streams the decision:
//   { t: "step", id, label, status }  { t: "pack", pack }  { t: "done" }  { t: "error", ... }
export async function POST(req) {
  let user;
  let body;
  try {
    body = await req.json().catch(() => null);
    if (!NEEDS[body?.type]) throw fail("bad_request", 400);
    ({ user } = await requireMember("studio"));
    if (!dataConnected()) throw fail("data_unavailable", 503);
  } catch (err) {
    const { body: b, status } = errorJson(err);
    return NextResponse.json(b, { status });
  }
  const ctx = brandContext(body.brand || {}, body.targets || {});
  const platform = PLATFORM_IDS.includes(body.platform) ? body.platform : ctx.platforms[0];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          /* closed */
        }
      };
      try {
        const pack = await ground({
          type: body.type,
          platform,
          topic: String(body.topic || "").trim().slice(0, 120) || null,
          ctx,
          user,
          sourceIds: (body.sourceIds || []).slice(0, 12),
          borrowedFrom: PLATFORM_IDS.includes(body.borrowedFrom) && body.borrowedFrom === platform ? body.borrowedFrom : null,
          onStep: (s) => send({ t: "step", ...s }),
        });
        send({ t: "pack", pack: sealPack(pack) });
        send({ t: "done" });
      } catch (err) {
        const { body: b } = errorJson(err);
        send({ t: "error", ...b.error });
      } finally {
        try {
          controller.close();
        } catch {
          /* closed */
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
