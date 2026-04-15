import { NextResponse } from "next/server";

export const maxDuration = 60;

const MAX_IMG_B64_LEN = 800_000; // ~600KB decoded
const MAX_IMAGES = 4;

async function callAnthropic(apiKey, model, content) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: "user", content }] }),
  });

  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch {
    throw new Error(`Non-JSON response (${res.status}): ${raw.substring(0, 150)}`);
  }

  if (!res.ok) {
    throw new Error(data.error?.message || `API ${res.status}`);
  }

  return data.content?.map((c) => c.text || "").join("") || "";
}

export async function POST(req) {
  try {
    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { prompt, useOpus, images } = body;
    if (!prompt) return NextResponse.json({ error: "No prompt" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set in Vercel env vars" }, { status: 500 });

    // Build content (text or multimodal)
    let content;
    const validImgs = (images || []).filter(Boolean);

    if (validImgs.length > 0) {
      content = [];
      let ct = 0;
      for (const img of validImgs) {
        if (ct >= MAX_IMAGES) break;
        const match = img.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match && match[2].length <= MAX_IMG_B64_LEN) {
          content.push({ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } });
          ct++;
        }
      }
      content.push({ type: "text", text: prompt });
      if (content.length === 1) content = prompt; // all images skipped, text only
    } else {
      content = prompt;
    }

    // Try Opus first, fall back to Sonnet if it fails
    if (useOpus) {
      try {
        const text = await callAnthropic(apiKey, "claude-opus-4-6", content);
        return NextResponse.json({ text });
      } catch (e) {
        console.log("Opus failed, falling back to Sonnet:", e.message);
        try {
          const text = await callAnthropic(apiKey, "claude-sonnet-4-6", content);
          return NextResponse.json({ text, fallback: true });
        } catch (e2) {
          return NextResponse.json({ error: `Both Opus and Sonnet failed. Opus: ${e.message}. Sonnet: ${e2.message}` }, { status: 502 });
        }
      }
    }

    const text = await callAnthropic(apiKey, "claude-sonnet-4-6", content);
    return NextResponse.json({ text });

  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
