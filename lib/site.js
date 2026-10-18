"use client";

// Small helpers for the public site: anonymous event counts, campaign tags,
// remembering that this browser already joined, and catching email typos.

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"];

// Campaign tags from the landing URL, kept for the visit so a join on a later
// page still knows where the person came from.
export function campaign() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const utm = {};
  for (const k of UTM_KEYS) if (params.get(k)) utm[k] = params.get(k).slice(0, 120);
  // A link that carries tags always counts; otherwise the visit keeps the
  // tags it arrived with.
  if (!Object.keys(utm).length) {
    try {
      const stored = JSON.parse(sessionStorage.getItem("huesy:utm") || "null");
      if (stored) return stored;
    } catch {
      /* private mode */
    }
  }
  const out = { utm, referrer: document.referrer ? document.referrer.slice(0, 300) : "" };
  try {
    sessionStorage.setItem("huesy:utm", JSON.stringify(out));
  } catch {
    /* fine without */
  }
  return out;
}

export function track(name, source) {
  if (typeof window === "undefined") return;
  const { utm, referrer } = campaign();
  const body = JSON.stringify({ name, source, path: window.location.pathname, referrer, utm });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/event", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    /* fall through to fetch */
  }
  fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

const JOINED_KEY = "huesy:joined";

export function readJoined() {
  try {
    return JSON.parse(localStorage.getItem(JOINED_KEY) || "null");
  } catch {
    return null;
  }
}

export function writeJoined(value) {
  try {
    if (value) localStorage.setItem(JOINED_KEY, JSON.stringify(value));
    else localStorage.removeItem(JOINED_KEY);
  } catch {
    /* fine without */
  }
  window.dispatchEvent(new Event("huesy:joined"));
}

// "gmial.com" and friends. Returns a corrected address, or null.
const DOMAIN_FIXES = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.co": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "icloud.co": "icloud.com",
  "iclod.com": "icloud.com",
};

export function suggestEmail(email) {
  const m = String(email || "").trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  if (!m) return null;
  const fix = DOMAIN_FIXES[m[2]];
  return fix ? `${m[1]}@${fix}` : null;
}

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
