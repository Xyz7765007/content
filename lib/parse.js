// Parsing and export helpers. The ===SECTION=== contract and the CSV shape are
// unchanged from v1 so previously generated content still renders.

export function parseSections(t) {
  const s = {};
  const re = /===(\w+)===([\s\S]*?)(?====\w|$)/g;
  let m;
  while ((m = re.exec(String(t || ""))) !== null) s[m[1].trim()] = m[2].trim();
  return s;
}

// Sections in the order written, without empty ones or a thread the model
// chose to skip ("none").
export function sectionList(t) {
  return Object.entries(parseSections(t))
    .filter(([, v]) => v && !/^none\.?$/i.test(v.trim()))
    .map(([key, value]) => ({ key, value }));
}

// Replaces one section's text, leaving the others exactly as they were.
export function replaceSection(t, key, value) {
  const re = new RegExp(`(===${key}===\\s*)[\\s\\S]*?\\s*(?====\\w|$)`);
  const text = String(t || "");
  return re.test(text) ? text.replace(re, () => `===${key}===\n${value}\n\n`).trim() : `${text}\n\n===${key}===\n${value}`.trim();
}

export function parseCSV(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const pl = (line) => {
    const r = [];
    let c = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        r.push(c.trim());
        c = "";
      } else c += ch;
    }
    r.push(c.trim());
    return r;
  };
  const headers = pl(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const v = pl(l);
    const o = {};
    headers.forEach((h, i) => {
      o[h] = v[i] || "";
    });
    return o;
  });
  return { headers, rows };
}

// Every draft for the given signals, one row per section.
export function exportDraftsCSV(drafts, signals, filename = "huesy_posts.csv") {
  const rows = [["Signal", "Source URL", "Platform", "Section", "Content"]];
  for (const n of signals) {
    for (const [platform, d] of Object.entries(drafts?.[n.id] || {})) {
      const list = sectionList(d?.text);
      if (list.length) {
        for (const { key, value } of list) {
          rows.push([n.headline, n.url || "", platform, key.replace(/_/g, " ").toLowerCase(), String(value).replace(/"/g, '""')]);
        }
      } else rows.push([n.headline, n.url || "", platform, "post", String(d?.text || "").replace(/"/g, '""')]);
    }
  }
  downloadCSV(rows, filename);
}

export function exportSignalsCSV(signals, filename = "signals_export.csv") {
  const rows = [["Headline", "Brand", "Type", "Source", "Date", "Fit (1 to 5)", "Angle", "Summary", "Why it matters", "URL"]];
  const q = (v) => String(v || "").replace(/"/g, '""');
  for (const s of signals) {
    rows.push([
      q(s.headline),
      q(s.brand),
      q(s.type),
      q(s.source),
      q(s.date),
      s.fit || "",
      q(s.angle),
      q(s.summary),
      q(s.significance),
      s.url || "",
    ]);
  }
  downloadCSV(rows, filename);
}

function downloadCSV(rows, filename) {
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const b = new Blob([csv], { type: "text/csv" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = u;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(u);
}

export function resizeImg(dataUrl, max = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > max || h > max) {
        const r = Math.min(max / w, max / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// The model returns a human date string such as "April 12, 2026". Sorting needs
// a number, and an unparseable date must not silently jump to the top.
export function dateValue(raw) {
  if (!raw) return 0;
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) return t;
  const m = String(raw).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return Date.parse(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`);
  return 0;
}

export function relativeDay(raw) {
  const v = dateValue(raw);
  if (!v) return raw || "Date unknown";
  // Dates come as calendar days, so compare calendar days, not hours.
  const day = (t) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const isoDay = /^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim());
  const then = isoDay ? Date.parse(`${String(raw).trim()}T00:00:00Z`) : day(v);
  const days = Math.round((day(Date.now()) - then) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  return new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// How long ago something happened, for "last checked" lines.
export function ago(ts) {
  if (!ts) return "never";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "last week";
  return `${Math.floor(d / 7)} weeks ago`;
}

export const daysSince = (ts) => (ts ? (Date.now() - ts) / 86400000 : Infinity);

export const checkedLine = (ts) => (ts ? `Last checked ${ago(ts)}` : "Not checked yet");

// Every signal must be clickable. When the model returns a bare URL we use it,
// otherwise we fall back to a news search for the exact headline.
export function resolveSignalUrl(signal) {
  const raw = (signal?.url || "").trim();
  if (/^https?:\/\/\S+$/i.test(raw)) return raw;
  const q = encodeURIComponent(`${signal?.headline || ""} ${signal?.brand || ""}`.trim());
  return `https://news.google.com/search?q=${q}`;
}

// True when the signal carries its own source link, rather than the news
// search we fall back to.
export const hasSourceLink = (signal) => /^https?:\/\/\S+$/i.test(String(signal?.url || "").trim());

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
