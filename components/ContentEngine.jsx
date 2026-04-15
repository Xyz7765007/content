"use client";
import { useState, useEffect } from "react";

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
  { id: "instagram", label: "Instagram", icon: "📸", desc: "Caption + Creative Brief + AI Creative" },
  { id: "linkedin", label: "LinkedIn", icon: "💼", desc: "Thought leadership post" },
  { id: "twitter", label: "Twitter / X", icon: "𝕏", desc: "Short form tweets" },
  { id: "email", label: "Email Newsletter", icon: "📧", desc: "Newsletter with personalisation" }
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

async function genImage(prompt) {
  try {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch {
      return { error: "Server returned invalid response for image generation." };
    }
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

const S = { bg: "#0a0a0a", card: "#111", border: "#1e1e1e", accent: "#c8ff00", text: "#eee", muted: "#666", input: "#111" };

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0" }}>
      <div style={{ width: 18, height: 18, border: "2px solid #333", borderTopColor: S.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <span style={{ color: "#888", fontSize: 13 }}>{label || "Thinking..."}</span>
    </div>
  );
}

function TA({ value, onChange, placeholder, rows = 4, style = {} }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ width: "100%", background: S.input, border: "1px solid #2a2a2a", borderRadius: 8, color: S.text, padding: "12px 14px", fontSize: 14, fontFamily: "'DM Sans',sans-serif", resize: "vertical", outline: "none", lineHeight: 1.6, boxSizing: "border-box", ...style }} />
  );
}

function In({ value, onChange, placeholder, type = "text", style = {} }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", background: S.input, border: "1px solid #2a2a2a", borderRadius: 8, color: S.text, padding: "12px 14px", fontSize: 14, fontFamily: "'DM Sans',sans-serif", outline: "none", boxSizing: "border-box", ...style }} />
  );
}

function Btn({ children, onClick, v = "primary", disabled = false, style = {} }) {
  const b = { padding: "12px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'DM Sans',sans-serif", border: "none", transition: "all 0.2s ease", opacity: disabled ? 0.5 : 1, ...style };
  const vs = {
    primary: { ...b, background: S.accent, color: "#000" },
    secondary: { ...b, background: "#1a1a1a", color: S.text, border: "1px solid #333" },
    ghost: { ...b, background: "transparent", color: S.accent, border: `1px solid ${S.accent}` },
  };
  return <button onClick={onClick} disabled={disabled} style={vs[v]}>{children}</button>;
}

function Cd({ children, style = {}, onClick }) {
  return <div onClick={onClick} style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: 24, ...style }}>{children}</div>;
}

