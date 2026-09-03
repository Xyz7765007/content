import { NextResponse } from "next/server";

export const maxDuration = 30;

// Verifies that source links returned by the search actually resolve.
// A HEAD request first; many CDNs reject HEAD, so a ranged GET follows on 405.
// Anything not 2xx after redirects is reported as unverified. The client keeps
// the signal either way and labels the link, so nothing is hidden.
const MAX_URLS = 60;
const TIMEOUT_MS = 6000;

async function check(url) {
  let u;
  try { u = new URL(url); } catch { return { url, ok: false, status: 0, reason: "invalid" }; }
  if (!/^https?:$/.test(u.protocol)) return { url, ok: false, status: 0, reason: "protocol" };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; ContentEngine/1.0; link check)", Accept: "text/html,*/*" };
  try {
    let res = await fetch(u.toString(), { method: "HEAD", redirect: "follow", headers, signal: ctl.signal });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(u.toString(), { method: "GET", redirect: "follow", headers: { ...headers, Range: "bytes=0-8191" }, signal: ctl.signal });
    }
    clearTimeout(t);
    return { url, ok: res.status >= 200 && res.status < 400, status: res.status, finalUrl: res.url || u.toString() };
  } catch (e) {
    clearTimeout(t);
    return { url, ok: false, status: 0, reason: e.name === "AbortError" ? "timeout" : "network" };
  }
}

export async function POST(req) {
  try {
    const { urls } = await req.json();
    if (!Array.isArray(urls)) return NextResponse.json({ error: "urls must be an array" }, { status: 400 });
    const list = [...new Set(urls.filter((x) => typeof x === "string" && x.trim()))].slice(0, MAX_URLS);
    const results = await Promise.all(list.map(check));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
