import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { deleteItem, getItem, listItems, updateItem } from "../../../../lib/studio/items";
import { imagesConnected, signedUrl } from "../../../../lib/studio/images";

// Fresh links for any stored pictures: stored paths never expire, links do.
// Only the person's own files ever get a link.
async function withUrls(item, user) {
  if (!item?.body) return item;
  const own = (path) => typeof path === "string" && path.startsWith(`${user.id}/`) && !path.includes("..");
  const link = async (path) => (own(path) ? signedUrl(path) : null);
  const body = { ...item.body };
  if (Array.isArray(body.visuals)) body.visuals = await Promise.all(body.visuals.map(async (v) => (v?.path ? { ...v, url: await link(v.path) } : v)));
  if (Array.isArray(body.slides)) body.slides = await Promise.all(body.slides.map(async (s) => (s?.image?.path ? { ...s, image: { ...s.image, url: await link(s.image.path) } } : s)));
  return { ...item, body };
}

export async function GET(req) {
  try {
    const { user } = await requireMember("studio");
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id) {
      const item = await getItem(user, id);
      if (!item) throw fail("not_found", 404);
      return NextResponse.json({ item: await withUrls(item, user), imagesConnected: imagesConnected() });
    }
    const kind = url.searchParams.get("kind") || undefined;
    const items = await listItems(user, { kind });
    return NextResponse.json({ items: await Promise.all(items.map((i) => withUrls(i, user))) });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}

// Renames a piece, or saves a written post's edited text. Designs save
// through their own routes; nothing else in a piece is taken from here.
export async function PATCH(req) {
  try {
    const { user } = await requireMember("studio");
    const body = await req.json().catch(() => null);
    const item = await getItem(user, body?.id);
    if (!item) throw fail("not_found", 404);
    const patch = {};
    if (typeof body.title === "string") patch.title = body.title.slice(0, 140);
    if (item.kind === "text") {
      if (typeof body.body?.text === "string") patch.body = { ...item.body, text: body.body.text.slice(0, 20000) };
      if (body.status === "ready" || body.status === "draft") patch.status = body.status;
    }
    return NextResponse.json({ item: await withUrls(await updateItem(user, item.id, patch), user) });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(req) {
  try {
    const { user } = await requireMember("studio");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw fail("bad_request", 400);
    await deleteItem(user, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
