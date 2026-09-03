"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { TypeBadge, Mark, PLATFORM_MARK, Wordmark, CheckIcon } from "./icons";
import { loadSaved, persistSaved, signalKey, domainOf } from "../lib/saved";
import { BookmarkButton, FolderPop, Toast } from "./saved-ui";
import Opening from "./Opening";
import SavedDrawer from "./SavedDrawer";
import { DEMO_BRAND, DEMO_NEWS } from "../lib/demo";

// =================== CONSTANTS ===================

const STEPS = ["Brand Setup","Targets","Signals","Fetch News","Select News","Platforms","Content","Results"];
const SIGNAL_TYPES = [
  { id: "product_launch", label: "New Product Launch", desc: "Brand launches or announces a new product or service" },
  { id: "market_move", label: "Noticeable Market Move", desc: "Significant shifts in positioning, pricing, or strategy" },
  { id: "repositioning", label: "Brand Repositioning", desc: "Brand pivots identity, messaging, or audience" },
  { id: "expansion", label: "Brand Expansion", desc: "New markets, geographies, categories, or partnerships" },
  { id: "campaign", label: "Major Campaign", desc: "Notable campaigns or viral marketing moments" },
  { id: "controversy", label: "Controversy or Crisis", desc: "PR crises, backlash, or controversial moves" },
  { id: "collab", label: "Collaboration or Partnership", desc: "Collabs, celebrity partnerships, co-branded launches" },
  { id: "custom", label: "Custom Signal", desc: "Define your own signal type" }
];
const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: "ig", desc: "Caption + Creative Brief + AI Creative" },
  { id: "linkedin", label: "LinkedIn", icon: "in", desc: "Thought leadership post" },
  { id: "twitter", label: "Twitter / X", icon: "x", desc: "Short form tweets" },
  { id: "email", label: "Email Newsletter", icon: "em", desc: "Newsletter with personalisation" }
];
const DEFAULT_CD = `Editorial, magazine style. Bold typography mixing serif display with clean sans serif body. Collage aesthetic: real photography + graphic elements. Brand aligned color palettes. High contrast text/imagery. Product shots, lifestyle photography, graphic overlays. Legible, artistic text on images. Vogue meets brand strategy. Rounded corner image grids. Strong visual hierarchy. Smart, culturally aware, visually striking, shareable.`;

// =================== API WRAPPERS ===================

async function callAI(prompt, useOpus = false, images = []) {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, useOpus, images: images?.filter(Boolean) || [] }),
    });
    const text = await res.text();
    let d;
    try { d = JSON.parse(text); } catch {
      return "Error: Server returned invalid response. Check Vercel logs.";
    }
    if (d.error) return "Error: " + d.error;
    return d.text || "No response.";
  } catch (e) { return "Error: " + e.message; }
}

async function callAISearch(prompt) {
  try {
    const res = await fetch("/api/ai-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const text = await res.text();
    let d;
    try { d = JSON.parse(text); } catch {
      return "Error: Server returned invalid response. Check Vercel logs.";
    }
    if (d.error) return "Error: " + d.error;
    return d.text || "No results.";
  } catch (e) { return "Error: " + e.message; }
}

async function genImage(prompt, googleKey) {
  if (!googleKey) return { error: "Enter your Google API key to generate creatives." };
  try {
    // Direct browser call to Google - no Vercel timeout limit
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${googleKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      }
    );
    const d = await res.json();
    if (d.error) return { error: d.error.message || "Google API error" };
    const parts = d.candidates?.[0]?.content?.parts || [];
    const im = parts.find((p) => p.inlineData);
    if (im) return { image: `data:${im.inlineData.mimeType};base64,${im.inlineData.data}` };
    return { error: "No image generated. Try refining the prompt." };
  } catch (e) { return { error: e.message }; }
}

async function atAction(action, data = null, recordId = null) {
  try {
    const res = await fetch("/api/airtable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data, recordId }),
    });
    return await res.json();
  } catch (e) { return { error: e.message }; }
}

// Checks the source links the search returned. Non-blocking: cards render at
// once and the verified / not verified label fills in when this resolves.
async function verifyLinks(items, setData) {
  const urls = items.map((n) => n.url).filter(Boolean);
  if (!urls.length) return;
  try {
    const res = await fetch("/api/verify-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls }) });
    const d = await res.json();
    const map = {};
    (d.results || []).forEach((r) => { map[r.url] = r; });
    setData((prev) => ({ ...prev, fetchedNews: (prev.fetchedNews || []).map((n) => (n.url && map[n.url] ? { ...n, verified: map[n.url].ok, finalUrl: map[n.url].finalUrl || n.url } : n)) }));
  } catch {}
}

// =================== UTILS ===================

function parseSections(t) {
  const s = {};
  const re = /===(\w+)===([\s\S]*?)(?====\w|$)/g;
  let m;
  while ((m = re.exec(t)) !== null) s[m[1].trim()] = m[2].trim();
  return s;
}

function parseCSV(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const pl = (line) => {
    const r = []; let c = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { r.push(c.trim()); c = ""; }
      else c += ch;
    }
    r.push(c.trim()); return r;
  };
  const headers = pl(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const v = pl(l); const o = {};
    headers.forEach((h, i) => { o[h] = v[i] || ""; });
    return o;
  });
  return { headers, rows };
}

function exportCSV(content, news, platforms) {
  const rows = [["Signal", "Platform", "Section", "Content"]];
  for (const n of news) {
    for (const p of platforms) {
      const raw = content[n.id]?.[p] || "";
      const s = parseSections(raw);
      if (Object.keys(s).length) {
        for (const [k, v] of Object.entries(s)) rows.push([n.headline, p, k.replace(/_/g, " "), v.replace(/"/g, '""')]);
      } else rows.push([n.headline, p, "Content", raw.replace(/"/g, '""')]);
    }
  }
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const b = new Blob([csv], { type: "text/csv" });
  const u = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = u; a.download = "content_export.csv"; a.click();
  URL.revokeObjectURL(u);
}

function resizeImg(dataUrl, max = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// =================== UI ATOMS ===================

// Every value points at a token in app/tokens.css, so the whole app re-skins from one file.
const S = {
  bg: "var(--ground)", card: "var(--surface)", sunken: "var(--sunken)", input: "var(--surface)",
  border: "var(--border)", borderField: "var(--border-field)", hair: "var(--hair)",
  accent: "var(--accent)", accentSoft: "var(--accent-soft)", accentFill: "var(--accent-fill)",
  text: "var(--ink)", text2: "var(--ink-2)", muted: "var(--ink-3)", inv: "var(--ink-inv)", link: "var(--link)",
  warning: "var(--warning)", warningFill: "var(--warning-fill)", danger: "var(--danger)", dangerFill: "var(--danger-fill)",
};

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0" }}>
      <div style={{ width: 18, height: 18, border: `2px solid ${S.hair}`, borderTopColor: S.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <span style={{ color: S.text2, fontSize: 13 }}>{label || "Thinking..."}</span>
    </div>
  );
}

function TA({ value, onChange, placeholder, rows = 4, style = {} }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className="ce-textarea" style={{ width: "100%", background: S.input, border: `1px solid ${S.borderField}`, borderRadius: 8, color: S.text, padding: "12px 14px", fontSize: 14, fontFamily: "var(--f-text)", resize: "vertical", outline: "none", lineHeight: 1.6, boxSizing: "border-box", ...style }} />
  );
}

function In({ value, onChange, placeholder, type = "text", style = {} }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="ce-input" style={{ width: "100%", background: S.input, border: `1px solid ${S.borderField}`, borderRadius: 8, color: S.text, padding: "12px 14px", fontSize: 14, fontFamily: "var(--f-text)", outline: "none", boxSizing: "border-box", ...style }} />
  );
}

function Btn({ children, onClick, v = "primary", disabled = false, style = {} }) {
  const b = { padding: "11px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "var(--f-text)", border: "1px solid transparent", opacity: disabled ? 0.5 : 1, ...style };
  const vs = {
    primary: { ...b, background: "var(--ink)", color: S.inv },
    secondary: { ...b, background: S.card, color: S.text, border: `1px solid ${S.border}` },
    ghost: { ...b, background: "transparent", color: S.accent, border: `1px solid ${S.accent}` },
  };
  return <button type="button" className={`ce-btn ce-btn-${v}`} onClick={onClick} disabled={disabled} style={vs[v]}>{children}</button>;
}

function Cd({ children, style = {}, onClick, className = "" }) {
  return <div onClick={onClick} className={`ce-card ${className}`} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 14, padding: 20, ...style }}>{children}</div>;
}

function Lb({ children }) {
  return <label style={{ color: S.muted, fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 6 }}>{children}</label>;
}

function Tg({ children, selected, onClick }) {
  return (
    <span role="button" tabIndex={0} className="ce-tag ce-focus" onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick && onClick(e); } }} style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 999, fontSize: 13, cursor: "pointer",
      background: selected ? "var(--ink)" : S.card, color: selected ? S.inv : S.text2,
      border: `1px solid ${selected ? "var(--ink)" : S.border}`, fontWeight: selected ? 600 : 500,
    }}>{children}</span>
  );
}

