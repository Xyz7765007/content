// Reads a server stream of one JSON object per line and hands each to onEvent.
// Resolves, never throws: { ok } when the stream ended with "done", and the
// failure reaches onEvent as { t: "error", code, message }.

const OFFLINE = { code: "network", message: "I couldn't reach Huesy. Check your connection and try again." };

export async function streamNdjson(url, payload, onEvent, signal) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, aborted: true };
    onEvent({ t: "error", ...OFFLINE });
    return { ok: false };
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    onEvent({ t: "error", ...(data?.error?.message ? data.error : { code: "failed", message: "Something went wrong. Try again." }), status: res.status });
    return { ok: false, status: res.status };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;
  let failed = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.t === "done") ended = true;
        if (event.t === "error") failed = true;
        onEvent(event);
      }
    }
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, aborted: true };
    onEvent({ t: "error", ...OFFLINE });
    return { ok: false };
  }
  if (!ended && !failed) onEvent({ t: "error", code: "network", message: "The answer was cut off. Try again." });
  return { ok: ended && !failed, ended, failed };
}

export async function getJson(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) return { error: data?.error || { code: "failed", message: "Something went wrong. Try again." }, status: res.status };
    return data || {};
  } catch {
    return { error: OFFLINE };
  }
}

export async function sendJson(url, payload, method = "POST", { keepalive = false } = {}) {
  try {
    const res = await fetch(url, { method, keepalive, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) return { error: data?.error || { code: "failed", message: "Something went wrong. Try again." }, status: res.status };
    return data || {};
  } catch {
    return { error: OFFLINE };
  }
}
