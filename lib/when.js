// Small words for numbers and times, shared by the screens.

export const compact = (n) => {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const v = Number(n);
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(Math.round(v));
};

export const times = (x) => (x == null ? null : `${Math.round(Number(x) * 10) / 10}x`);

export function ago(at) {
  if (!at) return "";
  const t = typeof at === "number" ? at : new Date(at).getTime();
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const dayLabel = (at) => (at ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

// "in 5 h 12 min" / "2 h late"
export function countdown(due, now = Date.now()) {
  if (!due) return null;
  const ms = new Date(due).getTime() - now;
  const late = ms < 0;
  const m = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(m / 60);
  const text = h ? (m % 60 ? `${h} h ${m % 60} min` : `${h} h`) : `${m} min`;
  return { late, text, ms };
}
