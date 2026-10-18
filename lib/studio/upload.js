"use client";

import { sendJson } from "../stream";

// Sends a photo or video straight to the person's private storage folder:
// the server hands out a one-time link, the browser uploads to it.
export async function uploadFile(file, purpose = "photo") {
  if (!file) return { error: { code: "bad_request", message: "Choose a file first." } };
  const link = await sendJson("/api/studio/upload", { contentType: file.type, size: file.size, purpose });
  if (link.error) return link;
  try {
    const res = await fetch(link.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
    if (!res.ok) return { error: { code: "failed", message: "That upload didn't go through. Try again." } };
  } catch {
    return { error: { code: "network", message: "I couldn't upload that. Check your connection and try again." } };
  }
  return { path: link.path };
}
