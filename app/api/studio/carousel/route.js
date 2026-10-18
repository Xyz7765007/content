import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { allowanceLeft, claimAllowance, releaseAllowance } from "../../../../lib/billing/account";
import { brandContext } from "../../../../lib/intel/brand";
import { SLIDE_LAYOUTS, carouselOutline } from "../../../../lib/studio/write";
import { generateImage, imagePrompt, imagesConnected } from "../../../../lib/studio/images";
import { createItem, getItem, lockItem, markCountedLocal, unlockItem, updateItem } from "../../../../lib/studio/items";
import { THEMES } from "../../../../lib/studio/options";
import { LIMITS, allowanceMessage, limitError } from "../../../../lib/studio/limits";
import { openPack } from "../../../../lib/studio/seal";

export const maxDuration = 180;

// Slides from the browser keep only their words and layout. A photo is kept
// only when it's one the server made or stored for this carousel, so no
// slide can point at someone else's file.
const cleanSlides = (slides, known = []) => {
  const ours = (known || []).map((k) => k?.image).filter(Boolean);
  const match = (img) => (img ? ours.find((o) => (o.path && o.path === img.path) || (!o.path && o.url && o.url === img.url)) || null : null);
  return (Array.isArray(slides) ? slides : []).slice(0, 10).map((s) => ({
    layout: SLIDE_LAYOUTS.includes(s?.layout) ? s.layout : "tip",
    headline: String(s?.headline || "").slice(0, 120),
    body: String(s?.body || "").slice(0, 400),
    points: (Array.isArray(s?.points) ? s.points : []).map((p) => String(p).slice(0, 120)).slice(0, 4),
    imagePrompt: String(s?.imagePrompt || "").slice(0, 600),
    image: match(s?.image),
  }));
};

