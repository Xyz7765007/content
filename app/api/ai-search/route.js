import { NextResponse } from "next/server";

export const maxDuration = 120;

export async function POST(req) {
  try {
    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { prompt } = body;
    if (!prompt) return NextResponse.json({ error: "No prompt" }, { status: 400 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      return NextResponse.json({ error: `Non-JSON from Anthropic (${res.status}): ${raw.substring(0, 150)}` }, { status: 502 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: data.error?.message || `API error ${res.status}` }, { status: res.status });
    }

    let text = "";
    for (const block of data.content || []) {
      if (block.type === "text") text += block.text;
    }

    return NextResponse.json({ text: text || "No results found." });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
