import { NextResponse } from "next/server";
import { requireAccess } from "../../../lib/ai/access";
import { errorJson, fail } from "../../../lib/ai/errors";
import { runSearch } from "../../../lib/ai/run";

export const maxDuration = 300;

// Streams a search as it happens, one JSON object per line:
//   { t: "status", text }       what Huesy is doing
//   { t: "query", q }           a web search it just ran
//   { t: "reading", hosts }     sites in the results it is reading
//   { t: "signal", signal }     a finished signal, as soon as it is written
//   { t: "ranked", ranks }      [{ id, fit, angle }] for the brand
//   { t: "done", count }
//   { t: "error", code, message }
// Access problems answer before the stream starts, as plain JSON with a status.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    const { body: b, status } = errorJson(fail("bad_request", 400));
    return NextResponse.json(b, { status });
  }

  let user;
  try {
    ({ user } = await requireAccess());
  } catch (err) {
    const { body: b, status } = errorJson(err);
    return NextResponse.json(b, { status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          /* the reader went away; the run stops at the next abort check */
        }
      };
      try {
        await runSearch({ config: body?.config, brand: body?.brand, user, send, abort: req.signal });
      } catch (err) {
        if (req.signal?.aborted) return;
        const { body: b } = errorJson(err);
        send({ t: "error", ...b.error });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
