"use client";

import { BookmarkSimple, MagnifyingGlass, X } from "@phosphor-icons/react";
import { Chip, Input, Select } from "../ui";
import { dateValue } from "../../lib/parse";

export const SORTS = [
  { id: "fit", label: "Best fit first" },
  { id: "latest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "brand", label: "Brand A to Z" },
];

/**
 * Narrowing a list of signals: words, kind of move, where it came from, and
 * saved only. The kinds and sources on offer come from the list itself, so a
 * filter never leads to nothing.
 */
export default function SignalToolbar({ filters, onChange, signals, savedIds, count, placeholder = "Search these signals" }) {
  const { query = "", sort = "fit", type = "", source = "", savedOnly = false } = filters;
  const set = (patch) => onChange({ ...filters, ...patch });

  const types = countBy(signals, "type");
  const sources = countBy(signals, "source");
  const narrowed = count !== signals.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder={placeholder}
            aria-label={placeholder}
            className="pl-10 pr-10"
          />
          {query ? (
            <button
              type="button"
              onClick={() => set({ query: "" })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-faint transition-colors hover:text-ink"
            >
              <X size={14} weight="bold" />
            </button>
          ) : null}
        </div>
        <div className="w-[168px] shrink-0">
          <Select value={sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort signals">
            {SORTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
        <Chip selected={!type && !source && !savedOnly} onClick={() => set({ type: "", source: "", savedOnly: false })}>
          All
        </Chip>
        {types.map(([t, n]) => (
          <Chip key={t} selected={type === t} onClick={() => set({ type: type === t ? "" : t })} className="shrink-0">
            {t} <span className="tabular font-normal">{n}</span>
          </Chip>
        ))}
        {sources.length > 1 ? <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" /> : null}
        {sources.length > 1
          ? sources.map(([s, n]) => (
              <Chip key={s} selected={source === s} onClick={() => set({ source: source === s ? "" : s })} className="shrink-0">
                {s} <span className="tabular font-normal">{n}</span>
              </Chip>
            ))
          : null}
        {savedIds?.size ? (
          <Chip selected={savedOnly} onClick={() => set({ savedOnly: !savedOnly })} className="shrink-0">
            <BookmarkSimple size={13} weight={savedOnly ? "fill" : "regular"} />
            Saved
          </Chip>
        ) : null}
      </div>

      <p className="meta tabular" aria-live="polite">
        {narrowed ? `${count} of ${signals.length} signals` : `${signals.length} ${signals.length === 1 ? "signal" : "signals"}`}
      </p>
    </div>
  );
}

function countBy(list, key) {
  const m = new Map();
  for (const s of list || []) if (s[key]) m.set(s[key], (m.get(s[key]) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function applySignalFilters(signals, { query = "", sort = "fit", type = "", source = "", savedOnly = false }, savedIds) {
  const q = query.trim().toLowerCase();
  const out = (signals || []).filter((s) => {
    if (type && s.type !== type) return false;
    if (source && s.source !== source) return false;
    if (savedOnly && !savedIds?.has(s.id)) return false;
    if (!q) return true;
    return [s.headline, s.brand, s.summary, s.significance, s.angle, s.source, s.type]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const byDate = (a, b) => dateValue(b.date) - dateValue(a.date) || (b.fetchedAt || 0) - (a.fetchedAt || 0);
  if (sort === "oldest") out.sort((a, b) => dateValue(a.date) - dateValue(b.date));
  else if (sort === "brand") out.sort((a, b) => String(a.brand || "").localeCompare(String(b.brand || "")));
  else if (sort === "latest") out.sort(byDate);
  else out.sort((a, b) => (Number(b.fit) || 0) - (Number(a.fit) || 0) || byDate(a, b));
  return out;
}
