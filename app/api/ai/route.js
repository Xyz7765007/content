import { NextResponse } from "next/server";
import { requireAccess } from "../../../lib/ai/access";
import { errorJson, fail } from "../../../lib/ai/errors";
import { rankSignals, runQuick, runRewrite, runWrite } from "../../../lib/ai/run";

export const maxDuration = 120;

// One endpoint for every non-search AI job. The server builds the prompt and
// picks the model from the task, so the browser never sends a raw prompt and
// can never choose a pricier model.
//
//   write    { platform, signal, brand, options, images }   -> { text }
//   rewrite  { platform, signal, brand, label, value, feedback, whole } -> { text }
//   tidy | brand-draft | instruction  { input }             -> { data } or { text }
//   rank     { brand, signals }                             -> { ranks }
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    const { body: b, status } = errorJson(fail("bad_request", 400));
    return NextResponse.json(b, { status });
  }

  try {
    const { user } = await requireAccess();
    switch (body?.task) {
      case "write":
        return NextResponse.json(await runWrite(body, user));
      case "rewrite":
        return NextResponse.json(await runRewrite(body, user));
      case "tidy":
      case "brand-draft":
      case "instruction":
        return NextResponse.json(await runQuick(body.task, body.input, user));
      case "rank":
        return NextResponse.json({ ranks: await rankSignals(body.brand, body.signals, user) });
      default:
        throw fail("bad_request", 400);
    }
  } catch (err) {
    const { body: b, status } = errorJson(err);
    return NextResponse.json(b, { status });
  }
}