// A carousel, in steps:
//   outline   the slides, written from the grounding pack (free, up to 5 rounds)
//   generate  renders it: counts the carousel and makes up to 2 slide photos
//   image     a new photo for one slide (3 redos per carousel)
//   save      edits to slides, theme and caption
export async function POST(req) {
  let user;
  let claimed = null;
  try {
    const body = await req.json().catch(() => null);
    ({ user } = await requireMember("studio"));
    const ctx = brandContext(body?.brand || {}, body?.targets || {});


    const goal = String(body?.goal || "").slice(0, 80) || null;

    if (body?.action === "outline") {
      let item = body.itemId ? await getItem(user, body.itemId) : null;
      if (body.itemId && item?.kind !== "carousel") throw fail("not_found", 404);
      const pack = item ? item.grounding : openPack(body.pack);
      if (!pack) throw Object.assign(fail("bad_request", 400), { message: "The evidence check needs to run again. Start the carousel once more." });
      if (item?.body?.generated) throw fail("bad_request", 400);
      if (!item) {
        const a = await allowanceLeft(user, "carousel");
        const blocked = allowanceMessage("carousel", a.left, a.resetsAt);
        if (blocked) throw limitError(blocked);
      }
      const rounds = item?.body?.ideaRounds || 0;
      if (rounds >= LIMITS.ideaRounds) throw limitError("That's 5 outlines for this carousel. Edit this one, or start a new carousel.");
      const topic = String(body.topic || item?.body?.topic || "").trim().slice(0, 120) || null;
      const outline = await carouselOutline({ pack, ctx, topic, goal, user, slides: Math.max(4, Math.min(10, Number(body.slides) || 7)) });
      const next = {
        ...(item?.body || {}),
        platform: pack.platform,
        topic,
        goal,
        title: outline.title,
        slides: cleanSlides(outline.slides),
        caption: outline.caption,
        hashtags: outline.hashtags,
        why: outline.why,
        ideaRounds: rounds + 1,
        generated: false,
        imageRedos: 0,
        proof: pack.proof,
      };
      item = item
        ? await updateItem(user, item.id, { title: outline.title, body: next })
        : await createItem(user, { kind: "carousel", title: outline.title, grounding: pack, body: next });
      return NextResponse.json({ item, imagesConnected: imagesConnected() });
    }

    if (body?.action === "generate") {
      const item = await getItem(user, body.itemId);
      if (item?.kind !== "carousel") throw fail("not_found", 404);
      if (item.body?.generated) throw Object.assign(fail("bad_request", 400), { message: "This carousel is already made. Edit its slides, or make a new photo for one." });
      const slides = cleanSlides(body.slides || item.body?.slides);
      if (slides.length < 3) throw Object.assign(fail("bad_request", 400), { message: "A carousel needs at least 3 slides." });
      if (!(await lockItem(user, item.id))) throw Object.assign(fail("busy", 409), { message: "I'm already making this carousel. One moment." });
      try {
        if (!item.counted) {
          const used = await claimAllowance(user, "carousel", item.id);
          if (used > 0) claimed = item.id;
          await markCountedLocal(user, item.id);
        }
        const aspect = ["4:5", "1:1"].includes(body.aspect) ? body.aspect : "4:5";
        const wantImages = imagesConnected() && body.withImages !== false;
        const slots = slides.map((s, i) => (s.imagePrompt && !s.image ? i : -1)).filter((i) => i >= 0).slice(0, LIMITS.carouselImages);
        const made = wantImages
          ? await Promise.allSettled(slots.map((i) => generateImage({ prompt: imagePrompt(slides[i].imagePrompt, body.brand), aspect, style: "photo", user })))
          : [];
        made.forEach((r, k) => {
          if (r.status === "fulfilled") slides[slots[k]].image = { url: r.value.url, path: r.value.path, sample: r.value.sample };
        });
        claimed = null;
        const failedImages = made.filter((r) => r.status === "rejected").length;
        const saved = await updateItem(user, item.id, {
          body: { ...item.body, slides, generated: true, theme: THEMES[body.theme] ? body.theme : item.body?.theme || "blush", aspect, failedImages },
        });
        return NextResponse.json({ item: saved, failedImages });
      } finally {
        await unlockItem(user, item.id);
      }
    }

    if (body?.action === "image") {
      const item = await getItem(user, body.itemId);
      if (item?.kind !== "carousel" || !item.body?.generated || !item.counted) throw fail("bad_request", 400);
      if ((item.body.imageRedos || 0) >= LIMITS.carouselImageRedos) throw limitError("This carousel has used its 3 photo redos.");
      if (!imagesConnected()) throw Object.assign(fail("not_connected", 503), { message: "AI photos aren't switched on yet. Upload your own instead." });
      const i = Number(body.slideIndex);
      if (!Number.isInteger(i) || !item.body.slides?.[i]) throw fail("bad_request", 400);
      if (!(await lockItem(user, item.id))) throw Object.assign(fail("busy", 409), { message: "I'm already making a photo for this carousel. One moment." });
      try {
        // Counted before the picture is made, so parallel requests can't pass the limit.
        const fresh = await getItem(user, item.id);
        if ((fresh.body.imageRedos || 0) >= LIMITS.carouselImageRedos) throw limitError("This carousel has used its 3 photo redos.");
        const slides = cleanSlides(fresh.body.slides, fresh.body.slides);
        const prompt = String(body.prompt || slides[i].imagePrompt || slides[i].headline).slice(0, 600);
        const img = await generateImage({ prompt: imagePrompt(prompt, body.brand), aspect: fresh.body.aspect || "4:5", style: "photo", user });
        slides[i] = { ...slides[i], imagePrompt: prompt, image: { url: img.url, path: img.path, sample: img.sample } };
        const saved = await updateItem(user, item.id, { body: { ...fresh.body, slides, imageRedos: (fresh.body.imageRedos || 0) + 1 } });
        return NextResponse.json({ item: saved });
      } finally {
        await unlockItem(user, item.id);
      }
    }

    if (body?.action === "save") {
      const item = await getItem(user, body.itemId);
      if (item?.kind !== "carousel") throw fail("not_found", 404);
      const p = body.patch || {};
      const next = { ...item.body };
      if (Array.isArray(p.slides)) {
        const slides = cleanSlides(p.slides, item.body?.slides);
        // Once made, a carousel keeps at least three slides.
        if (!item.body?.generated || slides.length >= 3) next.slides = slides;
      }
      if (THEMES[p.theme]) next.theme = p.theme;
      if (["4:5", "1:1"].includes(p.aspect)) next.aspect = p.aspect;
      if (typeof p.caption === "string") next.caption = p.caption.slice(0, 3000);
      if (Array.isArray(p.hashtags)) next.hashtags = p.hashtags.map((h) => String(h).replace(/^#/, "").slice(0, 60)).filter(Boolean).slice(0, 15);
      if (typeof p.title === "string") next.title = p.title.slice(0, 140);
      const exported = p.exported === true && item.body?.generated;
      if (exported) next.exported = true;
      const saved = await updateItem(user, item.id, { title: typeof p.title === "string" ? p.title.slice(0, 140) : item.title, body: next, status: exported ? "ready" : item.status });
      return NextResponse.json({ item: saved });
    }

    throw fail("bad_request", 400);
  } catch (err) {
    if (claimed) await releaseAllowance("carousel", claimed);
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }
}
