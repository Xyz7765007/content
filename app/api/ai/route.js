import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req) {
  try {
    const { prompt, useOpus, images } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    // Build content: text only or multimodal with images
    let content;
    if (images && images.filter(Boolean).length > 0) {
      content = [];
      for (const img of images) {
        if (!img) continue;
        const match = img.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match) {
          content.push({
            type: "image",
            source: { type: "base64", media_type: match[1], data: match[2] },
          });
        }
      }
      content.push({ type: "text", text: prompt });
    } else {
      content = prompt;
    }

    const model = useOpus ? "claude-opus-4-6" : "claude-sonnet-4-6";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error?.message || `Anthropic API error ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