function Lb({ children }) {
  return <label style={{ color: "#999", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>{children}</label>;
}

function Tg({ children, selected, onClick }) {
  return (
    <span onClick={onClick} style={{
      display: "inline-block", padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
      background: selected ? S.accent : "#1a1a1a", color: selected ? "#000" : "#aaa",
      border: `1px solid ${selected ? S.accent : "#333"}`, fontWeight: selected ? 600 : 400, transition: "all 0.2s",
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
          <div key={i} style={{ position: "relative", background: "#0a0a0a", border: `1px dashed ${im ? S.accent : "#333"}`, borderRadius: 8, aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {im ? (
              <>
                <img src={im} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button onClick={() => { const u = [...images]; u[i] = null; setImages(u); }}
                  style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "none", color: "#ff4444", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </>
            ) : (
              <label style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4 }}>
                <span style={{ fontSize: 22, color: "#444" }}>+</span>
                <span style={{ fontSize: 10, color: "#555" }}>{label} {i + 1}</span>
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
      <h2 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Brand Setup</h2>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 18 }}>Tell us about the brand.</p>

      <Cd style={{ marginBottom: 18, padding: 14, background: "#0d0d0d", borderColor: atOk === false ? "#331a00" : "#1a2a00" }}>
        {atOk === false ? (
          <div>
            <div style={{ color: "#ffaa00", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>⚠️ Airtable not configured</div>
            <div style={{ color: "#888", fontSize: 12, lineHeight: 1.6 }}>
              Add these env vars in Vercel (Settings → Environment Variables) then redeploy:<br/>
              <code style={{ color: S.accent }}>AIRTABLE_PAT</code> = your personal access token (airtable.com/create/tokens, needs scopes: data.records:read, data.records:write, schema.bases:read, schema.bases:write)<br/>
              <code style={{ color: S.accent }}>AIRTABLE_BASE_ID</code> = <code style={{ color: S.accent }}>appmMqJEF1DzkZxvC</code> (your base)
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn v="ghost" onClick={loadAt} style={{ padding: "5px 12px", fontSize: 12 }}>📥 Load from Airtable</Btn>
                <Btn v="ghost" onClick={saveAt} style={{ padding: "5px 12px", fontSize: 12 }}>💾 Save to Airtable</Btn>
              </div>
              {atSt && <span style={{ color: atSt.startsWith("Error") ? "#ff6666" : S.accent, fontSize: 12 }}>{atSt}</span>}
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
          <Btn v="ghost" onClick={refine} disabled={refining}>{refining ? "Refining..." : "✨ Refine with AI"}</Btn>
          {refining && <Spinner />}
        </div>
      )}

      {tab === "personality" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ color: "#888", fontSize: 13, margin: 0 }}>Mandatory. Define brand voice per platform.</p>
          {PLATFORMS.map((p) => (
            <div key={p.id}><Lb>{p.icon} {p.label} *</Lb>
              <TA value={data.platformPersonality?.[p.id] || ""} onChange={(v) => setData((d) => ({ ...d, platformPersonality: { ...d.platformPersonality, [p.id]: v } }))} rows={2} placeholder={`Tone for ${p.label}...`} /></div>
          ))}
        </div>
      )}

      {tab === "references" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Cd style={{ background: "#0d0d0d" }}>
            <Lb>📸 Instagram Reference Posts (images, up to 4)</Lb>
            <p style={{ color: S.muted, fontSize: 12, marginBottom: 8 }}>Upload post screenshots. AI sees these directly.</p>
            <ImgGrid images={data.instaRefImages || [null, null, null, null]} setImages={(v) => setData((d) => ({ ...d, instaRefImages: v }))} count={4} label="Ref" />
          </Cd>

          {PLATFORMS.filter((p) => p.id !== "instagram").map((p) => (
            <Cd key={p.id} style={{ background: "#0d0d0d" }}>
              <Lb>{p.icon} {p.label} Refs (text, optional)</Lb>
              {[0, 1, 2, 3].map((i) => (
                <TA key={i} value={data.referencePosts?.[p.id]?.[i] || ""} onChange={(v) => {
                  const rs = { ...(data.referencePosts || {}) }; if (!rs[p.id]) rs[p.id] = [];
                  rs[p.id] = [...rs[p.id]]; rs[p.id][i] = v; setData((d) => ({ ...d, referencePosts: rs }));
                }} placeholder={`Reference ${i + 1}...`} rows={2} style={{ marginBottom: 6 }} />
              ))}
            </Cd>
          ))}

          <div><Lb>Creative Direction</Lb><TA value={data.creativeDirection || DEFAULT_CD} onChange={(v) => setData((d) => ({ ...d, creativeDirection: v }))} rows={4} /></div>

          <Cd style={{ background: "#0d0d0d" }}>
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
      <h2 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Targets</h2>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 22 }}>Choose how to discover news.</p>
      <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
        {[["niche", "🎯", "Specify Niche"], ["accounts", "📋", "Account List"]].map(([k, ic, t]) => (
          <Cd key={k} style={{ flex: 1, cursor: "pointer", borderColor: m === k ? S.accent : S.border, background: m === k ? S.card : "#0a0a0a" }} onClick={() => setData((d) => ({ ...d, targetMode: k }))}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{ic}</div>
            <div style={{ color: "#fff", fontWeight: 600 }}>{t}</div>
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
      <h2 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Signals</h2>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 22 }}>Select signal types.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SIGNAL_TYPES.map((s) => {
          const sel = (data.selectedSignals || []).includes(s.id);
          return (
            <Cd key={s.id} style={{ borderColor: sel ? S.accent : S.border, cursor: "pointer", background: sel ? "#0f0f0f" : "#0a0a0a" }}>
              <div onClick={() => tog(s.id)} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${sel ? S.accent : "#444"}`, background: sel ? S.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{sel && <span style={{ color: "#000", fontSize: 12, fontWeight: 700 }}>✓</span>}</div>
                <div><div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{s.label}</div><div style={{ color: S.muted, fontSize: 12 }}>{s.desc}</div></div>
              </div>
              {sel && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1e1e1e" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><Lb>Prompt</Lb><Btn v="ghost" onClick={() => ag(s.id)} disabled={gen[s.id]} style={{ padding: "3px 10px", fontSize: 11 }}>{gen[s.id] ? "..." : "⚡ Auto"}</Btn></div>
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

function StepFetch({ data, setData, setStep }) {
  const [f, setF] = useState(false);
  const go = async () => {
    setF(true);
    const sigs = (data.selectedSignals || []).map((id) => { const s = SIGNAL_TYPES.find((t) => t.id === id); return `${s.label}: ${data.signalPrompts?.[id] || s.desc}`; });
    const tgt = data.targetMode === "accounts" ? `Brands: ${data.accountList}` : `Niche: ${data.niche}${data.subNiches ? ", " + data.subNiches : ""}`;
    const r = await callAISearch(`Find news LAST 7 DAYS ONLY (today ${new Date().toISOString().split("T")[0]}). ${data.brandName}, ${tgt}. ${sigs.length ? "Signals:\n" + sigs.join("\n") : "Any notable news."} Per item: HEADLINE, BRAND, SUMMARY, SIGNIFICANCE, DATE. Separate ---. 5 to 10. No hyphens.`);
    const items = [];
    for (const bl of r.split("---").filter((b) => b.trim())) {
      const ex = (k) => { const m = bl.match(new RegExp(`${k}:\\s*(.+?)(?=\\n[A-Z]+:|$)`, "s")); return m ? m[1].trim() : ""; };
      const h = ex("HEADLINE"); if (h) items.push({ id: Math.random().toString(36).substr(2, 9), headline: h, brand: ex("BRAND"), summary: ex("SUMMARY"), significance: ex("SIGNIFICANCE"), date: ex("DATE"), selected: false });
    }
    if (!items.length) items.push({ id: "f", headline: "Search done", brand: "Review", summary: r.substring(0, 400), significance: "See results", date: "Recent", selected: false });
    setData((d) => ({ ...d, fetchedNews: items })); setF(false); setStep(4);
  };
  return (
    <div><h2 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Fetch News</h2>
      <Cd>{f ? <div style={{ textAlign: "center", padding: "36px 0" }}><div style={{ width: 36, height: 36, border: "3px solid #222", borderTopColor: S.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} /><div style={{ color: S.accent, fontSize: 15, fontWeight: 600 }}>Searching...</div></div>
        : <Btn onClick={go} style={{ width: "100%" }}>🔍 Fetch Signals</Btn>}</Cd></div>
  );
}

function StepSelect({ data, setData }) {
  const news = data.fetchedNews || []; const ct = news.filter((n) => n.selected).length;
  return (
    <div><h2 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Select News</h2>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ color: S.muted, fontSize: 14 }}>{news.length} found</span>
        <Btn v="ghost" onClick={() => setData((d) => ({ ...d, fetchedNews: d.fetchedNews.map((n) => ({ ...n, selected: true })) }))} style={{ padding: "5px 10px", fontSize: 12 }}>Select All</Btn>
      </div>
      {ct > 0 && <div style={{ background: "#0f1a00", border: "1px solid #2a3d00", borderRadius: 8, padding: "8px 14px", marginBottom: 12, color: S.accent, fontWeight: 600, fontSize: 14 }}>{ct} selected</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {news.map((n) => (
          <Cd key={n.id} style={{ borderColor: n.selected ? S.accent : S.border, cursor: "pointer" }} onClick={() => setData((d) => ({ ...d, fetchedNews: d.fetchedNews.map((x) => x.id === n.id ? { ...x, selected: !x.selected } : x) }))}>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{n.headline}</div>
            <div style={{ color: S.accent, fontSize: 11, marginBottom: 4 }}>{n.brand} · {n.date}</div>
            <div style={{ color: "#999", fontSize: 13 }}>{n.summary}</div>
          </Cd>
        ))}
      </div>
    </div>
  );
}

function StepPlatforms({ data, setData }) {
  const tog = (id) => { const c = data.selectedPlatforms || []; setData((d) => ({ ...d, selectedPlatforms: c.includes(id) ? c.filter((p) => p !== id) : [...c, id] })); };
  return (
    <div><h2 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Platforms</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {PLATFORMS.map((p) => {
          const s = (data.selectedPlatforms || []).includes(p.id);
          return <Cd key={p.id} onClick={() => tog(p.id)} style={{ cursor: "pointer", borderColor: s ? S.accent : S.border, textAlign: "center", padding: 18 }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>{p.icon}</div><div style={{ color: "#fff", fontWeight: 600 }}>{p.label}</div><div style={{ color: S.muted, fontSize: 12 }}>{p.desc}</div>
          </Cd>;
        })}
      </div>
      {(data.selectedPlatforms || []).includes("email") && (
        <Cd><Lb>Email Personalisation</Lb><TA value={data.emailPersonalisation || ""} onChange={(v) => setData((d) => ({ ...d, emailPersonalisation: v }))} placeholder="First Name, Company..." rows={2} />
          <div style={{ marginTop: 12, borderTop: "1px solid #1e1e1e", paddingTop: 12 }}><Lb>Or Import CSV</Lb>
            <label style={{ display: "inline-block", padding: "8px 16px", borderRadius: 8, background: "#1a1a1a", border: "1px solid #333", color: S.text, fontSize: 13, cursor: "pointer" }}>
              📁 Choose CSV<input type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const rd = new FileReader(); rd.onload = (ev) => setData((d) => ({ ...d, emailCsvData: parseCSV(ev.target.result) })); rd.readAsText(file); }} /></label></div>
          {data.emailCsvData && (
            <div style={{ marginTop: 12, background: "#0a0a0a", borderRadius: 8, padding: 12 }}>
              <div style={{ color: S.accent, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{data.emailCsvData.headers.length} cols, {data.emailCsvData.rows.length} rows</div>
              <Lb>Field Mapping</Lb>
              {data.emailCsvData.headers.map((h) => (
                <div key={h} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ color: "#888", fontSize: 13, width: 130 }}>{h}</span><span style={{ color: "#555" }}>→</span>
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
    <div><h2 style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Generate</h2>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 20 }}>{sn.length} × {pl.length} = {sn.length * pl.length} pieces</p>
      {g ? (
        <div style={{ textAlign: "center", padding: "36px 0" }}>
          <div style={{ width: 36, height: 36, border: "3px solid #222", borderTopColor: S.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ color: S.accent, fontSize: 15, fontWeight: 600 }}>{pr.c}/{pr.t}</div>
          <div style={{ color: S.muted, fontSize: 13 }}>{pr.l}</div>
          <div style={{ width: "100%", height: 4, background: "#1a1a1a", borderRadius: 2, marginTop: 14, overflow: "hidden" }}>
            <div style={{ width: `${(pr.c / pr.t) * 100}%`, height: "100%", background: S.accent, transition: "width 0.5s" }} /></div>
        </div>
      ) : <Btn onClick={go} style={{ width: "100%" }}>⚡ Generate All Content</Btn>}
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
    <div style={{ background: "#0a0a0a", borderRadius: 8, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ color: S.accent, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
        <Btn v="secondary" onClick={() => setShow(!show)} style={{ padding: "4px 10px", fontSize: 11 }}>🔄 Redo</Btn>
      </div>
      <div style={{ color: "#ddd", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{value}</div>
      {children}
      {show && (
        <div style={{ marginTop: 10, padding: 10, background: S.card, borderRadius: 8, border: "1px solid #1e1e1e" }}>
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

function ContentBlock({ content, platform, newsItem, data }) {
  const [cur, setCur] = useState(content);
  const [gi, setGi] = useState(false);
  const [img, setImg] = useState(null);
  const [showR, setShowR] = useState(false);
  const [ri, setRi] = useState("");
  const [rd, setRd] = useState(false);
  const sec = parseSections(cur);
  const isI = platform === "instagram";
  const has = Object.keys(sec).length > 0;
  const upSec = (k, v) => setCur((p) => p.replace(new RegExp(`(===${k}===\\s*)[\\s\\S]*?(?=(?:===\\w)|$)`), `$1\n${v}\n\n`));
  const genC = async () => { setGi(true); setImg(await genImage(sec.IMAGE_PROMPT || `Creative: ${newsItem.headline}. Brand: ${data.brandName}. Editorial.`)); setGi(false); };
  const redoAll = async () => { setRd(true); setCur(await callAI(`Redo ${platform}:\n${cur}\nFeedback: "${ri}"\nBrand: ${data.brandName}\nSame format. No hyphens.`, true)); setRd(false); setShowR(false); setRi(""); };
  const pf = PLATFORMS.find((p) => p.id === platform);

  return (
    <Cd style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 18 }}>{pf?.icon}</span><span style={{ color: "#fff", fontWeight: 600 }}>{pf?.label}</span></div>
        {!isI && <Btn v="secondary" onClick={() => setShowR(!showR)} style={{ padding: "6px 12px", fontSize: 12 }}>🔄 Redo</Btn>}
      </div>

      {isI && has ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sec.CAPTION != null && <Redo label="Caption" value={sec.CAPTION} onUpdate={(v) => upSec("CAPTION", v)} data={data} platform="Instagram" />}
          {sec.CREATIVE_DETAILS != null && <Redo label="Creative Instructions" value={sec.CREATIVE_DETAILS} onUpdate={(v) => upSec("CREATIVE_DETAILS", v)} data={data} platform="Instagram" />}
          {sec.IMAGE_PROMPT != null && (
            <Redo label="Image Generation Prompt" value={sec.IMAGE_PROMPT} onUpdate={(v) => upSec("IMAGE_PROMPT", v)} data={data} platform="Instagram">
              <div style={{ marginTop: 10 }}>
                <Btn v="ghost" onClick={genC} disabled={gi} style={{ padding: "8px 16px", fontSize: 13 }}>{gi ? "Generating..." : "🎨 Generate Creative (Nano Banana Pro)"}</Btn>
              </div>
              {img && <div style={{ marginTop: 10 }}>{img.error ? <div style={{ color: "#ff6666", fontSize: 13, padding: 8 }}>{img.error}</div> : <img src={img.image} alt="" style={{ width: "100%", borderRadius: 8 }} />}</div>}
            </Redo>
          )}
        </div>
      ) : has ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(sec).map(([k, v]) => <div key={k} style={{ background: "#0a0a0a", borderRadius: 8, padding: 16 }}><div style={{ color: S.accent, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{k.replace(/_/g, " ")}</div><div style={{ color: "#ddd", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{v}</div></div>)}
        </div>
      ) : <div style={{ color: "#ddd", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", background: "#0a0a0a", borderRadius: 8, padding: 16 }}>{cur}</div>}

      {!isI && showR && (
        <div style={{ marginTop: 12, padding: 12, background: "#0a0a0a", borderRadius: 8 }}>
          <TA value={ri} onChange={setRi} placeholder="What to change..." rows={2} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn onClick={redoAll} disabled={rd || !ri.trim()} style={{ padding: "8px 14px", fontSize: 13 }}>{rd ? "..." : "Regenerate"}</Btn>
            <Btn v="secondary" onClick={() => setShowR(false)} style={{ padding: "8px 14px", fontSize: 13 }}>Cancel</Btn>
          </div>{rd && <Spinner />}
        </div>
      )}
    </Cd>
  );
}

// =================== STEP: RESULTS ===================

function StepResults({ data }) {
  const [aid, setAid] = useState(null);
  const sn = (data.fetchedNews || []).filter((n) => n.selected);
  const ct = data.generatedContent || {};
  useEffect(() => { if (sn.length && !aid) setAid(sn[0].id); }, [sn]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h2 style={{ color: "#fff", fontSize: 28, fontWeight: 700, margin: 0 }}>Your Content</h2>
        <Btn v="ghost" onClick={() => exportCSV(ct, sn, data.selectedPlatforms || [])} style={{ padding: "8px 14px", fontSize: 13 }}>📥 Export CSV</Btn>
      </div>
      <p style={{ color: S.muted, fontSize: 14, marginBottom: 16 }}>Review, redo, or export.</p>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {sn.map((n) => <Tg key={n.id} selected={aid === n.id} onClick={() => setAid(n.id)}>{n.headline.substring(0, 28)}...</Tg>)}
      </div>
      {aid && ct[aid] && (
        <div>
          <div style={{ background: "#0f1a00", border: "1px solid #2a3d00", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
            <div style={{ color: S.accent, fontSize: 14, fontWeight: 600 }}>{sn.find((n) => n.id === aid)?.headline}</div>
          </div>
          {(data.selectedPlatforms || []).map((pid) => {
            const c = ct[aid]?.[pid]; return c ? <ContentBlock key={pid} content={c} platform={pid} newsItem={sn.find((n) => n.id === aid)} data={data} /> : null;
          })}
        </div>
      )}
    </div>
  );
}

// =================== MAIN ENGINE ===================

export default function ContentEngine() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    brandName: "", product: "", brandDescription: "", targetAudience: "", brandPersona: "", brandValues: "",
    platformPersonality: {}, referencePosts: {}, creativeDirection: DEFAULT_CD,
    instaRefImages: [null, null, null, null], refCreativeImages: [null, null, null],
    targetMode: "niche", niche: "", subNiches: "", accountList: "",
    selectedSignals: [], signalPrompts: {}, fetchedNews: [], selectedPlatforms: [],
    emailPersonalisation: "", emailCsvData: null, emailFieldMap: {},
    generatedContent: {}, atRid: null,
  });

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
    <StepSelect data={data} setData={setData} />,
    <StepPlatforms data={data} setData={setData} />,
    <StepGen data={data} setData={setData} setStep={setStep} />,
    <StepResults data={data} />,
  ];

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: S.bg, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: S.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#000", fontFamily: "'Playfair Display',serif" }}>C</div>
          <div><div style={{ fontWeight: 700, fontSize: 15 }}>Content Engine</div><div style={{ color: "#555", fontSize: 11 }}>Signal Driven Content</div></div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid #111" }}>
        <div style={{ display: "flex", gap: 3 }}>
          {STEPS.map((_, i) => <div key={i} onClick={() => i < step && setStep(i)} style={{ flex: 1, height: 3, borderRadius: 2, cursor: i < step ? "pointer" : "default", background: i <= step ? S.accent : "#1a1a1a" }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          {STEPS.map((s, i) => <div key={i} style={{ fontSize: 10, color: i === step ? S.accent : i < step ? S.muted : "#333", fontWeight: i === step ? 700 : 400, textAlign: "center", flex: 1 }}>{s}</div>)}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px", animation: "fadeIn 0.3s" }}>
        {views[step]}
      </div>

      {/* Footer Nav */}
      {step !== 3 && step !== 6 && (
        <div style={{ position: "sticky", bottom: 0, borderTop: "1px solid #1a1a1a", padding: "12px 24px", background: S.bg, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Btn v="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← Back</Btn>
          <span style={{ color: "#555", fontSize: 13 }}>{step + 1}/{STEPS.length}</span>
          {step < 7 ? <Btn onClick={() => setStep((s) => s + 1)} disabled={!ok()}>Continue →</Btn>
            : <Btn onClick={() => { setStep(0); setData((d) => ({ ...d, generatedContent: {}, fetchedNews: [] })); }}>Start Over</Btn>}
        </div>
      )}
    </div>
  );
}
