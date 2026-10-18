import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { deleteThread, getThread, listMessages, listThreads } from "../../../../lib/intel/threads";

// The list of conversations, one conversation with its messages, or delete one.
export async function GET(req) {
  try {
    const { user } = await requireMember("any");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ threads: await listThreads(user) });
    const thread = await getThread(user, id);
    if (!thread) throw fail("not_found", 404);
    return NextResponse.json({ thread, messages: await listMessages(user, id) });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req) {
  try {
    const { user } = await requireMember("any");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw fail("bad_request", 400);
    await deleteThread(user, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