function ImgGrid({ images, setImages, count, label }) {
  const up = async (i, file) => {
    const rd = new FileReader();
    rd.onload = async (ev) => {
      const r = await resizeImg(ev.target.result);
      const u = [...images]; u[i] = r; setImages(u);
    };
    rd.readAsDataURL(file);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(count, 4)}, 1fr)`, gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => {
        const im = images[i];
        return (
          <div key={i} style={{ position: "relative", background: S.sunken, border: `1px dashed ${im ? S.accent : S.borderField}`, borderRadius: 8, aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {im ? (
              <>
                <img src={im} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button onClick={() => { const u = [...images]; u[i] = null; setImages(u); }}
                  type="button" aria-label="Remove image" style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "var(--ink)", border: "none", color: "var(--ink-inv)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </>
            ) : (
              <label style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4 }}>
                <span style={{ fontSize: 22, color: S.muted }}>+</span>
                <span style={{ fontSize: 10, color: S.muted, fontFamily: "var(--f-mono)" }}>{label} {i + 1}</span>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && up(i, e.target.files[0])} />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =================== STEP: BRAND SETUP ===================

function StepBrand({ data, setData }) {
  const [refining, setRefining] = useState(false);
  const [tab, setTab] = useState("brand");
  const [atSt, setAtSt] = useState("");
  const [atOk, setAtOk] = useState(null); // null=unknown, true=connected, false=not configured
  const [brands, setBrands] = useState([]);

  // Check Airtable on mount
  useEffect(() => {
    atAction("test").then(r => {
      if (r.error) { setAtOk(false); setAtSt(r.error); }
      else { setAtOk(true); setAtSt("Connected"); setTimeout(() => setAtSt(""), 2000); }
    });
  }, []);

  const loadAt = async () => {
    setAtSt("Loading..."); const r = await atAction("load");
    if (r.error) { setAtSt("Error: " + r.error); return; }
    setBrands(r.brands || []); setAtSt(`${(r.brands || []).length} brand(s) found`);
  };
  const saveAt = async () => {
    setAtSt("Saving..."); const r = await atAction("save", data, data.atRid);
    if (r.error) { setAtSt("Error: " + r.error); return; }
    setData((d) => ({ ...d, atRid: r.id })); setAtSt("Saved!"); setTimeout(() => setAtSt(""), 3000);
  };
  const apply = (b) => { setData((d) => ({ ...d, ...b, atRid: b.rid })); setAtSt(`Loaded "${b.brandName}"`); };

  const refine = async () => {
    setRefining(true);
    const r = await callAI(`Refine this brand brief. Fix grammar, clarity.\nBrand: ${data.brandName}\nProduct: ${data.product}\nDesc: ${data.brandDescription}\nAudience: ${data.targetAudience}\nVoice: ${data.brandPersona}\nValues: ${data.brandValues}\nReturn: BRAND NAME: ...\nPRODUCT: ...\nDESCRIPTION: ...\nTARGET AUDIENCE: ...\nVOICE: ...\nVALUES: ...\nNo hyphens.`);
    const ex = (k) => { const m = r.match(new RegExp(`${k}:\\s*(.+)`, "i")); return m ? m[1].trim() : ""; };
    setData((d) => ({ ...d, brandName: ex("BRAND NAME") || d.brandName, product: ex("PRODUCT") || d.product, brandDescription: ex("DESCRIPTION") || d.brandDescription, targetAudience: ex("TARGET AUDIENCE") || d.targetAudience, brandPersona: ex("VOICE") || d.brandPersona, brandValues: ex("VALUES") || d.brandValues }));
    setRefining(false);
  };

  return (
    <div>
      <h2 style={{ color: S.text, fontSize: 26, fontWeight: 600, letterSpacing: "-.015em", marginBottom: 4 }}>Brand Setup</h2>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 18 }}>Tell us about the brand.</p>

      <Cd style={{ marginBottom: 18, padding: 14, background: S.sunken, borderColor: atOk === false ? S.warning : S.border }}>
        {atOk === false ? (
          <div>
            <div style={{ color: S.warning, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Airtable not configured</div>
            <div style={{ color: S.text2, fontSize: 12, lineHeight: 1.6 }}>
              Add these env vars in Vercel (Settings → Environment Variables) then redeploy:<br/>
              <code style={{ color: S.accent }}>AIRTABLE_PAT</code> = your personal access token (airtable.com/create/tokens, needs scopes: data.records:read, data.records:write, schema.bases:read, schema.bases:write)<br/>
              <code style={{ color: S.accent }}>AIRTABLE_BASE_ID</code> = <code style={{ color: S.accent }}>appmMqJEF1DzkZxvC</code> (your base)
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn v="ghost" onClick={loadAt} style={{ padding: "5px 12px", fontSize: 12 }}>Load from Airtable</Btn>
                <Btn v="ghost" onClick={saveAt} style={{ padding: "5px 12px", fontSize: 12 }}>Save to Airtable</Btn>
              </div>
              {atSt && <span style={{ color: atSt.startsWith("Error") ? S.danger : S.accent, fontSize: 12, fontFamily: "var(--f-mono)" }}>{atSt}</span>}
            </div>
            {brands.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {brands.map((b) => <Tg key={b.rid} onClick={() => apply(b)}>{b.brandName || "Unnamed"}</Tg>)}
              </div>
            )}
          </>
        )}
      </Cd>

      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {[["brand", "Brand Info"], ["personality", "Platform Personality"], ["references", "References"]].map(([k, l]) => (
          <Tg key={k} selected={tab === k} onClick={() => setTab(k)}>{l}</Tg>
        ))}
      </div>

      {tab === "brand" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><Lb>Brand Name *</Lb><In value={data.brandName} onChange={(v) => setData((d) => ({ ...d, brandName: v }))} placeholder="e.g. Glossier" /></div>
            <div><Lb>Product *</Lb><In value={data.product} onChange={(v) => setData((d) => ({ ...d, product: v }))} placeholder="e.g. Skincare" /></div>
          </div>
          <div><Lb>Description *</Lb><TA value={data.brandDescription} onChange={(v) => setData((d) => ({ ...d, brandDescription: v }))} placeholder="What does the brand do?" rows={3} /></div>
          <div><Lb>Target Audience *</Lb><TA value={data.targetAudience} onChange={(v) => setData((d) => ({ ...d, targetAudience: v }))} rows={2} placeholder="Demographics, psychographics..." /></div>
          <div><Lb>Brand Voice *</Lb><TA value={data.brandPersona} onChange={(v) => setData((d) => ({ ...d, brandPersona: v }))} rows={3} placeholder="Tone, style, examples..." /></div>
          <div><Lb>Values</Lb><In value={data.brandValues} onChange={(v) => setData((d) => ({ ...d, brandValues: v }))} placeholder="e.g. Sustainability, Innovation" /></div>
          <Btn v="ghost" onClick={refine} disabled={refining}>{refining ? "Refining..." : "Refine with AI"}</Btn>
          {refining && <Spinner />}
        </div>
      )}

      {tab === "personality" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ color: S.text2, fontSize: 13, margin: 0 }}>Mandatory. Define brand voice per platform.</p>
          {PLATFORMS.map((p) => (
            <div key={p.id}><Lb>{p.label} *</Lb>
              <TA value={data.platformPersonality?.[p.id] || ""} onChange={(v) => setData((d) => ({ ...d, platformPersonality: { ...d.platformPersonality, [p.id]: v } }))} rows={2} placeholder={`Tone for ${p.label}...`} /></div>
          ))}
        </div>
      )}

      {tab === "references" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Cd style={{ background: S.sunken }}>
            <Lb>Instagram reference posts (images, up to 4)</Lb>
            <p style={{ color: S.muted, fontSize: 12, marginBottom: 8 }}>Upload post screenshots. AI sees these directly.</p>
            <ImgGrid images={data.instaRefImages || [null, null, null, null]} setImages={(v) => setData((d) => ({ ...d, instaRefImages: v }))} count={4} label="Ref" />
          </Cd>

          {PLATFORMS.filter((p) => p.id !== "instagram").map((p) => (
            <Cd key={p.id} style={{ background: S.sunken }}>
              <Lb>{p.label} refs (text, optional)</Lb>
              {[0, 1, 2, 3].map((i) => (
                <TA key={i} value={data.referencePosts?.[p.id]?.[i] || ""} onChange={(v) => {
                  const rs = { ...(data.referencePosts || {}) }; if (!rs[p.id]) rs[p.id] = [];
                  rs[p.id] = [...rs[p.id]]; rs[p.id][i] = v; setData((d) => ({ ...d, referencePosts: rs }));
                }} placeholder={`Reference ${i + 1}...`} rows={2} style={{ marginBottom: 6 }} />
              ))}
            </Cd>
          ))}

          <div><Lb>Creative Direction</Lb><TA value={data.creativeDirection || DEFAULT_CD} onChange={(v) => setData((d) => ({ ...d, creativeDirection: v }))} rows={4} /></div>

          <Cd style={{ background: S.sunken }}>
            <Lb>Reference Creatives (images, overrides default direction)</Lb>
            <ImgGrid images={data.refCreativeImages || [null, null, null]} setImages={(v) => setData((d) => ({ ...d, refCreativeImages: v }))} count={3} label="Creative" />
          </Cd>
        </div>
      )}
    </div>
  );
}

// =================== STEP: TARGETS ===================

function StepTargets({ data, setData }) {
  const m = data.targetMode || "niche";
  return (
    <div>
      <h2 style={{ color: S.text, fontSize: 26, fontWeight: 600, letterSpacing: "-.015em", marginBottom: 4 }}>Targets</h2>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 22 }}>Choose how to discover news.</p>
      <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
        {[["niche", "ni", "Specify Niche", "Describe the space you serve"], ["accounts", "ac", "Account List", "Track specific brands"]].map(([k, ic, t, sub]) => (
          <Cd key={k} className="ce-card-select" style={{ flex: 1, cursor: "pointer", borderColor: m === k ? "var(--ink)" : S.border, background: m === k ? "var(--wash-selected)" : S.card }} onClick={() => setData((d) => ({ ...d, targetMode: k }))}>
            <div style={{ marginBottom: 8 }}><Mark text={ic} size={28} tone={m === k ? "accent" : "neutral"} /></div>
            <div style={{ color: S.text, fontWeight: 600 }}>{t}</div>
            <div style={{ color: S.muted, fontSize: 12, marginTop: 2 }}>{sub}</div>
          </Cd>
        ))}
      </div>
      {m === "niche" && <><Lb>Niche *</Lb><In value={data.niche || ""} onChange={(v) => setData((d) => ({ ...d, niche: v }))} placeholder="Fashion, Makeup, D2C..." /><div style={{ marginTop: 10 }}><Lb>Sub niches</Lb><TA value={data.subNiches || ""} onChange={(v) => setData((d) => ({ ...d, subNiches: v }))} rows={2} /></div></>}
      {m === "accounts" && <><Lb>Accounts *</Lb><TA value={data.accountList || ""} onChange={(v) => setData((d) => ({ ...d, accountList: v }))} placeholder={"One per line:\nGlossier\nFenty Beauty"} rows={6} /></>}
    </div>
  );
}

// =================== STEP: SIGNALS ===================

function StepSignals({ data, setData }) {
  const [gen, setGen] = useState({});
  const tog = (id) => { const c = data.selectedSignals || []; setData((d) => ({ ...d, selectedSignals: c.includes(id) ? c.filter((s) => s !== id) : [...c, id] })); };
  const ag = async (id) => {
    setGen((g) => ({ ...g, [id]: true }));
    const s = SIGNAL_TYPES.find((t) => t.id === id);
    const r = await callAI(`Generate detailed search prompt for: ${s.label} (${s.desc}). Context: ${data.niche || data.accountList || "general"}. Only prompt. No hyphens.`);
    setData((d) => ({ ...d, signalPrompts: { ...(d.signalPrompts || {}), [id]: r } }));
    setGen((g) => ({ ...g, [id]: false }));
  };
  return (
    <div>
      <h2 style={{ color: S.text, fontSize: 26, fontWeight: 600, letterSpacing: "-.015em", marginBottom: 4 }}>Signals</h2>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 22 }}>Select signal types.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SIGNAL_TYPES.map((s) => {
          const sel = (data.selectedSignals || []).includes(s.id);
          return (
            <Cd key={s.id} className="ce-card-select" style={{ borderColor: sel ? "var(--ink)" : S.border, cursor: "pointer", background: sel ? "var(--wash-selected)" : S.card, padding: "16px 18px" }}>
              <div onClick={() => tog(s.id)} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${sel ? "var(--ink)" : S.borderField}`, background: sel ? "var(--ink)" : "transparent", display: "grid", placeItems: "center", flexShrink: 0 }}>{sel && <CheckIcon color="var(--ink-inv)" />}</div>
                <div style={{ flex: 1 }}><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ color: S.text, fontWeight: 600, fontSize: 14 }}>{s.label}</span><TypeBadge type={s.id} /></div><div style={{ color: S.muted, fontSize: 12.5, marginTop: 2 }}>{s.desc}</div></div>
              </div>
              {sel && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${S.hair}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><Lb>Prompt</Lb><Btn v="ghost" onClick={() => ag(s.id)} disabled={gen[s.id]} style={{ padding: "3px 10px", fontSize: 11 }}>{gen[s.id] ? "..." : "Auto"}</Btn></div>
                  <TA value={data.signalPrompts?.[s.id] || ""} onChange={(v) => setData((d) => ({ ...d, signalPrompts: { ...(d.signalPrompts || {}), [s.id]: v } }))} rows={3} />
                  {gen[s.id] && <Spinner />}
                </div>
              )}
            </Cd>
          );
        })}
      </div>
    </div>
  );
}

