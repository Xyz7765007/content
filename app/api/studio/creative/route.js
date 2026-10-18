import { NextResponse } from "next/server";
import { errorJson, fail } from "../../../../lib/ai/errors";
import { requireMember } from "../../../../lib/billing/guard";
import { allowanceLeft, claimAllowance, releaseAllowance } from "../../../../lib/billing/account";
import { brandContext } from "../../../../lib/intel/brand";
import { creativeConcepts } from "../../../../lib/studio/write";
import { generateImage, imagePrompt, imagesConnected, signedUrl } from "../../../../lib/studio/images";
import { createItem, getItem, lockItem, markCountedLocal, unlockItem, updateItem } from "../../../../lib/studio/items";
import { ASPECTS, CREATIVE_LAYOUTS, THEMES } from "../../../../lib/studio/options";
import { LIMITS, allowanceMessage, limitError } from "../../../../lib/studio/limits";
import { openPack } from "../../../../lib/studio/seal";

export const maxDuration = 120;

// A single image post, in three steps:
//   concepts  three ideas built on the grounding pack (free, up to 5 rounds)
//   visual    the picture: AI-made, uploaded, or design only. The first one
//             counts the creative against the month; up to 4 per creative.
//   save      edits to words, layout and colours
export async function POST(req) {
  let user;
  let claimed = null;
  try {
    const body = await req.json().catch(() => null);
    ({ user } = await requireMember("studio"));
    const ctx = brandContext(body?.brand || {}, body?.targets || {});
    // New pieces take the sealed pack from the evidence check; later rounds
    // use the evidence stored with the piece.

    const goal = String(body?.goal || "").slice(0, 80) || null;

    if (body?.action === "concepts") {
      let item = body.itemId ? await getItem(user, body.itemId) : null;
      if (body.itemId && item?.kind !== "creative") throw fail("not_found", 404);
      const pack = item ? item.grounding : openPack(body.pack);
      if (!pack) throw Object.assign(fail("bad_request", 400), { message: "The evidence check needs to run again. Start the creative once more." });
      if (!item) {
        const a = await allowanceLeft(user, "creative");
        const blocked = allowanceMessage("creative", a.left, a.resetsAt);
        if (blocked) throw limitError(blocked);
      }
      const rounds = item?.body?.ideaRounds || 0;
      if (rounds >= LIMITS.ideaRounds) throw limitError("That's 5 rounds of ideas for this creative. Pick one, or start a new creative.");
      const topic = String(body.topic || item?.body?.topic || "").trim().slice(0, 120) || null;
      const avoid = (item?.body?.concepts || []).map((c) => c.headline);
      const concepts = await creativeConcepts({ pack, ctx, topic, goal, user, avoid });
      const next = {
        ...(item?.body || {}),
        platform: pack.platform,
        topic,
        goal,
        aspect: ASPECTS[body.aspect] ? body.aspect : item?.body?.aspect || "4:5",
        concepts: [...(item?.body?.concepts || []), ...concepts],
        ideaRounds: rounds + 1,
        visuals: item?.body?.visuals || [],
        proof: pack.proof,
      };
      item = item
        ? await updateItem(user, item.id, { body: next })
        : await createItem(user, { kind: "creative", title: concepts[0]?.headline || "Creative", grounding: pack, body: next });
      return NextResponse.json({ item, imagesConnected: imagesConnected() });
    }

    if (body?.action === "visual") {
      const item = await getItem(user, body.itemId);
      if (item?.kind !== "creative") throw fail("not_found", 404);
      // Everything is checked before anything is counted.
      const visuals = item.body?.visuals || [];
      if (visuals.length >= LIMITS.creativeVisuals) throw limitError("This creative has used its 4 visuals. Pick one of them, or start a new creative.");
      const index = Number(body.conceptIndex);
      const concept = Number.isInteger(index) ? item.body?.concepts?.[index] : null;
      if (!concept) throw fail("bad_request", 400);
      const source = ["ai", "upload", "design"].includes(body.source) ? body.source : "ai";
      if (source === "ai" && !imagesConnected()) throw Object.assign(fail("not_connected", 503), { message: "AI visuals aren't switched on yet. Upload a photo or use a design-only layout." });
      const uploadPath = String(body.uploadPath || "");
      if (source === "upload" && (!uploadPath.startsWith(`${user.id}/photos/`) || uploadPath.includes(".."))) throw fail("bad_request", 400);
      // One picture at a time per creative.
      if (!(await lockItem(user, item.id))) throw Object.assign(fail("busy", 409), { message: "I'm already making a picture for this creative. One moment." });
      try {
        if (!item.counted) {
          const used = await claimAllowance(user, "creative", item.id);
          if (used > 0) claimed = item.id;
          await markCountedLocal(user, item.id);
        }
        let visual;
        if (source === "ai") {
          const img = await generateImage({ prompt: imagePrompt(concept.visual, body.brand), aspect: item.body?.aspect || "4:5", style: "photo", user });
          visual = { source, url: img.url, path: img.path, sample: img.sample, prompt: concept.visual };
        } else if (source === "upload") {
          visual = { source, path: uploadPath, url: await signedUrl(uploadPath) };
        } else visual = { source: "design" };
        claimed = null;
        const same = item.body?.chosen?.headline === concept.headline;
        const next = {
          ...item.body,
          chosen: concept,
          headline: same && item.body?.headline ? item.body.headline : concept.headline,
          subline: same ? item.body?.subline ?? concept.subline : concept.subline,
          layout: same ? item.body?.layout || concept.layout : concept.layout,
          caption: same ? item.body?.caption || concept.caption : concept.caption,
          hashtags: concept.hashtags,
          visuals: [...visuals, visual],
          active: visuals.length,
        };
        const saved = await updateItem(user, item.id, { title: next.headline, body: next });
        return NextResponse.json({ item: saved });
      } finally {
        await unlockItem(user, item.id);
      }
    }

    if (body?.action === "save") {
      const item = await getItem(user, body.itemId);
      if (item?.kind !== "creative") throw fail("not_found", 404);
      // Only the design's own settings, each checked; counters and pictures
      // are never taken from the browser.
      const p = body.patch || {};
      const patch = {};
      if (typeof p.headline === "string") patch.headline = p.headline.slice(0, 140);
      if (typeof p.subline === "string") patch.subline = p.subline.slice(0, 200);
      if (CREATIVE_LAYOUTS.includes(p.layout)) patch.layout = p.layout;
      if (THEMES[p.theme]) patch.theme = p.theme;
      if (ASPECTS[p.aspect]) patch.aspect = p.aspect;
      if (typeof p.caption === "string") patch.caption = p.caption.slice(0, 3000);
      if (Array.isArray(p.hashtags)) patch.hashtags = p.hashtags.map((h) => String(h).replace(/^#/, "").slice(0, 60)).filter(Boolean).slice(0, 15);
      if (Number.isInteger(p.active) && p.active >= 0 && p.active < (item.body?.visuals || []).length) patch.active = p.active;
      const exported = p.exported === true && (item.body?.visuals || []).length > 0;
      const saved = await updateItem(user, item.id, {
        title: patch.headline ?? item.title,
        body: { ...item.body, ...patch, ...(exported ? { exported: true } : {}) },
        status: exported ? "ready" : item.status,
      });
      return NextResponse.json({ item: saved });
    }

    throw fail("bad_request", 400);
  } catch (err) {
    if (claimed) await releaseAllowance("creative", claimed);
    const { body, status } = errorJson(err);
    if (err?.message && err.message !== body.error.message && ["allowance_used", "not_connected", "bad_request"].includes(err.code)) body.error.message = err.message;
    return NextResponse.json(body, { status });
  }
}
