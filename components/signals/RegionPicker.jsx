"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { GlobeSimple, MagnifyingGlass, MapPin, Plus, X } from "@phosphor-icons/react";
import { cx } from "../ui";
import { GLOBAL_REGION, REGIONS, normaliseRegions } from "../../lib/constants";

/**
 * Search for a region and add it, or add one that is not on the list.
 *
 * Type to filter the list. Arrow keys move, Enter adds, Escape closes. When the
 * text matches nothing exactly the first row offers to add it as typed, so a
 * user can watch "Nordics" or "Tier 2 India" without waiting for us to add it.
 * Choosing Global clears everything else, and choosing anything else drops
 * Global, because the two mean opposite things to the search.
 */
export default function RegionPicker({ value, onChange, placeholder = "Search a region" }) {
  const selected = useMemo(() => normaliseRegions(value), [value]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  const matches = useMemo(() => {
    const pool = REGIONS.filter((r) => !selected.includes(r));
    if (!lower) return pool.slice(0, 8);
    return pool.filter((r) => r.toLowerCase().includes(lower)).slice(0, 8);
  }, [lower, selected]);

  const exact = REGIONS.some((r) => r.toLowerCase() === lower);
  const alreadyPicked = selected.some((r) => r.toLowerCase() === lower);
  const canAddCustom = trimmed.length >= 2 && !exact && !alreadyPicked;

  const rows = useMemo(() => {
    const out = matches.map((label) => ({ kind: "region", label }));
    if (canAddCustom) out.unshift({ kind: "custom", label: trimmed });
    return out;
  }, [matches, canAddCustom, trimmed]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const add = (label) => {
    let next;
    if (label === GLOBAL_REGION) next = [GLOBAL_REGION];
    else next = [...selected.filter((r) => r !== GLOBAL_REGION), label];
    onChange(normaliseRegions(next));
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const remove = (label) => {
    const next = selected.filter((r) => r !== label);
    onChange(next.length ? next : [GLOBAL_REGION]);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) add(row.label);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && selected.length) {
      const last = selected[selected.length - 1];
      if (last !== GLOBAL_REGION) remove(last);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-raised px-2.5 py-2 transition-colors focus-within:border-accent-deep focus-within:ring-2 focus-within:ring-accent-deep/25 hover:border-line-strong">
        {selected.map((r) => (
          <span
            key={r}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium text-[#141414]",
              r === GLOBAL_REGION ? "border-[#b7d6e7] bg-[#D3E5EF]" : "border-accent-line bg-accent"
            )}
          >
            {r === GLOBAL_REGION ? <GlobeSimple size={13} /> : <MapPin size={13} />}
            {r}
            {r !== GLOBAL_REGION || selected.length > 1 ? (
              <button
                type="button"
                onClick={() => remove(r)}
                aria-label={`Remove ${r}`}
                className="ml-0.5 inline-flex items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100 pointer-coarse:-m-2 pointer-coarse:h-9 pointer-coarse:w-9"
              >
                <X size={12} weight="bold" />
              </button>
            ) : null}
          </span>
        ))}

        <div className="relative min-w-[180px] flex-1">
          <MagnifyingGlass
            size={15}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={placeholder}
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="h-8 w-full bg-transparent pl-8 pr-2 text-[15px] text-ink placeholder:text-faint focus:outline-none sm:text-sm pointer-coarse:h-11"
          />
        </div>
      </div>

      <AnimatePresence>
        {open && rows.length ? (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-[300px] overflow-y-auto rounded-[16px] border border-line bg-surface p-1.5 shadow-float"
          >
            {rows.map((row, i) => {
              const isActive = i === active;
              const isCustom = row.kind === "custom";
              const isGlobalRow = row.label === GLOBAL_REGION;
              return (
                <motion.li
                  key={`${row.kind}-${row.label}`}
                  role="option"
                  aria-selected={isActive}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 6) * 0.025, duration: 0.18 }}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(row.label)}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors",
                    isActive ? "bg-sunken text-ink" : "text-ink"
                  )}
                >
                  <span
                    className={cx(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      isCustom
                        ? "bg-accent-soft text-accent-deep"
                        : isGlobalRow
                          ? "bg-mist-soft text-mist-deep"
                          : "bg-sunken text-muted"
                    )}
                  >
                    {isCustom ? (
                      <Plus size={14} weight="bold" />
                    ) : isGlobalRow ? (
                      <GlobeSimple size={14} />
                    ) : (
                      <MapPin size={14} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {isCustom ? `Add “${row.label}”` : row.label}
                    </span>
                    <span className="block text-[12px] text-muted">
                      {isCustom
                        ? "Your own region, used as typed"
                        : isGlobalRow
                          ? "No geographic focus"
                          : "Prioritise signals from here"}
                    </span>
                  </span>
                  {isActive ? <span className="meta text-[10px]">Enter</span> : null}
                </motion.li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
