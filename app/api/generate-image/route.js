import { NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/admin";
import { errorJson } from "../../../lib/ai/errors";

export const maxDuration = 60;

// Server side image rendering, used only when GOOGLE_AI_API_KEY is set on the
// deployment. The app renders in the browser with the key from Profile.
export async function POST(req) {
  try {
    // No screen uses this any more; only the owner can reach it.
    await requireAdmin();
  } catch (err) {
    const { body, status } = errorJson(err);
    return NextResponse.json(body, { status });
  }

  try {
    const { prompt } = await req.json();
    if (!prompt) return NextResponse.json({ error: "No prompt" }, { status: 400 });

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Image rendering isn't set up on the server." }, { status: 503 });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: String(prompt).slice(0, 8000) }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      }
    );

    const data = await res.json();

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 });
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData);

    if (imagePart) {
      return NextResponse.json({
        image: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
      });
    }

    return NextResponse.json({ error: "No image came back. Try refining the prompt." }, { status: 400 });
  } catch (e) {
    console.error("[huesy:image]", e?.message || e);
    return NextResponse.json({ error: "Couldn't render that just now. Try again." }, { status: 500 });
  }
}
