import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { getSupabaseAdmin } from "../../../../lib/supabase/server";

const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};
const MAX_MB = { image: 15, video: 200 };

// A one-time upload link for the person's own photos and reel references, in
// their private folder. The browser sends the file straight to storage.
export async function POST(req) {
  try {
    const { user } = await requireMember("studio");
    const body = await req.json().catch(() => null);
    const ext = TYPES[body?.contentType];
    if (!ext) throw Object.assign(fail("bad_request", 400), { message: "Use a JPG, PNG or WebP photo, or an MP4 or MOV video." });
    const kind = body.contentType.startsWith("video") ? "video" : "image";
    if (Number(body.size) > MAX_MB[kind] * 1048576) throw Object.assign(fail("bad_request", 400), { message: `Files can be up to ${MAX_MB[kind]} MB.` });
    const admin = getSupabaseAdmin();
    if (!admin) throw fail("not_connected", 503);
    const path = `${user.id}/${body.purpose === "reel" ? "reel-refs" : "photos"}/${randomUUID()}.${ext}`;
    const { data, error } = await admin.storage.from("uploads").createSignedUploadUrl(path);
    if (error) throw fail("failed", 500);
    return NextResponse.json({ path, uploadUrl: data.signedUrl, token: data.token });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
