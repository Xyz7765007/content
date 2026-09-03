// Small inline glyphs used by the re-skinned UI. Minimal by design: the app
// has eight signal types, four output platforms and seven research sources,
// each of which needs a mark that reads at 12px on a pastel fill.

const svg = (children, extra = {}) => (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false" {...extra}>{children}</svg>
);

export const TYPE_GLYPH = {
  product_launch: svg(<path d="M6 1.4 10.6 10.6H1.4z" fill="currentColor" />),
  market_move: svg(<path d="M1.5 9.2 4.6 5.6 7 7.6 10.5 3.2M7.6 3.2h2.9v2.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />),
  repositioning: svg(<path d="M9.9 4.3A4.2 4.2 0 0 0 2.2 5.3M10 1.6v2.7H7.3M2.1 7.7a4.2 4.2 0 0 0 7.7-1M2 10.4V7.7h2.7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />),
  expansion: svg(<><circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M6 3.6v4.8M3.6 6h4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>),
  campaign: svg(<><path d="M1.6 4.8v2.4h1.9l4 2.4V2.4l-4 2.4z" fill="currentColor" /><path d="M9.4 4.3a2.1 2.1 0 0 1 0 3.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></>),
  controversy: svg(<><path d="M6 1.6 11 10.4H1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 4.6v2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="6" cy="8.9" r=".6" fill="currentColor" /></>),
  collab: svg(<><circle cx="4.4" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="7.6" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" /></>),
  custom: svg(<path d="M6 1.2 7.3 4.7 10.8 6 7.3 7.3 6 10.8 4.7 7.3 1.2 6 4.7 4.7z" fill="currentColor" />),
  other: svg(<circle cx="6" cy="6" r="3" fill="currentColor" />),
};

export const TYPE_LABEL = {
  product_launch: "Launch", market_move: "Market move", repositioning: "Reposition", expansion: "Expansion",
  campaign: "Campaign", controversy: "Controversy", collab: "Collab", custom: "Custom", other: "Signal",
};

export function TypeBadge({ type }) {
  const t = TYPE_GLYPH[type] ? type : "other";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px 0 6px", borderRadius: "var(--r-chip)",
      fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", fontWeight: 500,
      background: `var(--t-${t}-f)`, color: `var(--t-${t}-i)`, whiteSpace: "nowrap",
    }}>
      {TYPE_GLYPH[t]}{TYPE_LABEL[t]}
    </span>
  );
}

// Two-letter marks for platforms and research sources, set in mono on a soft fill.
export function Mark({ text, tone = "neutral", size = 22 }) {
  const tones = {
    neutral: ["var(--sunken)", "var(--ink-2)"],
    accent: ["var(--accent-soft)", "var(--accent)"],
    azure: ["var(--azure-soft)", "var(--link)"],
  }[tone] || ["var(--sunken)", "var(--ink-2)"];
  return (
    <span aria-hidden="true" style={{
      display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: 6, flex: "none",
      background: tones[0], color: tones[1], fontFamily: "var(--f-mono)", fontSize: size <= 22 ? 10 : 12, fontWeight: 500, letterSpacing: ".02em",
    }}>{text}</span>
  );
}

export const PLATFORM_MARK = { instagram: "ig", linkedin: "in", twitter: "x", email: "em" };
export const RESEARCH_MARK = { google: "g", twitter: "x", instagram: "ig", reddit: "r", linkedin: "in", youtube: "yt", tiktok: "tt" };

export function BookmarkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M4 2.5h8a.5.5 0 0 1 .5.5v10.4l-4.5-2.7L3.5 13.4V3a.5.5 0 0 1 .5-.5z" />
    </svg>
  );
}

export function CheckIcon({ color = "currentColor" }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6.5 4.8 9 10 3.5" />
    </svg>
  );
}

export function Wordmark({ size = 20 }) {
  return (
    <span style={{ fontFamily: "var(--f-display)", fontWeight: 600, fontSize: size, letterSpacing: "-.01em", color: "var(--ink)", lineHeight: 1 }}>
      Content <span style={{ color: "var(--accent)" }}>Engine</span>
    </span>
  );
}
