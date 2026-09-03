"use client";
import { useEffect, useRef, useState } from "react";
import { BookmarkIcon } from "./icons";
import { newFolder, signalKey, snapshotSignal, suggestFolders } from "../lib/saved";

// ---------- Bookmark: one control, two depths ----------
// Click saves instantly to "All saved". The chevron opens the folder picker.
export function BookmarkButton({ item, saved, updateSaved, onFolders, notify }) {
  const key = signalKey(item);
  const isSaved = !!saved.signals[key];
  const heartRef = useRef(null);

  const toggle = (e) => {
    e.stopPropagation();
    if (isSaved) {
      updateSaved((s) => { delete s.signals[key]; });
      notify && notify("Removed from saved.");
      return;
    }
    updateSaved((s) => { s.signals[key] = snapshotSignal(item); });
    const el = heartRef.current;
    if (el) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
    const n = Object.keys(saved.signals).length + 1;
    notify && notify(n === 8 && !saved.folders.length ? "Saved. 8 saved now. Group them?" : "Saved to All saved.", { label: "Choose folder", run: (rect) => onFolders([key], rect) });
  };

  return (
    <span style={{ display: "inline-flex", border: `1px solid ${isSaved ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--r-ctl)", overflow: "hidden", background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
      <button ref={heartRef} type="button" className={`ce-bm-heart ce-focus ${isSaved ? "is-saved" : ""}`} onClick={toggle}
        aria-pressed={isSaved} aria-label={isSaved ? "Remove from saved" : "Save this signal"} title={isSaved ? "Saved" : "Save"}
        style={{ width: 36, height: 32, display: "grid", placeItems: "center", color: "var(--accent)", background: "transparent", border: 0, cursor: "pointer" }}>
        <BookmarkIcon />
      </button>
      <button type="button" className="ce-focus" aria-label="Save to a folder" title="Save to a folder"
        onClick={(e) => { e.stopPropagation(); if (!isSaved) updateSaved((s) => { s.signals[key] = snapshotSignal(item); }); onFolders([key], e.currentTarget.getBoundingClientRect()); }}
        style={{ width: 24, height: 32, display: "grid", placeItems: "center", color: "var(--ink-3)", background: "transparent", border: 0, borderLeft: "1px solid var(--border)", cursor: "pointer", fontSize: 10 }}>
        ▾
      </button>
    </span>
  );
}

// ---------- Folder picker popover ----------
// kind: "signals" | "drafts". keys: the saved item keys/ids being filed.
export function FolderPop({ anchor, keys, kind, saved, updateSaved, onClose, notify }) {
  const ref = useRef(null);
  const [name, setName] = useState("");
  const [pos, setPos] = useState({ left: anchor?.left || 24, top: (anchor?.bottom || 100) + 6 });
  const bucket = saved[kind] || {};
  const first = !saved.folders.length;
  const firstItem = keys.map((k) => bucket[k]).find(Boolean);
  const suggestions = first && firstItem && kind === "signals" ? suggestFolders(firstItem) : [];

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    let left = pos.left, top = pos.top;
    if (r.right > window.innerWidth - 8) left = Math.max(8, window.innerWidth - r.width - 8);
    if (r.bottom > window.innerHeight - 8) top = Math.max(8, (anchor?.top || 100) - r.height - 6);
    if (left !== pos.left || top !== pos.top) setPos({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.folders.length]);

  const inAll = (fid) => keys.every((k) => bucket[k] && (bucket[k].folders || []).includes(fid));
  const assign = (fid, on) => {
    updateSaved((s) => { keys.forEach((k) => { const it = (s[kind] || {})[k]; if (!it) return; it.folders = it.folders || []; const i = it.folders.indexOf(fid); if (on && i < 0) it.folders.push(fid); if (!on && i >= 0) it.folders.splice(i, 1); }); });
    const f = saved.folders.find((x) => x.id === fid);
    if (on && f && notify) notify(`Saved to ${f.name}.`);
  };
  const create = (n) => {
    let created = null;
    updateSaved((s) => { created = newFolder(s, n); if (created) keys.forEach((k) => { const it = (s[kind] || {})[k]; if (it) { it.folders = it.folders || []; it.folders.push(created.id); } }); });
    if (created && notify) notify(`Saved to ${created.name}.`);
    onClose();
  };

  const row = { display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 7, fontSize: 13, width: "100%", textAlign: "left", background: "transparent", border: 0, color: "var(--ink)", cursor: "pointer" };

  return (
    <div ref={ref} className="ce-popin" role="dialog" aria-label="Save to folder" style={{ position: "fixed", zIndex: 220, left: pos.left, top: pos.top, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--e3)", padding: 8, minWidth: 260, maxWidth: 320 }}>
      <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-3)", padding: "6px 9px 4px" }}>
        {keys.length > 1 ? `Save ${keys.length} items to` : "Save to"}
      </div>
      {first ? (
        <>
          {suggestions.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 8px 8px" }}>
              {suggestions.map((n) => (
                <button key={n} type="button" className="ce-tag ce-focus" onClick={() => create(n)}
                  style={{ height: 26, padding: "0 10px", borderRadius: "var(--r-chip)", border: "1px solid var(--accent-fill)", background: "var(--accent-soft)", color: "var(--accent)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>+ {n}</button>
              ))}
            </div>
          )}
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-3)", padding: "0 9px 4px" }}>{suggestions.length ? "Suggested from this signal. Or name your own:" : "Name your first folder:"}</div>
        </>
      ) : (
        <>
          {saved.folders.map((f) => (
            <label key={f.id} style={{ ...row }}>
              <input type="checkbox" checked={inAll(f.id)} onChange={(e) => assign(f.id, e.target.checked)} style={{ accentColor: "var(--accent)" }} />
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: f.color, flex: "none" }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            </label>
          ))}
          <div style={{ height: 1, background: "var(--hair)", margin: "6px 0" }} />
        </>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) create(name); }} style={{ display: "flex", gap: 6, padding: 4 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New folder" aria-label="New folder name" autoFocus={first} className="ce-input"
          style={{ flex: 1, fontFamily: "var(--f-text)", fontSize: 13, padding: "7px 9px", borderRadius: 7, border: "1px solid var(--border-field)", background: "var(--ground)", color: "var(--ink)" }} />
        <button type="submit" className="ce-btn ce-btn-primary" style={{ height: 32, padding: "0 12px", borderRadius: 7, background: "var(--ink)", color: "var(--ink-inv)", border: 0, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Add</button>
      </form>
    </div>
  );
}

// ---------- Toast ----------
export function Toast({ toast, onAction }) {
  if (!toast) return null;
  return (
    <div className="ce-up" role="status" style={{ position: "fixed", left: 22, bottom: 84, zIndex: 210, background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "3px solid var(--accent)", borderRadius: 12, padding: "11px 14px", boxShadow: "var(--e3)", display: "flex", alignItems: "center", gap: 12, fontSize: 13, maxWidth: 360, color: "var(--ink)" }}>
      <span>{toast.msg}</span>
      {toast.action && (
        <button type="button" className="ce-btn ce-btn-ghost" onClick={(e) => onAction(toast.action, e.currentTarget.getBoundingClientRect())}
          style={{ height: 28, padding: "0 10px", borderRadius: 7, background: "transparent", color: "var(--accent)", border: 0, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>{toast.action.label}</button>
      )}
    </div>
  );
}