// =================== STEP: FETCH / SELECT / PLATFORMS / GENERATE ===================
// (These follow the same pattern - using API wrappers instead of direct calls)

const RESEARCH_PLATFORMS = [
  { id: "google", label: "Google News", icon: "g" },
  { id: "twitter", label: "Twitter / X", icon: "x" },
  { id: "instagram", label: "Instagram", icon: "ig" },
  { id: "reddit", label: "Reddit", icon: "r" },
  { id: "linkedin", label: "LinkedIn", icon: "in" },
  { id: "youtube", label: "YouTube", icon: "yt" },
  { id: "tiktok", label: "TikTok", icon: "tt" },
];

const COUNTRIES = [
  { id: "global", label: "Global (All)" },
  { id: "IN", label: "India" },
  { id: "US", label: "United States" },
  { id: "UK", label: "United Kingdom" },
  { id: "AE", label: "UAE / Gulf" },
  { id: "AU", label: "Australia" },
  { id: "SG", label: "Singapore" },
  { id: "CA", label: "Canada" },
  { id: "EU", label: "Europe" },
];

function StepFetch({ data, setData, setStep }) {
  const [fetching, setFetching] = useState(false);
  const [status, setStatus] = useState("");
  const [researchPlatforms, setResearchPlatforms] = useState(data.researchPlatforms || ["google"]);
  const [resultRange, setResultRange] = useState(data.resultRange || [40, 50]);
  const [locations, setLocations] = useState(data.researchLocations || ["global"]);

  const togPlatform = (id) => {
    const updated = researchPlatforms.includes(id)
      ? researchPlatforms.filter((p) => p !== id)
      : [...researchPlatforms, id];
    if (updated.length === 0) return; // at least one
    setResearchPlatforms(updated);
    setData((d) => ({ ...d, researchPlatforms: updated }));
  };

  const togLocation = (id) => {
    let updated;
    if (id === "global") {
      updated = ["global"];
    } else {
      updated = locations.filter((l) => l !== "global");
      updated = updated.includes(id) ? updated.filter((l) => l !== id) : [...updated, id];
      if (updated.length === 0) updated = ["global"];
    }
    setLocations(updated);
    setData((d) => ({ ...d, researchLocations: updated }));
  };

  const fetchNews = async () => {
    setFetching(true);
    setStatus("Building search queries...");

    const signals = (data.selectedSignals || []).map((id) => {
      const s = SIGNAL_TYPES.find((t) => t.id === id);
      return `${s.label}: ${data.signalPrompts?.[id] || s.desc}`;
    });

    const targetInfo = data.targetMode === "accounts"
      ? `Specific brands to track:\n${data.accountList}`
      : `Niche: ${data.niche}${data.subNiches ? "\nSub niches: " + data.subNiches : ""}`;

    const signalInfo = signals.length > 0
      ? `Signal types to look for:\n${signals.join("\n")}`
      : "Look for any notable news, launches, campaigns, or moves in this space.";

    const platformNames = researchPlatforms.map((id) => RESEARCH_PLATFORMS.find((p) => p.id === id)?.label).join(", ");
    const locationNames = locations.includes("global")
      ? "Global (all regions)"
      : locations.map((id) => COUNTRIES.find((c) => c.id === id)?.label).join(", ");
    const minResults = resultRange[0];
    const maxResults = resultRange[1];

    setStatus(`Searching ${platformNames}...`);

    const searchPrompt = `You are an expert news and social media research agent. Find the most relevant and recent signals from the LAST 7 DAYS ONLY (today is ${new Date().toISOString().split("T")[0]}).

CONTEXT:
Brand being served: ${data.brandName || "Not specified"}
Industry: ${data.niche || "Not specified"}
${targetInfo}

${signalInfo}

RESEARCH PLATFORMS TO SEARCH:
${researchPlatforms.map((id) => {
  const p = RESEARCH_PLATFORMS.find((rp) => rp.id === id);
  const instructions = {
    google: "Search Google News for press coverage, articles, and announcements",
    twitter: "Search Twitter/X for viral tweets, brand announcements, trending discussions, and notable threads from brand accounts and industry voices",
    instagram: "Search Instagram for new campaign launches, viral posts, influencer collaborations, notable brand posts, and visual campaign rollouts",
    reddit: "Search Reddit for brand discussions, product reviews, industry threads, viral posts in relevant subreddits",
    linkedin: "Search LinkedIn for corporate announcements, leadership posts, company updates, and professional industry discussions",
    youtube: "Search YouTube for new brand campaigns, product launch videos, viral brand content",
    tiktok: "Search TikTok for viral brand moments, trending sounds/challenges involving brands, influencer content",
  };
  return `${p?.label}: ${instructions[id] || "Search for relevant content"}`;
}).join("\n")}

GEOGRAPHIC FOCUS: ${locationNames}
${!locations.includes("global") ? `IMPORTANT: Prioritize news and signals from these specific regions. Include the country/region context in each result. For India, search for Indian brands, Indian market news. For US, search US market, etc.` : ""}

RESULT COUNT: Find between ${minResults} and ${maxResults} pieces of relevant news/signals. More is better.

INSTRUCTIONS:
1. Search across ALL the platforms listed above
2. Only include content from the last 7 days
3. For each piece, include which platform/source it came from
4. For each item, provide the info in the EXACT format shown below
5. Each news item MUST be separated by exactly three dashes on their own line: ---

YOU MUST FORMAT EACH NEWS ITEM EXACTLY LIKE THIS:

HEADLINE: [clear specific headline of the news or signal]
BRAND: [the brand or company involved]
SOURCE: [which platform this came from, e.g. Twitter, Google News, Reddit, Instagram]
SUMMARY: [2 to 3 sentence summary of what happened or what was posted]
SIGNIFICANCE: [why this matters for content creation]
DATE: [the date, e.g. April 12, 2026]
TYPE: [exactly one of: product_launch, market_move, repositioning, expansion, campaign, controversy, collab, other]
URL: [the exact link to the article or post you found in your search results. Copy it as found. If you did not find a link for this item, write none. Never invent or guess a URL]
HOT: [a number from 1 to 10 for how much this is trending right now: how many outlets are covering it, how much it is being discussed, how fresh it is. 10 means everyone in this space is talking about it today]
---

IMPORTANT RULES:
- Each item MUST have all 9 fields: HEADLINE, BRAND, SOURCE, SUMMARY, SIGNIFICANCE, DATE, TYPE, URL, HOT
- URL must come from your actual search results. A wrong URL is worse than none
- Each item MUST end with --- on its own line
- Do NOT use any other format, headers, or markdown
- Do NOT write an introduction or conclusion
- Start directly with the first HEADLINE:
- Do NOT use hyphens or dashes inside the content (only --- as separator)
- Aim for at least ${minResults} results, up to ${maxResults}
- Include results from MULTIPLE platforms listed above, not just one`;

    const result = await callAISearch(searchPrompt);

    setStatus("Parsing results...");
    const newsItems = [];
    const blocks = result.split("---").filter((b) => b.trim());

    for (const block of blocks) {
      const extract = (key) => {
        const patterns = [
          new RegExp(`${key}:\\s*(.+?)(?=\\n(?:HEADLINE|BRAND|SOURCE|SUMMARY|SIGNIFICANCE|DATE|TYPE|URL|HOT):|$)`, "s"),
          new RegExp(`${key}:\\s*(.+?)(?=\\n[A-Z]+:|$)`, "s"),
          new RegExp(`\\*\\*${key}:?\\*\\*\\s*(.+?)(?=\\n|$)`, "s"),
        ];
        for (const p of patterns) {
          const m = block.match(p);
          if (m) return m[1].trim().replace(/^\*\*|\*\*$/g, "");
        }
        return "";
      };

      const headline = extract("HEADLINE");
      if (headline && headline.length > 5) {
        const rawType = extract("TYPE").toLowerCase().replace(/[^a-z_]/g, "");
        const type = SIGNAL_TYPES.some((t) => t.id === rawType) ? rawType : "other";
        const rawUrl = extract("URL").replace(/[<>\s]/g, "");
        const url = /^https?:\/\//i.test(rawUrl) && !/^https?:\/\/none/i.test(rawUrl) ? rawUrl : "";
        const hotNum = parseInt(extract("HOT"), 10);
        newsItems.push({
          id: Math.random().toString(36).substr(2, 9),
          headline,
          brand: extract("BRAND"),
          source: extract("SOURCE"),
          summary: extract("SUMMARY"),
          significance: extract("SIGNIFICANCE"),
          date: extract("DATE"),
          type,
          url,
          domain: url ? domainOf(url) : "",
          hot: isNaN(hotNum) ? 0 : Math.max(1, Math.min(10, hotNum)),
          verified: null,
          selected: false,
        });
      }
    }

    if (newsItems.length === 0) {
      newsItems.push({
        id: "fallback",
        headline: "News search completed",
        brand: data.niche || "General",
        source: "Web",
        summary: result.substring(0, 500),
        significance: "AI returned results in unexpected format. Review text above.",
        date: "Recent",
        selected: false,
      });
    }

    setData((d) => ({ ...d, fetchedNews: newsItems }));
    verifyLinks(newsItems, setData);
    setFetching(false);
    setStatus("");
    setStep(4);
  };

  return (
    <div>
      <h2 style={{ color: S.text, fontSize: 26, fontWeight: 600, letterSpacing: "-.015em", marginBottom: 4 }}>Fetch News</h2>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 18 }}>Configure search, then fetch signals.</p>

      {/* Research Platforms */}
      <Cd style={{ marginBottom: 12, padding: 16 }}>
        <Lb>Research Platforms *</Lb>
        <p style={{ color: S.muted, fontSize: 12, marginBottom: 10 }}>Select where to search for signals. More platforms = more coverage.</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {RESEARCH_PLATFORMS.map((p) => (
            <Tg key={p.id} selected={researchPlatforms.includes(p.id)} onClick={() => togPlatform(p.id)}>
              {p.label}
            </Tg>
          ))}
        </div>
      </Cd>

      {/* Location Filter */}
      <Cd style={{ marginBottom: 12, padding: 16 }}>
        <Lb>Location / Region</Lb>
        <p style={{ color: S.muted, fontSize: 12, marginBottom: 10 }}>Filter signals by geography. Select Global for everything.</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {COUNTRIES.map((c) => (
            <Tg key={c.id} selected={locations.includes(c.id)} onClick={() => togLocation(c.id)}>
              {c.label}
            </Tg>
          ))}
        </div>
      </Cd>

      {/* Result Count */}
      <Cd style={{ marginBottom: 12, padding: 16 }}>
        <Lb>Result Range</Lb>
        <p style={{ color: S.muted, fontSize: 12, marginBottom: 10 }}>How many signals to fetch. Fifty is the default: the ten hottest come first, the rest sit behind one click.</p>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: S.text2, fontSize: 13 }}>Min</span>
            <In value={resultRange[0]} onChange={(v) => { const n = parseInt(v) || 5; setResultRange([n, Math.max(n, resultRange[1])]); setData((d) => ({ ...d, resultRange: [n, Math.max(n, resultRange[1])] })); }}
              type="number" style={{ width: 70, padding: "8px 10px", fontSize: 13, textAlign: "center" }} />
          </div>
          <span style={{ color: S.muted }}>to</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: S.text2, fontSize: 13 }}>Max</span>
            <In value={resultRange[1]} onChange={(v) => { const n = parseInt(v) || 10; setResultRange([Math.min(resultRange[0], n), n]); setData((d) => ({ ...d, resultRange: [Math.min(resultRange[0], n), n] })); }}
              type="number" style={{ width: 70, padding: "8px 10px", fontSize: 13, textAlign: "center" }} />
          </div>
        </div>
      </Cd>

      {/* Summary + Fetch Button */}
      <Cd>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={{ background: S.sunken, borderRadius: 8, padding: 10 }}>
            <div style={{ color: S.muted, fontSize: 10, textTransform: "uppercase", marginBottom: 3 }}>Target</div>
            <div style={{ color: S.text, fontSize: 13, fontWeight: 500 }}>
              {data.targetMode === "accounts"
                ? `${(data.accountList || "").split("\n").filter((l) => l.trim()).length} accounts`
                : data.niche || "N/A"}
            </div>
          </div>
          <div style={{ background: S.sunken, borderRadius: 8, padding: 10 }}>
            <div style={{ color: S.muted, fontSize: 10, textTransform: "uppercase", marginBottom: 3 }}>Platforms</div>
            <div style={{ color: S.text, fontSize: 13, fontWeight: 500 }}>{researchPlatforms.length} selected</div>
          </div>
          <div style={{ background: S.sunken, borderRadius: 8, padding: 10 }}>
            <div style={{ color: S.muted, fontSize: 10, textTransform: "uppercase", marginBottom: 3 }}>Location</div>
            <div style={{ color: S.text, fontSize: 13, fontWeight: 500 }}>{locations.includes("global") ? "Global" : locations.length + " regions"}</div>
          </div>
        </div>
        {fetching ? (
          <div style={{ textAlign: "center", padding: "36px 0" }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${S.hair}`, borderTopColor: S.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
            <div style={{ color: S.accent, fontSize: 15, fontWeight: 600 }}>{status}</div>
            <div style={{ color: S.muted, fontSize: 13, marginTop: 4 }}>This may take 30 to 90 seconds depending on platforms...</div>
          </div>
        ) : (
          <Btn onClick={fetchNews} style={{ width: "100%" }}>
            Fetch {resultRange[0]} to {resultRange[1]} signals from {researchPlatforms.length} platform{researchPlatforms.length > 1 ? "s" : ""}
          </Btn>
        )}
      </Cd>
    </div>
  );
}

function StepSelect({ data, setData, saved, updateSaved, notify, openFolders }) {
  const news = data.fetchedNews || [];
  const ct = news.filter((n) => n.selected).length;
  const [showMore, setShowMore] = useState(false);
  const [sort, setSort] = useState("latest");
  const sourceOpened = saved?.sourceOpened || {};

  const parseDate = (s) => { const t = Date.parse(s || ""); return isNaN(t) ? 0 : t; };
  // Hot first: the model's 1 to 10 trending score, recency as the tie break.
  const hotScore = (n) => (n.hot || 0) * 10 + parseDate(n.date) / 1e13;
  const TOP = 10;
  const ranked = [...news].sort((a, b) => hotScore(b) - hotScore(a));
  const top = ranked.slice(0, TOP);
  const topIds = new Set(top.map((n) => n.id));
  const rest = news.filter((n) => !topIds.has(n.id)).sort((a, b) => (sort === "latest" ? parseDate(b.date) - parseDate(a.date) : parseDate(a.date) - parseDate(b.date)));

  // Controversy guardrail: a crisis signal with a source cannot be selected until that source has been opened.
  const isLocked = (n) => n.type === "controversy" && !!n.url && !sourceOpened[n.id];
  const toggle = (n) => {
    if (isLocked(n)) { notify && notify("Open the source first. Controversy signals need a real read before you build on them."); return; }
    setData((d) => ({ ...d, fetchedNews: d.fetchedNews.map((x) => (x.id === n.id ? { ...x, selected: !x.selected } : x)) }));
  };
  const markOpened = (n) => updateSaved && updateSaved((s) => { s.sourceOpened = s.sourceOpened || {}; s.sourceOpened[n.id] = true; });
  const selectAll = () => setData((d) => ({ ...d, fetchedNews: d.fetchedNews.map((n) => (isLocked(n) ? n : { ...n, selected: true })) }));

  const renderCard = (n, hot) => {
    const locked = isLocked(n);
    const isSaved = !!saved?.signals?.[signalKey(n)];
    return (
      <Cd key={n.id} className={`ce-card-select ${isSaved ? "ce-saved" : ""}`} onClick={() => toggle(n)}
        style={{ borderColor: n.selected ? "var(--ink)" : S.border, boxShadow: n.selected ? "0 0 0 1px var(--ink)" : "none", cursor: locked ? "default" : "pointer", padding: "16px 18px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flex: 1 }}>
            <TypeBadge type={n.type || "other"} />
            {n.brand && <span style={{ fontSize: 12.5, fontWeight: 600, color: S.text }}>{n.brand}</span>}
            {hot && <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".09em", textTransform: "uppercase", background: S.accentSoft, color: S.accent, padding: "3px 8px", borderRadius: 999 }}>hot · {n.hot || "?"}/10</span>}
            <span style={{ marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: 11.5, color: S.muted }}>{n.date}</span>
          </div>
          <div aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${n.selected ? "var(--ink)" : locked ? S.border : S.borderField}`, background: n.selected ? "var(--ink)" : "transparent", display: "grid", placeItems: "center", flexShrink: 0, opacity: locked ? 0.5 : 1 }}>
            {n.selected && <CheckIcon color="var(--ink-inv)" />}
          </div>
        </div>
        <div style={{ color: S.text, fontWeight: 600, fontSize: 16, lineHeight: 1.35, letterSpacing: "-.01em", margin: "10px 0 6px" }}>{n.headline}</div>
        <div style={{ color: S.text2, fontSize: 13.5, lineHeight: 1.55 }}>{n.summary}</div>
        {n.significance && (
          <div style={{ borderLeft: "3px solid var(--blue)", padding: "1px 0 1px 12px", margin: "12px 0 0" }}>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".13em", textTransform: "uppercase", color: S.link, display: "block", marginBottom: 3 }}>Why this matters</span>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: S.text }}>{n.significance}</p>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${S.hair}`, fontFamily: "var(--f-mono)", fontSize: 11.5, color: S.muted }}>
          {n.url ? (
            <a href={n.url} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.stopPropagation(); markOpened(n); }} style={{ color: S.link, textDecoration: "none", borderBottom: "1px solid currentColor" }}>{n.domain || n.source || "source"} ↗</a>
          ) : (
            <span>{n.source || "source not given"}</span>
          )}
          {n.url && n.verified === true && <span style={{ color: "var(--positive)" }}>✓ link verified</span>}
          {n.url && n.verified === false && <span style={{ color: S.warning }}>link not verified</span>}
          {!n.url && <span style={{ color: S.warning }}>no link · verify before posting</span>}
          <span style={{ flex: 1 }} />
          {locked && <span style={{ background: S.warningFill, color: S.warning, padding: "3px 8px", borderRadius: 999 }}>open the source to unlock</span>}
          <BookmarkButton item={n} saved={saved} updateSaved={updateSaved} onFolders={openFolders} notify={notify} />
        </div>
      </Cd>
    );
  };

  const sortChip = (v, l) => (
    <span key={v} role="button" tabIndex={0} className="ce-tag ce-focus" onClick={() => setSort(v)} onKeyDown={(e) => { if (e.key === "Enter") setSort(v); }}
      style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, cursor: "pointer", background: sort === v ? "var(--ink)" : S.card, color: sort === v ? S.inv : S.text2, border: `1px solid ${sort === v ? "var(--ink)" : S.border}`, fontWeight: 500 }}>{l}</span>
  );

  return (
    <div>
      <h2 style={{ color: S.text, fontSize: 26, fontWeight: 600, letterSpacing: "-.015em", marginBottom: 4 }}>Select News</h2>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: S.muted, fontSize: 14 }}>{news.length} found · {ct} selected</span>
        <Btn v="ghost" onClick={selectAll} style={{ padding: "5px 10px", fontSize: 12 }}>Select All</Btn>
      </div>

      {ct > 0 && (
        <div style={{ background: S.accentSoft, border: `1px solid ${S.accentFill}`, borderRadius: 8, padding: "8px 14px", marginBottom: 12, color: S.accent, fontWeight: 600, fontSize: 14 }}>
          {ct} signal{ct > 1 ? "s" : ""} selected
        </div>
      )}

      {news.length === 0 && <Cd style={{ textAlign: "center", color: S.muted }}>No signals yet. Go back a step and fetch.</Cd>}

      {top.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "6px 0 8px" }}>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase", color: S.muted, whiteSpace: "nowrap" }}>Worth your time · {top.length} hot signals</span>
            <span style={{ flex: 1, height: 1, background: S.hair }} />
          </div>
          <p style={{ color: S.muted, fontSize: 12.5, margin: "0 0 12px" }}>Ranked by how much each story is trending right now: outlets covering it, discussion around it, and how fresh it is.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{top.map((n) => renderCard(n, true))}</div>
        </>
      )}

      {rest.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Btn v="secondary" onClick={() => setShowMore((s) => !s)} style={{ padding: "8px 14px", fontSize: 13 }}>{showMore ? `Hide ${rest.length} more` : `Show ${rest.length} more signals`}</Btn>
            {showMore && (
              <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: S.muted }}>sort</span>
                {sortChip("latest", "Latest first")}{sortChip("oldest", "Oldest first")}
              </span>
            )}
          </div>
          {showMore && <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>{rest.map((n) => renderCard(n, false))}</div>}
        </div>
      )}
    </div>
  );
}

function StepPlatforms({ data, setData }) {
  const tog = (id) => { const c = data.selectedPlatforms || []; setData((d) => ({ ...d, selectedPlatforms: c.includes(id) ? c.filter((p) => p !== id) : [...c, id] })); };
  return (
    <div><h2 style={{ color: S.text, fontSize: 26, fontWeight: 600, letterSpacing: "-.015em", marginBottom: 4 }}>Platforms</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {PLATFORMS.map((p) => {
          const s = (data.selectedPlatforms || []).includes(p.id);
          return <Cd key={p.id} className="ce-card-select" onClick={() => tog(p.id)} style={{ cursor: "pointer", borderColor: s ? "var(--ink)" : S.border, background: s ? "var(--wash-selected)" : S.card, textAlign: "center", padding: 18 }}>
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}><Mark text={p.icon} size={34} tone={s ? "accent" : "azure"} /></div><div style={{ color: S.text, fontWeight: 600 }}>{p.label}</div><div style={{ color: S.muted, fontSize: 12 }}>{p.desc}</div>
          </Cd>;
        })}
      </div>
      {(data.selectedPlatforms || []).includes("email") && (
        <Cd><Lb>Email Personalisation</Lb><TA value={data.emailPersonalisation || ""} onChange={(v) => setData((d) => ({ ...d, emailPersonalisation: v }))} placeholder="First Name, Company..." rows={2} />
          <div style={{ marginTop: 12, borderTop: `1px solid ${S.hair}`, paddingTop: 12 }}><Lb>Or Import CSV</Lb>
            <label style={{ display: "inline-block", padding: "8px 16px", borderRadius: 8, background: S.card, border: `1px solid ${S.border}`, color: S.text, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Choose CSV<input type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const rd = new FileReader(); rd.onload = (ev) => setData((d) => ({ ...d, emailCsvData: parseCSV(ev.target.result) })); rd.readAsText(file); }} /></label></div>
          {data.emailCsvData && (
            <div style={{ marginTop: 12, background: S.sunken, borderRadius: 8, padding: 12 }}>
              <div style={{ color: S.accent, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{data.emailCsvData.headers.length} cols, {data.emailCsvData.rows.length} rows</div>
              <Lb>Field Mapping</Lb>
              {data.emailCsvData.headers.map((h) => (
                <div key={h} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ color: S.text2, fontSize: 13, width: 130 }}>{h}</span><span style={{ color: S.muted }}>→</span>
                  <In value={data.emailFieldMap?.[h] || ""} onChange={(v) => setData((d) => ({ ...d, emailFieldMap: { ...(d.emailFieldMap || {}), [h]: v } }))} placeholder={`{{${h.toLowerCase().replace(/\s/g, "_")}}}`} style={{ flex: 1, padding: "6px 10px", fontSize: 12 }} />
                </div>))}
            </div>
          )}
        </Cd>
      )}
    </div>
  );
}

function StepGen({ data, setData, setStep }) {
  const [g, setG] = useState(false);
  const [pr, setPr] = useState({ c: 0, t: 0, l: "" });

  const go = async () => {
    setG(true);
    const sn = (data.fetchedNews || []).filter((n) => n.selected);
    const pl = data.selectedPlatforms || [];
    const t = sn.length * pl.length; let c = 0; const all = {};
    const bc = `BRAND: ${data.brandName}\nPRODUCT: ${data.product}\nDESC: ${data.brandDescription}\nAUDIENCE: ${data.targetAudience}\nVOICE: ${data.brandPersona}\nVALUES: ${data.brandValues}`;

    for (const n of sn) {
      all[n.id] = {};
      for (const pid of pl) {
        c++; setPr({ c, t, l: `${PLATFORMS.find((p) => p.id === pid)?.label}: ${n.headline.substring(0, 30)}...` });
        const per = data.platformPersonality?.[pid] || "";
        const refs = (data.referencePosts?.[pid] || []).filter((r) => r?.trim());
        const refT = refs.length ? `\nREFS:\n${refs.map((r, i) => `${i + 1}: ${r}`).join("\n")}` : "";
        const nc = `HEADLINE: ${n.headline}\nBRAND: ${n.brand}\nSUMMARY: ${n.summary}\nSIGNIFICANCE: ${n.significance}`;

        if (pid === "instagram") {
          const hasRI = (data.instaRefImages || []).some(Boolean);
          const hasCR = (data.refCreativeImages || []).some(Boolean);
          const imgN = hasRI ? "\nCRITICAL: I attached reference Instagram post images. Study their visual style, layout, typography, composition carefully. Match this style." : "";
          const crN = hasCR ? "\nCRITICAL: I attached reference creatives. These OVERRIDE default direction. Match color palette, typography, layout, visual language precisely." : "";
          const imgs = [...(data.instaRefImages || []), ...(data.refCreativeImages || [])].filter(Boolean);
          const base = `${bc}\nPERSONALITY: ${per}${refT}\n\nNEWS SIGNAL:\n${nc}\n\nCREATIVE DIR: ${hasCR ? "See attached refs." : data.creativeDirection || DEFAULT_CD}`;

          // 3 separate calls to stay within Vercel 60s timeout
          setPr({ c, t, l: `Instagram Caption: ${n.headline.substring(0, 25)}...` });
          const cap = await callAI(`Instagram caption writer.${imgN}${crN}\n\n${base}\n\nWrite a compelling Instagram caption tying this news signal to the brand. Engaging, conversational, on brand. Line breaks for readability. Relevant hashtags at end. Return ONLY the caption text, nothing else. No hyphens or dashes.`, true, imgs);

          setPr({ c, t, l: `Instagram Creative Brief: ${n.headline.substring(0, 25)}...` });
          const creative = await callAI(`Instagram creative director.${imgN}${crN}\n\n${base}\n\nWrite an EXTREMELY detailed creative brief that a graphic designer follows BLINDLY. Include:\n- Exact layout structure (grid, single image, carousel with slide count)\n- Typography choices (font style, weight, size hierarchy, exact placement)\n- Color palette (exact hex codes aligned with brand)\n- Image composition (what photos/elements, where placed, how cropped)\n- Text overlay content and exact placement coordinates\n- Visual hierarchy and focal points\n- Aspect ratio and dimensions (1080x1080 for feed)\n- Graphic elements, borders, textures, overlays\n- Overall mood and aesthetic reference\nZERO creative interpretation needed. Return ONLY the brief. No hyphens or dashes.`, true, imgs);

          setPr({ c, t, l: `Instagram Image Prompt: ${n.headline.substring(0, 25)}...` });
          const imgPrompt = await callAI(`AI image prompt engineer.${crN}\n\n${base}\n\nCaption: ${cap.substring(0, 200)}\nCreative Brief Summary: ${creative.substring(0, 300)}\n\nWrite an extremely detailed prompt for Nano Banana Pro (Google AI image generator) to create this Instagram creative. Include:\n- Exact visual description of every element in the image\n- Specific color values and palette\n- Typography: exact text to render, font style, size, placement\n- Composition and spatial layout\n- Style reference (editorial, collage, minimal, etc)\n- Lighting, shadows, mood, atmosphere\n- Aspect ratio 1080x1080\n- Any textures, overlays, borders, graphic elements\nEvery single detail must be specified. Return ONLY the prompt. No hyphens or dashes.`, true, imgs);

          all[n.id][pid] = `===CAPTION===\n${cap}\n\n===CREATIVE_DETAILS===\n${creative}\n\n===IMAGE_PROMPT===\n${imgPrompt}`;
          continue;
        }
        if (pid === "linkedin") { all[n.id][pid] = await callAI(`LinkedIn strategist.\n${bc}\nPERSONALITY: ${per}${refT}\n${nc}\nHook, insight, value, CTA. Brand voice.\n===POST===\n[post]\nNo hyphens. <1300 chars.`, true); continue; }
        if (pid === "twitter") { all[n.id][pid] = await callAI(`Twitter strategist.\n${bc}\nPERSONALITY: ${per}${refT}\n${nc}\nPunchy, bold. Optional thread max 3.\n===TWEET===\n[tweet]\n===THREAD===\n[optional]\nNo hyphens. 280 max.`, true); continue; }
        if (pid === "email") {
          const ci = data.emailCsvData ? `\nCSV: ${data.emailCsvData.headers.join(", ")}\nMap: ${JSON.stringify(data.emailFieldMap || {})}` : "";
          all[n.id][pid] = await callAI(`Email writer.\n${bc}\nPERSONALITY: ${per}${refT}\n${nc}\nFIELDS: ${data.emailPersonalisation || "First Name"}${ci}\nSubject, body with {{fields}}, example.\n===SUBJECT===\n[subject]\n===BODY===\n[body]\n===PERSONALISATION_EXAMPLE===\n[filled]\nNo hyphens.`, true);
        }
      }
    }
    setData((d) => ({ ...d, generatedContent: all })); setG(false); setStep(7);
  };

  const sn = (data.fetchedNews || []).filter((n) => n.selected); const pl = data.selectedPlatforms || [];
  return (
    <div><h2 style={{ color: S.text, fontSize: 26, fontWeight: 600, letterSpacing: "-.015em", marginBottom: 4 }}>Generate</h2>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 20 }}>{sn.length} × {pl.length} = {sn.length * pl.length} pieces</p>
      {g ? (
        <div style={{ textAlign: "center", padding: "36px 0" }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${S.hair}`, borderTopColor: S.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ color: S.accent, fontSize: 15, fontWeight: 600 }}>{pr.c}/{pr.t}</div>
          <div style={{ color: S.muted, fontSize: 13 }}>{pr.l}</div>
          <div style={{ width: "100%", height: 4, background: S.hair, borderRadius: 2, marginTop: 14, overflow: "hidden" }}>
            <div style={{ width: `${(pr.c / pr.t) * 100}%`, height: "100%", background: S.accent, transition: "width 0.5s" }} /></div>
        </div>
      ) : <Btn onClick={go} style={{ width: "100%" }}>Generate all content</Btn>}
    </div>
  );
}

