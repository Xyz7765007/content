// Local persistence for bookmarks, saved drafts and folders.
// Everything lives in this browser's localStorage. No accounts yet, so this is
// per-device. Every read and write is wrapped: storage can be unavailable
// (private windows, blocked site data) and the app must keep working.

const KEY = "ce_saved_v1";
const EMPTY = { signals: {}, drafts: {}, folders: [], sourceOpened: {} };
const COLORS = ["#FFC2D1", "#D3E5EF", "#CBE8BE", "#FAF0C8", "#EBE6F7", "#DCEEEE"];

export function loadSaved() {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return { ...EMPTY, ...parsed };
  } catch { return { ...EMPTY }; }
}

export function persistSaved(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function uid() { return Math.random().toString(36).slice(2, 9); }

// Stable identity for a fetched signal so a re-fetch of the same story keeps
// the same bookmark: prefer the source URL, fall back to a normalised headline.
export function signalKey(n) {
  if (n.url) {
    try {
      const u = new URL(n.url);
      const params = [...u.searchParams.entries()].filter(([k]) => !/^(utm_|fbclid|gclid|ref$|igshid|mc_cid)/i.test(k)).sort();
      return `u:${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${params.length ? "?" + params.map(([k, v]) => `${k}=${v}`).join("&") : ""}`.toLowerCase();
    } catch {}
  }
  return "h:" + (n.headline || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
}

export function snapshotSignal(n) {
  return {
    key: signalKey(n), headline: n.headline, brand: n.brand, source: n.source, url: n.url || "", domain: n.domain || "",
    summary: n.summary, significance: n.significance, date: n.date, type: n.type || "other", hot: n.hot || 0,
    verified: n.verified || null, savedAt: Date.now(), folders: [],
  };
}

export function newFolder(state, name) {
  const clean = (name || "").trim();
  if (!clean) return null;
  const f = { id: uid(), name: clean, color: COLORS[state.folders.length % COLORS.length], createdAt: Date.now() };
  state.folders.push(f);
  return f;
}

// Three folder names derived from the signal itself, for the first save.
export function suggestFolders(n) {
  const words = (n.headline || "").split(/\s+/);
  const kw = words.find((w) => /^[A-Z][a-z]{3,}/.test(w) && !(n.brand || "").includes(w));
  const typeLabel = { product_launch: "Launches", market_move: "Market moves", repositioning: "Repositions", expansion: "Expansions", campaign: "Campaigns", controversy: "Controversies", collab: "Collabs" }[n.type] || "Ideas";
  return [...new Set([n.brand, typeLabel, kw].filter(Boolean))].slice(0, 3);
}

export function domainOf(url) {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return ""; }
}
