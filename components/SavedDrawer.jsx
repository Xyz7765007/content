"use client";
import { useEffect, useState } from "react";
import { PLATFORM_MARK, Mark, TypeBadge } from "./icons";
import { FolderPop } from "./saved-ui";

// Profile drawer: everything saved on this device, with folders, plus settings.
// Two savable types, deliberately not merged: a signal is idea inventory, a
// draft is output inventory. A folder holds both.

const PLATFORM_LABEL = { instagram: "Instagram", linkedin: "LinkedIn", twitter: "Twitter / X", email: "Email" };

function relTime(ts) {
  const h = Math.max(0, Math.round((Date.now() - ts) / 3600e3));
  if (h < 1) return "just now"; if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return d === 1 ? "1d ago" : `${d}d ago`;
}

export default function SavedDrawer({ open, onClose, saved, updateSaved, theme, setTheme, notify }) {
  const [tab, setTab] = useState("signals");
  const [folder, setFolder] = useState("all");
  const [pop, setPop] = useState(null); // { keys, kind, anchor }
  const [confirmReset, setConfirmReset] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape" && !pop) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, pop]);

  if (!open) return null;

  const signals = Object.values(saved.signals).filter((s) => folder === "all" || (s.folders || []).includes(folder)).sort((a, b) => b.savedAt - a.savedAt);
  const drafts = Object.values(saved.drafts).filter((d) => folder === "all" || (d.folders || []).includes(folder)).sort((a, b) => b.savedAt - a.savedAt);
  const nSig = Object.keys(saved.signals).length, nDr = Object.keys(saved.drafts).length;
  const nudge = nSig >= 8 && !saved.folders.length;

  const chip = (on) => ({ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 11px", borderRadius: "var(--r-chip)", border: `1px solid ${on ? "var(--ink)" : "var(--border)"}`, background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--ink-inv)" : "var(--ink-2)", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "var(--f-text)" });
  const small = { height: 28, padding: "0 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--f-text)" };
  const ghost = { ...small, border: 0, background: "transparent", color: "var(--accent)" };
  const secTitle = { fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--ink-3)", margin: "22px 0 10px", display: "flex", alignItems: "center", gap: 10 };

  const copy = (t) => { try { const p = navigator.clipboard && navigator.clipboard.writeText(t); if (p && p.catch) p.catch(() => {}); notify && notify("Copied."); } catch {} };
  const removeSignal = (key) => updateSaved((s) => { delete s.signals[key]; });
  const removeDraft = (id) => updateSaved((s) => { delete s.drafts[id]; });
  const deleteFolder = (fid) => updateSaved((s) => { s.folders = s.folders.filter((f) => f.id !== fid); Object.values(s.signals).forEach((x) => { x.folders = (x.folders || []).filter((f) => f !== fid); }); Object.values(s.drafts).forEach((x) => { x.folders = (x.folders || []).filter((f) => f !== fid); }); });
  const addFolder = (e) => { e.preventDefault(); const n = newName.trim(); if (!n) return; updateSaved((s) => { s.folders.push({ id: Math.random().toString(36).slice(2, 9), name: n, color: ["#FFC2D1", "#D3E5EF", "#CBE8BE", "#FAF0C8", "#EBE6F7", "#DCEEEE"][s.folders.length % 6], createdAt: Date.now() }); }); setNewName(""); };

  const empty = (h, p) => (
    <div style={{ border: "1px dashed var(--border)", borderRadius: "var(--r-card)", padding: "26px 22px", textAlign: "center", background: "var(--ground)" }}>
      <h4 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>{h}</h4>
      <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13.5, maxWidth: "42ch", marginLeft: "auto", marginRight: "auto" }}>{p}</p>
    </div>
  );

  return (
    <>
      <div className="ce-fade" onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--scrim)", zIndex: 200 }} />
      <aside className="ce-slide" role="dialog" aria-label="Profile and saved items" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 100%)", background: "var(--surface)", zIndex: 201, borderLeft: "1px solid var(--border)", boxShadow: "var(--e3)", overflow: "auto", padding: "22px 24px 40px", color: "var(--ink)" }}>
        <button type="button" onClick={onClose} aria-label="Close" className="ce-focus" style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: "var(--r-ctl)", display: "grid", placeItems: "center", color: "var(--ink-3)", background: "transparent", border: 0, cursor: "pointer", fontSize: 14 }}>✕</button>

        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingRight: 40 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "linear-gradient(135deg, var(--pink), var(--blue))", display: "grid", placeItems: "center", fontFamily: "var(--f-display)", fontSize: 20, color: "#141414", flex: "none" }}>S</div>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, letterSpacing: "-.015em", fontWeight: 600 }}>Your profile</h2>
            <p style={{ margin: "2px 0 0", color: "var(--ink-3)", fontSize: 12.5 }}>Saved on this device · {nSig} signal{nSig === 1 ? "" : "s"} · {nDr} draft{nDr === 1 ? "" : "s"} · {saved.folders.length} folder{saved.folders.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", margin: "18px 0 14px" }}>
          {[["signals", "Signals", nSig], ["drafts", "Drafts", nDr], ["folders", "Folders", saved.folders.length], ["settings", "Settings", null]].map(([k, l, c]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className="ce-focus" style={{ height: 38, padding: "0 12px", fontWeight: tab === k ? 600 : 500, color: tab === k ? "var(--ink)" : "var(--ink-2)", borderBottom: `2px solid ${tab === k ? "var(--ink)" : "transparent"}`, marginBottom: -1, background: "transparent", border: 0, borderBottomWidth: 2, borderBottomStyle: "solid", cursor: "pointer", fontSize: 13.5, fontFamily: "var(--f-text)" }}>
              {l}{c != null && <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)", marginLeft: 6 }}>{c}</span>}
            </button>
          ))}
        </div>

        {(tab === "signals" || tab === "drafts") && (saved.folders.length > 0 || nudge) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <button type="button" className="ce-tag" style={chip(folder === "all")} onClick={() => setFolder("all")}>All saved</button>
            {saved.folders.map((f) => (
              <button key={f.id} type="button" className="ce-tag" style={chip(folder === f.id)} onClick={() => setFolder(f.id)}><span style={{ width: 8, height: 8, borderRadius: "50%", background: f.color }} />{f.name}</button>
            ))}
            {nudge && <span style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--accent)" }}>{nSig} saved. Group them?</span>}
          </div>
        )}

        {tab === "signals" && (
          signals.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {signals.map((s) => (
                <div key={s.key} className="ce-card ce-saved" style={{ background: "var(--ground)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                    <TypeBadge type={s.type} /><span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.brand}</span>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)" }}>saved {relTime(s.savedAt)}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, marginBottom: 6 }}>{s.headline}</div>
                  <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, marginBottom: 8 }}>{s.significance}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--ink-3)" }}>
                    {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--link)" }}>{s.domain || s.source} ↗</a> : <span>{s.source}</span>}
                    <span>·</span><span>{s.date}</span>
                    <span style={{ flex: 1 }} />
                    <button type="button" style={ghost} onClick={(e) => setPop({ keys: [s.key], kind: "signals", anchor: e.currentTarget.getBoundingClientRect() })}>Folder ▾</button>
                    <button type="button" style={ghost} onClick={() => removeSignal(s.key)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          ) : empty(folder === "all" ? "Nothing saved yet." : "This folder is empty.", folder === "all" ? "Save any signal from Select News and it lands here. Folders appear once you have something to organise." : "Save signals here from Select News, or move them from another folder.")
        )}

        {tab === "drafts" && (
          drafts.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {drafts.map((d) => (
                <div key={d.id} className="ce-card" style={{ background: "var(--ground)", border: "1px solid var(--border)", borderRadius: "var(--r-card)", overflow: "hidden" }}>
                  {d.type === "controversy" && <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, background: "var(--warning-fill)", color: "var(--warning)", padding: "6px 14px" }}>Controversy signal · verify the source before posting</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--hair)", fontSize: 12.5 }}>
                    <Mark text={PLATFORM_MARK[d.platform] || "•"} tone="azure" /><span style={{ fontWeight: 600 }}>{PLATFORM_LABEL[d.platform] || d.platform}</span>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)" }}>saved {relTime(d.savedAt)}</span>
                  </div>
                  <div style={{ padding: "12px 14px", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 180, overflow: "hidden", maskImage: "linear-gradient(#000 70%, transparent)", WebkitMaskImage: "linear-gradient(#000 70%, transparent)" }}>{d.content}</div>
                  <div style={{ display: "flex", gap: 6, padding: "10px 12px", borderTop: "1px solid var(--hair)", alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" style={small} onClick={() => copy(d.content)}>Copy</button>
                    <button type="button" style={ghost} onClick={(e) => setPop({ keys: [d.id], kind: "drafts", anchor: e.currentTarget.getBoundingClientRect() })}>Folder ▾</button>
                    <button type="button" style={ghost} onClick={() => removeDraft(d.id)}>Remove</button>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>from: {d.signalHeadline}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : empty("No drafts saved yet.", "Generate content, then use Save draft on any piece you like. It lands here with a link back to the signal.")
        )}

        {tab === "folders" && (
          <div>
            {saved.folders.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {saved.folders.map((f) => {
                  const ns = Object.values(saved.signals).filter((x) => (x.folders || []).includes(f.id)).length;
                  const nd = Object.values(saved.drafts).filter((x) => (x.folders || []).includes(f.id)).length;
                  return (
                    <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-ctl)", background: "var(--ground)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 12, height: 12, borderRadius: "50%", background: f.color }} />
                        <div><div style={{ fontWeight: 600 }}>{f.name}</div><div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--ink-3)" }}>{ns} signal{ns === 1 ? "" : "s"} · {nd} draft{nd === 1 ? "" : "s"}</div></div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" style={small} onClick={() => { setFolder(f.id); setTab("signals"); }}>Open</button>
                        <button type="button" style={ghost} onClick={() => deleteFolder(f.id)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : empty("No folders yet.", "Folders are how you keep a campaign together. Save any signal and the picker will suggest names, or make one here.")}
            <form onSubmit={addFolder} style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New folder name" className="ce-input" style={{ flex: 1, fontFamily: "var(--f-text)", fontSize: 13.5, padding: "9px 11px", borderRadius: "var(--r-ctl)", border: "1px solid var(--border-field)", background: "var(--ground)", color: "var(--ink)" }} />
              <button type="submit" className="ce-btn ce-btn-primary" style={{ ...small, background: "var(--ink)", color: "var(--ink-inv)", border: 0, height: 38, padding: "0 14px" }}>Add folder</button>
            </form>
          </div>
        )}

        {tab === "settings" && (
          <div>
            <div style={secTitle}>Appearance</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--hair)" }}>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>Theme</div><div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>Light is the default. Dark is here if you want it.</div></div>
              <div style={{ display: "inline-flex", background: "var(--sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-chip)", padding: 3 }}>
                {["light", "dark"].map((t) => (
                  <button key={t} type="button" onClick={() => setTheme(t)} className="ce-focus" style={{ height: 28, padding: "0 12px", borderRadius: "var(--r-chip)", fontSize: 12.5, fontWeight: theme === t ? 600 : 500, color: theme === t ? "var(--ink)" : "var(--ink-2)", background: theme === t ? "var(--surface)" : "transparent", border: 0, cursor: "pointer", boxShadow: theme === t ? "var(--e1)" : "none", fontFamily: "var(--f-text)" }}>{t === "light" ? "Light" : "Dark"}</button>
                ))}
              </div>
            </div>
            <div style={secTitle}>Data</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center", padding: "12px 0" }}>
              <div><div style={{ fontWeight: 600, fontSize: 14 }}>Saved items live in this browser</div><div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>Signals, drafts and folders are stored locally on this device. Clearing site data removes them.</div></div>
              <button type="button" style={{ ...small, ...(confirmReset ? { background: "var(--danger)", color: "#fff", border: 0 } : {}) }} onClick={() => { if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 3000); return; } updateSaved((s) => { s.signals = {}; s.drafts = {}; s.folders = []; }); setConfirmReset(false); notify && notify("Saved data cleared."); }}>{confirmReset ? "Confirm clear" : "Clear all saved"}</button>
            </div>
          </div>
        )}
      </aside>
      {pop && <FolderPop anchor={pop.anchor} keys={pop.keys} kind={pop.kind} saved={saved} updateSaved={updateSaved} onClose={() => setPop(null)} notify={notify} />}
    </>
  );
}