// =================== CONTENT BLOCK (with per-section redo for Instagram) ===================

function Redo({ label, value, onUpdate, data, platform, children }) {
  const [show, setShow] = useState(false);
  const [inp, setInp] = useState("");
  const [ld, setLd] = useState(false);
  const go = async () => {
    setLd(true);
    const r = await callAI(`Redo ONLY this ${label} for ${platform}:\n\n${value}\n\nFeedback: "${inp}"\nBrand: ${data.brandName}, Voice: ${data.brandPersona}\nReturn ONLY updated ${label}. No headers. No hyphens. Human.`, true);
    onUpdate(r); setLd(false); setShow(false); setInp("");
  };
  return (
    <div style={{ background: S.sunken, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ color: S.accent, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
        <Btn v="secondary" onClick={() => setShow(!show)} style={{ padding: "4px 10px", fontSize: 11 }}>Redo</Btn>
      </div>
      <div style={{ color: S.text, fontSize: 14.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{value}</div>
      {children}
      {show && (
        <div style={{ marginTop: 10, padding: 10, background: S.card, borderRadius: 8, border: `1px solid ${S.hair}` }}>
          <TA value={inp} onChange={setInp} placeholder="What to change..." rows={2} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={go} disabled={ld || !inp.trim()} style={{ padding: "6px 12px", fontSize: 12 }}>{ld ? "..." : "Redo"}</Btn>
            <Btn v="secondary" onClick={() => setShow(false)} style={{ padding: "6px 12px", fontSize: 12 }}>Cancel</Btn>
          </div>
          {ld && <Spinner />}
        </div>
      )}
    </div>
  );
}

function ContentBlock({ content, platform, newsItem, data, setData, onSaveDraft, draftSaved }) {
  const [cur, setCur] = useState(content);
  const [gi, setGi] = useState(false);
  const [img, setImg] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [showR, setShowR] = useState(false);
  const [ri, setRi] = useState("");
  const [rd, setRd] = useState(false);
  const sec = parseSections(cur);
  const isI = platform === "instagram";
  const has = Object.keys(sec).length > 0;
  const upSec = (k, v) => setCur((p) => p.replace(new RegExp(`(===${k}===\\s*)[\\s\\S]*?(?=(?:===\\w)|$)`), `$1\n${v}\n\n`));

  const genC = async () => {
    setGi(true); setElapsed(0); setImg(null);
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    const result = await genImage(sec.IMAGE_PROMPT || `Creative: ${newsItem.headline}. Brand: ${data.brandName}. Editorial.`, data.googleKey);
    clearInterval(timer);
    setImg(result); setGi(false);
  };

  const redoAll = async () => { setRd(true); setCur(await callAI(`Redo ${platform}:\n${cur}\nFeedback: "${ri}"\nBrand: ${data.brandName}\nSame format. No hyphens.`, true)); setRd(false); setShowR(false); setRi(""); };
  const pf = PLATFORMS.find((p) => p.id === platform);
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <Cd style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
      {newsItem?.type === "controversy" && <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, background: S.warningFill, color: S.warning, padding: "6px 20px", borderBottom: `1px solid ${S.hair}` }}>Controversy signal · verify the source before posting</div>}
      <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Mark text={PLATFORM_MARK[platform] || "•"} tone="azure" /><span style={{ color: S.text, fontWeight: 600 }}>{pf?.label}</span></div>
        <div style={{ display: "flex", gap: 6 }}>
          {onSaveDraft && <Btn v={draftSaved ? "ghost" : "secondary"} onClick={() => onSaveDraft(platform, cur)} style={{ padding: "6px 12px", fontSize: 12 }}>{draftSaved ? "Saved ✓" : "Save draft"}</Btn>}
          {!isI && <Btn v="secondary" onClick={() => setShowR(!showR)} style={{ padding: "6px 12px", fontSize: 12 }}>Redo</Btn>}
        </div>
      </div>

      {isI && has ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sec.CAPTION != null && <Redo label="Caption" value={sec.CAPTION} onUpdate={(v) => upSec("CAPTION", v)} data={data} platform="Instagram" />}
          {sec.CREATIVE_DETAILS != null && <Redo label="Creative Instructions" value={sec.CREATIVE_DETAILS} onUpdate={(v) => upSec("CREATIVE_DETAILS", v)} data={data} platform="Instagram" />}
          {sec.IMAGE_PROMPT != null && (
            <Redo label="Image Generation Prompt" value={sec.IMAGE_PROMPT} onUpdate={(v) => upSec("IMAGE_PROMPT", v)} data={data} platform="Instagram">
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${S.hair}` }}>
                {!data.googleKey ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ color: S.text2, fontSize: 12 }}>Enter your Google API key to generate creatives (runs in your browser, no timeout limit)</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <In value={data.googleKey || ""} onChange={(v) => setData((d) => ({ ...d, googleKey: v }))} placeholder="Google AI API key (aistudio.google.com/apikey)" type="password" style={{ flex: 1, padding: "8px 12px", fontSize: 12 }} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <Btn v="ghost" onClick={genC} disabled={gi} style={{ padding: "8px 16px", fontSize: 13 }}>
                      {gi ? `Generating... ${fmtTime(elapsed)}` : "Generate creative (Nano Banana Pro)"}
                    </Btn>
                    {gi && (
                      <div style={{ marginTop: 8, color: S.text2, fontSize: 12 }}>
                        This takes 3 to 5 minutes. Runs directly in your browser, no timeout.
                        <div style={{ width: "100%", height: 3, background: S.hair, borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min((elapsed / 300) * 100, 95)}%`, height: "100%", background: S.accent, transition: "width 1s linear" }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {img && <div style={{ marginTop: 10 }}>{img.error ? <div style={{ background: S.dangerFill, border: `1px solid ${S.danger}`, borderRadius: 8, padding: 10, color: S.danger, fontSize: 13 }}>{img.error}</div> : <img src={img.image} alt="" style={{ width: "100%", borderRadius: 8 }} />}</div>}
            </Redo>
          )}
        </div>
      ) : has ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(sec).map(([k, v]) => <div key={k} style={{ background: S.sunken, borderRadius: 10, padding: 16 }}><div style={{ color: S.accent, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{k.replace(/_/g, " ")}</div><div style={{ color: S.text, fontSize: 14.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{v}</div></div>)}
        </div>
      ) : <div style={{ color: S.text, fontSize: 14.5, lineHeight: 1.7, whiteSpace: "pre-wrap", background: S.sunken, borderRadius: 10, padding: 16 }}>{cur}</div>}

      {!isI && showR && (
        <div style={{ marginTop: 12, padding: 12, background: S.sunken, borderRadius: 8 }}>
          <TA value={ri} onChange={setRi} placeholder="What to change..." rows={2} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={redoAll} disabled={rd || !ri.trim()} style={{ padding: "8px 14px", fontSize: 13 }}>{rd ? "..." : "Regenerate"}</Btn>
            <Btn v="secondary" onClick={() => setShowR(false)} style={{ padding: "8px 14px", fontSize: 13 }}>Cancel</Btn>
          </div>{rd && <Spinner />}
        </div>
      )}
      </div>
    </Cd>
  );
}

