"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { ASPECTS, themeOf } from "../../lib/studio/options";

/**
 * The designs, drawn at their real size (1080 wide) and scaled to fit the
 * screen. Export renders the same node unscaled, so the file is exactly
 * what's on screen. Inline styles keep the design self-contained: no theme
 * tokens, so a dark app never leaks into a light creative.
 */

const SERIF = "var(--font-newsreader), Georgia, serif";
const SANS = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";

const fit = (text, sizes) => {
  const n = String(text || "").length;
  for (const [max, size] of sizes) if (n <= max) return size;
  return sizes[sizes.length - 1][1];
};

export function sizeOf(aspect) {
  const a = ASPECTS[aspect] || ASPECTS["4:5"];
  return { width: a.w, height: a.h };
}

// Fills its container's width and scales the design to match.
export function Scaled({ aspect, children, className, label }) {
  const { width, height } = sizeOf(aspect);
  const box = useRef(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={box} className={className} style={{ position: "relative", width: "100%", aspectRatio: `${width} / ${height}` }} role="img" aria-label={label}>
      <div style={{ position: "absolute", left: 0, top: 0, width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}

function Photo({ src, style }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" crossOrigin={src.startsWith("data:") ? undefined : "anonymous"} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style }} />;
}

// When there's no photo, a soft wash in the theme's colours stands in.
function Wash({ t, style }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(120% 90% at 85% 10%, ${t.accent}55 0%, transparent 55%), radial-gradient(90% 80% at 10% 95%, ${t.soft} 0%, transparent 60%), ${t.bg}`,
        ...style,
      }}
    />
  );
}

function Mark({ name, t, style }) {
  if (!name) return null;
  return <div style={{ fontFamily: SANS, fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em", color: t.ink, opacity: 0.85, ...style }}>{name}</div>;
}

/* --------------------------------------------------------------- creative -- */

export const CreativeCanvas = forwardRef(function CreativeCanvas({ aspect = "4:5", layout = "statement", theme = "blush", headline, subline, image, brandName }, ref) {
  const { width, height } = sizeOf(aspect);
  const t = themeOf(theme);
  const tall = height / width;
  const big = fit(headline, [[18, 116], [32, 98], [48, 84], [70, 72], [999, 62]]) * (tall > 1.5 ? 1.12 : 1);
  const base = { position: "relative", width, height, overflow: "hidden", background: t.bg, color: t.ink, fontFamily: SANS };
  const head = (size, extra) => <div style={{ fontFamily: SERIF, fontSize: size, lineHeight: 1.04, letterSpacing: "-0.02em", fontWeight: 500, ...extra }}>{headline}</div>;
  const sub = (extra) => (subline ? <div style={{ fontSize: 38, lineHeight: 1.3, marginTop: 28, opacity: 0.86, ...extra }}>{subline}</div> : null);

  if (layout === "split") {
    return (
      <div ref={ref} style={base}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "58%", overflow: "hidden" }}>{image ? <Photo src={image} /> : <Wash t={t} />}</div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "42%", background: t.bg, padding: "64px 80px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {head(big * 0.86)}
          {sub()}
        </div>
        <Mark name={brandName} t={image ? { ...t, ink: "#ffffff" } : t} style={{ position: "absolute", top: 56, left: 80 }} />
      </div>
    );
  }
  if (layout === "frame") {
    return (
      <div ref={ref} style={{ ...base, padding: 80, display: "flex", flexDirection: "column" }}>
        <Mark name={brandName} t={t} style={{ marginBottom: 36 }} />
        {head(big * 0.82)}
        {sub({ fontSize: 34 })}
        <div style={{ position: "relative", flex: 1, marginTop: 56, borderRadius: 40, overflow: "hidden", background: t.soft }}>{image ? <Photo src={image} /> : <Wash t={t} />}</div>
      </div>
    );
  }
  if (layout === "quote") {
    return (
      <div ref={ref} style={{ ...base, padding: 96, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <Wash t={t} style={{ opacity: 0.7 }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontFamily: SERIF, fontSize: 240, lineHeight: 0.6, color: t.accent, height: 120 }}>“</div>
          {head(big * 1.02, { marginTop: 24 })}
          {sub()}
        </div>
        <Mark name={brandName} t={t} style={{ position: "absolute", bottom: 72, left: 96 }} />
      </div>
    );
  }
  if (layout === "minimal") {
    return (
      <div ref={ref} style={base}>
        {image ? <Photo src={image} /> : <Wash t={t} />}
        <div style={{ position: "absolute", left: 64, right: 64, bottom: 64, background: t.soft, color: t.ink, borderRadius: 36, padding: "40px 48px" }}>
          {head(Math.min(64, big * 0.62))}
          {subline ? <div style={{ fontSize: 30, marginTop: 14, opacity: 0.8 }}>{subline}</div> : null}
        </div>
        <Mark name={brandName} t={image ? { ...t, ink: "#ffffff" } : t} style={{ position: "absolute", top: 56, left: 64 }} />
      </div>
    );
  }
  // statement: the headline over the photo
  const onPhoto = Boolean(image);
  return (
    <div ref={ref} style={base}>
      {image ? <Photo src={image} /> : <Wash t={t} />}
      {onPhoto ? <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,10,10,0.05) 30%, rgba(10,10,10,0.72) 100%)" }} /> : null}
      <div style={{ position: "absolute", left: 80, right: 80, bottom: 96, color: onPhoto ? "#ffffff" : t.ink }}>
        {head(big)}
        {sub()}
      </div>
      <Mark name={brandName} t={onPhoto ? { ...t, ink: "#ffffff" } : t} style={{ position: "absolute", top: 64, left: 80 }} />
    </div>
  );
});

/* ------------------------------------------------------------------ slide -- */

export const SlideCanvas = forwardRef(function SlideCanvas({ slide, index, total, aspect = "4:5", theme = "blush", brandName }, ref) {
  const { width, height } = sizeOf(aspect);
  const t = themeOf(theme);
  const s = slide || {};
  const layout = s.layout || "tip";
  const first = index === 0;
  const base = { position: "relative", width, height, overflow: "hidden", background: first || layout === "cta" ? t.bg : t.soft === "#ffffff" ? "#fffdfb" : t.soft, color: t.ink, fontFamily: SANS, padding: "96px 88px 140px", display: "flex", flexDirection: "column" };
  if (t.label === "Ink") base.background = first || layout === "cta" ? t.bg : "#232120";
  const H = (size, extra) => <div style={{ fontFamily: SERIF, fontSize: size, lineHeight: 1.05, letterSpacing: "-0.02em", fontWeight: 500, ...extra }}>{s.headline}</div>;
  const B = (extra) => (s.body ? <div style={{ fontSize: 38, lineHeight: 1.38, marginTop: 32, opacity: 0.85, ...extra }}>{s.body}</div> : null);
  const footer = (
    <div style={{ position: "absolute", left: 88, right: 88, bottom: 64, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28, opacity: 0.75 }}>
      <span style={{ fontWeight: 600 }}>{brandName}</span>
      <span>
        {index + 1}/{total}
      </span>
    </div>
  );

  let inner;
  if (layout === "hook") {
    inner = (
      <>
        <Wash t={t} style={{ opacity: 0.9 }} />
        <div style={{ position: "relative", marginTop: "auto", marginBottom: "auto" }}>
          {H(fit(s.headline, [[30, 120], [50, 100], [80, 86], [999, 72]]))}
          {B({ fontSize: 40 })}
        </div>
        <div style={{ position: "absolute", right: 88, bottom: 140, fontSize: 30, fontWeight: 600, color: t.accent }}>Swipe →</div>
      </>
    );
  } else if (layout === "stat") {
    inner = (
      <div style={{ marginTop: "auto", marginBottom: "auto" }}>
        {H(fit(s.headline, [[6, 260], [14, 170], [30, 110], [999, 84]]), { color: t.accent })}
        {B({ fontSize: 42 })}
      </div>
    );
  } else if (layout === "list") {
    inner = (
      <>
        {H(fit(s.headline, [[30, 84], [60, 72], [999, 62]]))}
        <ol style={{ listStyle: "none", padding: 0, margin: "48px 0 0", display: "flex", flexDirection: "column", gap: 28 }}>
          {(s.points?.length ? s.points : [s.body]).filter(Boolean).map((p, i) => (
            <li key={i} style={{ display: "flex", gap: 28, fontSize: 40, lineHeight: 1.3 }}>
              <span style={{ flexShrink: 0, width: 64, height: 64, borderRadius: 32, background: t.accent, color: t.label === "Ink" || t.label === "Sun" ? t.bg : "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 30 }}>{i + 1}</span>
              <span style={{ paddingTop: 8 }}>{p}</span>
            </li>
          ))}
        </ol>
      </>
    );
  } else if (layout === "compare") {
    const [before, after] = s.points?.length >= 2 ? s.points : [s.body, ""];
    inner = (
      <>
        {H(fit(s.headline, [[30, 84], [999, 66]]))}
        <div style={{ marginTop: 56, display: "grid", gridTemplateRows: "1fr 1fr", gap: 28, flex: 1 }}>
          {[before, after].map((x, i) => (
            <div key={i} style={{ borderRadius: 36, padding: "40px 44px", background: i ? t.accent : t.bg, color: i && (t.label === "Blush" || t.label === "Mist" || t.label === "Paper") ? "#ffffff" : i && t.label === "Sun" ? t.bg : t.ink, fontSize: 38, lineHeight: 1.3, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, opacity: 0.8, marginBottom: 12 }}>{i ? "After" : "Before"}</div>
              {String(x || "").replace(/^(before|after)\s*:\s*/i, "")}
            </div>
          ))}
        </div>
      </>
    );
  } else if (layout === "quote") {
    inner = (
      <div style={{ marginTop: "auto", marginBottom: "auto" }}>
        <div style={{ fontFamily: SERIF, fontSize: 220, lineHeight: 0.6, color: t.accent, height: 110 }}>“</div>
        <div style={{ fontFamily: SERIF, fontSize: fit(s.body || s.headline, [[60, 76], [120, 62], [999, 52]]), lineHeight: 1.15, marginTop: 24 }}>{s.body || s.headline}</div>
        {s.body ? <div style={{ fontSize: 34, marginTop: 36, opacity: 0.75 }}>{s.headline}</div> : null}
      </div>
    );
  } else if (layout === "image") {
    inner = (
      <>
        <div style={{ position: "relative", height: "52%", borderRadius: 40, overflow: "hidden", background: t.bg, marginBottom: 56 }}>{s.image?.url ? <Photo src={s.image.url} /> : <Wash t={t} />}</div>
        {H(fit(s.headline, [[30, 76], [999, 62]]))}
        {B({ fontSize: 36, marginTop: 24 })}
      </>
    );
  } else if (layout === "cta") {
    inner = (
      <>
        <Wash t={t} style={{ opacity: 0.9 }} />
        <div style={{ position: "relative", marginTop: "auto", marginBottom: "auto" }}>
          {H(fit(s.headline, [[30, 104], [60, 88], [999, 72]]))}
          {B({ fontSize: 40 })}
          <div style={{ display: "inline-block", marginTop: 56, padding: "26px 48px", borderRadius: 999, background: t.ink, color: t.bg, fontSize: 34, fontWeight: 600 }}>{brandName ? `Follow ${brandName}` : "Follow for more"}</div>
        </div>
      </>
    );
  } else {
    // tip: a numbered point
    inner = (
      <div style={{ marginTop: "auto", marginBottom: "auto" }}>
        <div style={{ fontFamily: SERIF, fontSize: 150, lineHeight: 1, color: t.accent }}>{String(index).padStart(2, "0")}</div>
        {H(fit(s.headline, [[30, 92], [60, 76], [999, 64]]), { marginTop: 24 })}
        {B()}
      </div>
    );
  }

  return (
    <div ref={ref} style={base}>
      {inner}
      {footer}
    </div>
  );
});