// =================== STEP: RESULTS ===================

function StepResults({ data, setData, saved, updateSaved, notify }) {
  const [aid, setAid] = useState(null);
  const sn = (data.fetchedNews || []).filter((n) => n.selected);
  const ct = data.generatedContent || {};
  useEffect(() => { if (sn.length && !aid) setAid(sn[0].id); }, [sn]);
  const active = sn.find((n) => n.id === aid);

  // Save a generated piece to the profile. One draft per signal + platform; saving again removes it.
  const saveDraft = (item, platform, text) => {
    if (!updateSaved || !item) return;
    const id = `${signalKey(item)}|${platform}`;
    if (saved?.drafts?.[id]) { updateSaved((s) => { delete s.drafts[id]; }); notify && notify("Draft removed from saved."); return; }
    updateSaved((s) => { s.drafts[id] = { id, signalKey: signalKey(item), signalHeadline: item.headline, brand: item.brand, type: item.type || "other", platform, content: text, savedAt: Date.now(), folders: [] }; });
    notify && notify("Draft saved. It is under Profile, in Drafts.");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ color: S.text, fontSize: 26, fontWeight: 600, letterSpacing: "-.015em", margin: 0 }}>Your Content</h2>
        <Btn v="ghost" onClick={() => exportCSV(ct, sn, data.selectedPlatforms || [])} style={{ padding: "8px 14px", fontSize: 13 }}>Export CSV</Btn>
      </div>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 16 }}>Review, redo, save, or export.</p>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {sn.map((n) => <Tg key={n.id} selected={aid === n.id} onClick={() => setAid(n.id)}>{n.headline.substring(0, 28)}...</Tg>)}
      </div>
      {active && ct[aid] && (
        <div>
          <div style={{ background: S.accentSoft, border: `1px solid ${S.accentFill}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
              <TypeBadge type={active.type || "other"} />
              {active.brand && <span style={{ fontSize: 12.5, fontWeight: 600, color: S.text }}>{active.brand}</span>}
              {active.url && <a href={active.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: 11.5, color: S.link }}>{active.domain || active.source} ↗</a>}
            </div>
            <div style={{ color: S.text, fontSize: 14.5, fontWeight: 600, lineHeight: 1.35 }}>{active.headline}</div>
          </div>
          {(data.selectedPlatforms || []).map((pid) => {
            const c = ct[aid]?.[pid];
            if (!c) return null;
            const draftId = `${signalKey(active)}|${pid}`;
            return <ContentBlock key={pid} content={c} platform={pid} newsItem={active} data={data} setData={setData} onSaveDraft={(platform, text) => saveDraft(active, platform, text)} draftSaved={!!saved?.drafts?.[draftId]} />;
          })}
        </div>
      )}
    </div>
  );
}

// =================== MAIN ENGINE ===================

export default function ContentEngine() {
  const [step, setStep] = useState(0);
  const [entered, setEntered] = useState(false);
  const [saved, setSaved] = useState({ signals: {}, drafts: {}, folders: [], sourceOpened: {} });
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(null);
  const [pop, setPop] = useState(null);
  const [theme, setThemeState] = useState("light");
  const toastTimer = useRef(null);
  const [data, setData] = useState({
    brandName: "", product: "", brandDescription: "", targetAudience: "", brandPersona: "", brandValues: "",
    platformPersonality: {}, referencePosts: {}, creativeDirection: DEFAULT_CD,
    instaRefImages: [null, null, null, null], refCreativeImages: [null, null, null],
    targetMode: "niche", niche: "", subNiches: "", accountList: "",
    selectedSignals: [], signalPrompts: {}, fetchedNews: [], selectedPlatforms: [],
    emailPersonalisation: "", emailCsvData: null, emailFieldMap: {},
    generatedContent: {}, atRid: null,
    googleKey: "",
  });

  // Client boot: saved items, Google key, theme, whether the opening page was already passed this session,
  // and the ?demo fixture that lands on Select News with sample signals.
  useEffect(() => {
    setSaved(loadSaved());
    try { const k = localStorage.getItem("ce_google_key"); if (k) setData((d) => ({ ...d, googleKey: k })); } catch {}
    try { setThemeState(localStorage.getItem("ce_theme") === "dark" ? "dark" : "light"); } catch {}
    try { if (sessionStorage.getItem("ce_entered") === "1") setEntered(true); } catch {}
    try {
      if (new URLSearchParams(window.location.search).has("demo")) {
        setData((d) => ({ ...d, ...DEMO_BRAND, fetchedNews: DEMO_NEWS }));
        setEntered(true);
        setStep(4);
      }
    } catch {}
  }, []);

  // Persist Google key to localStorage
  useEffect(() => {
    if (data.googleKey) { try { localStorage.setItem("ce_google_key", data.googleKey); } catch {} }
  }, [data.googleKey]);

  const updateSaved = useCallback((fn) => {
    setSaved((prev) => { const next = JSON.parse(JSON.stringify(prev)); fn(next); persistSaved(next); return next; });
  }, []);
  const notify = useCallback((msg, action) => {
    setToast({ msg, action });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  const openFolders = useCallback((keys, rect) => setPop({ keys, kind: "signals", anchor: rect }), []);
  const setTheme = (t) => {
    setThemeState(t);
    try { localStorage.setItem("ce_theme", t); } catch {}
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme");
  };
  const enter = () => { setEntered(true); try { sessionStorage.setItem("ce_entered", "1"); } catch {} };

  const ok = () => {
    switch (step) {
      case 0: return data.brandName && data.product && data.brandPersona;
      case 1: return data.targetMode === "niche" ? !!data.niche : !!data.accountList;
      case 4: return (data.fetchedNews || []).some((n) => n.selected);
      case 5: return (data.selectedPlatforms || []).length > 0;
      default: return true;
    }
  };

  const views = [
    <StepBrand data={data} setData={setData} />,
    <StepTargets data={data} setData={setData} />,
    <StepSignals data={data} setData={setData} />,
    <StepFetch data={data} setData={setData} setStep={setStep} />,
    <StepSelect data={data} setData={setData} saved={saved} updateSaved={updateSaved} notify={notify} openFolders={openFolders} />,
    <StepPlatforms data={data} setData={setData} />,
    <StepGen data={data} setData={setData} setStep={setStep} />,
    <StepResults data={data} setData={setData} saved={saved} updateSaved={updateSaved} notify={notify} />,
  ];

  const savedCount = Object.keys(saved.signals).length + Object.keys(saved.drafts).length;

  if (!entered) return <Opening onEnter={enter} />;

  return (
    <div style={{ minHeight: "100vh", background: S.bg }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${S.border}`, padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "color-mix(in srgb, var(--ground) 90%, transparent)", backdropFilter: "blur(10px)", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Wordmark size={21} />
          <span className="ce-hide-sm" style={{ color: S.muted, fontSize: 11, fontFamily: "var(--f-mono)", letterSpacing: ".08em", textTransform: "uppercase", paddingLeft: 12, borderLeft: `1px solid ${S.border}` }}>signal driven content</span>
        </div>
        <button type="button" className="ce-btn ce-btn-secondary ce-focus" onClick={() => setDrawer(true)} aria-label="Open profile and saved items"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 34, padding: "0 12px 0 8px", borderRadius: 999, background: S.card, border: `1px solid ${S.border}`, color: S.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--f-text)" }}>
          <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: "50%", background: "linear-gradient(135deg, var(--pink), var(--blue))", display: "inline-block" }} />
          Profile{savedCount > 0 && <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: S.muted, fontWeight: 500 }}>{savedCount}</span>}
        </button>
      </div>

      {/* Progress */}
      <div style={{ padding: "12px 24px", borderBottom: `1px solid ${S.hair}` }}>
        <div style={{ display: "flex", gap: 3 }}>
          {STEPS.map((_, i) => <div key={i} onClick={() => i < step && setStep(i)} style={{ flex: 1, height: 3, borderRadius: 2, cursor: i < step ? "pointer" : "default", background: i <= step ? "var(--ink)" : S.hair, transition: "background var(--d-quick)" }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {STEPS.map((s, i) => <div key={i} style={{ fontSize: 10.5, fontFamily: "var(--f-mono)", letterSpacing: ".04em", color: i === step ? S.text : i < step ? S.muted : "var(--ink-dis)", fontWeight: i === step ? 600 : 400, textAlign: "center", flex: 1 }}>{s}</div>)}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 32px", animation: "fadeIn 0.3s" }}>
        {views[step]}
      </div>

      {/* Footer Nav */}
      {step !== 3 && step !== 6 && (
        <div style={{ position: "sticky", bottom: 0, borderTop: `1px solid ${S.border}`, padding: "12px 24px", background: "color-mix(in srgb, var(--ground) 92%, transparent)", backdropFilter: "blur(10px)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Btn v="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← Back</Btn>
          <span style={{ color: S.muted, fontSize: 12.5, fontFamily: "var(--f-mono)" }}>{step + 1}/{STEPS.length}</span>
          {step < 7 ? <Btn onClick={() => setStep((s) => s + 1)} disabled={!ok()}>Continue →</Btn>
            : <Btn onClick={() => { setStep(0); setData((d) => ({ ...d, generatedContent: {}, fetchedNews: [] })); }}>Start Over</Btn>}
        </div>
      )}

      <SavedDrawer open={drawer} onClose={() => setDrawer(false)} saved={saved} updateSaved={updateSaved} theme={theme} setTheme={setTheme} notify={notify} />
      <Toast toast={toast} onAction={(a, rect) => { setToast(null); a.run && a.run(rect); }} />
      {pop && <FolderPop anchor={pop.anchor} keys={pop.keys} kind={pop.kind} saved={saved} updateSaved={updateSaved} onClose={() => setPop(null)} notify={notify} />}
    </div>
  );
}
