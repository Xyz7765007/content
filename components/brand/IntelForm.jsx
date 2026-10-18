"use client";

import { useEffect, useState } from "react";
import { Check, X } from "@phosphor-icons/react";
import { Badge, Field, Input, Select, cx } from "../ui";
import { REGIONS } from "../../lib/constants";
import { PLATFORMS as INTEL_PLATFORMS } from "../../lib/intel/taxonomy";
import { REEL_GOALS } from "../../lib/studio/options";

const blank = { platforms: [], region: "", keywords: [], competitors: {}, goal: "" };

const handles = (text) =>
  String(text || "")
    .split(/[\s,]+/)
    .map((h) => h.replace(/^@/, "").replace(/^https?:\/\/(www\.)?[^/]+\//, "").replace(/\/.*$/, "").trim())
    .filter((h) => /^[\w.]{2,30}$/.test(h))
    .slice(0, 5);

/**
 * What the research reads: the platforms the brand wants to win on (the
 * first is the main one), its market, the words its niche is searched by,
 * the competitors to compare against on each platform, and the goal.
 */
export default function IntelForm({ brand, setBrand, compact = false }) {
  const intel = { ...blank, ...(brand.intel || {}) };
  const set = (patch) => setBrand((b) => ({ ...b, intel: { ...blank, ...(b.intel || {}), ...patch } }));

  const toggle = (id) => {
    const on = intel.platforms.includes(id);
    set({ platforms: on ? intel.platforms.filter((p) => p !== id) : [...intel.platforms, id] });
  };

  return (
    <div className="flex flex-col gap-6">
      <Field label="Where do you want to win?" hint="Pick in order of importance. The first is your main platform: answers, briefings and Studio start there.">
        <div className="mt-1 flex flex-wrap gap-2">
          {INTEL_PLATFORMS.map((p) => {
            const at = intel.platforms.indexOf(p.id);
            const on = at >= 0;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(p.id)}
                className={cx(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] transition-[transform,border-color,background-color] active:scale-[0.97] pointer-coarse:min-h-11",
                  on ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
                )}
              >
                {on ? <Check size={13} weight="bold" aria-hidden="true" /> : null}
                {p.label}
                {at === 0 ? <span className="rounded-full bg-canvas/20 px-1.5 text-[11px]">Main</span> : null}
              </button>
            );
          })}
        </div>
      </Field>

      <div className={cx("grid gap-5", !compact && "sm:grid-cols-2")}>
        <Field label="Region" htmlFor="intel-region" hint="Where your customers are. Trends and searches follow it.">
          <Select id="intel-region" value={intel.region || "Global"} onChange={(e) => set({ region: e.target.value === "Global" ? "" : e.target.value })}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r === "Global" ? "Everywhere" : r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Your goal" htmlFor="intel-goal" hint="Optional. Studio leans content towards it.">
          <Select id="intel-goal" value={intel.goal || ""} onChange={(e) => set({ goal: e.target.value })}>
            <option value="">No single goal</option>
            {REEL_GOALS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Keywords value={intel.keywords} onChange={(keywords) => set({ keywords })} />

      {!compact || intel.platforms.length ? (
        <Field label="Competitors" hint="Accounts to compare against, up to 5 per platform. I read how they post and what breaks out for them.">
          <div className="mt-1 flex flex-col gap-3">
            {(intel.platforms.length ? intel.platforms : ["instagram"]).map((p) => (
              <Competitors key={p} platform={p} value={intel.competitors?.[p] || []} onChange={(list) => set({ competitors: { ...intel.competitors, [p]: list } })} />
            ))}
          </div>
        </Field>
      ) : null}
    </div>
  );
}

function Keywords({ value, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const words = draft
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 1);
    if (!words.length) return;
    onChange([...new Set([...(value || []), ...words])].slice(0, 6));
    setDraft("");
  };
  return (
    <Field label="Search words" htmlFor="intel-kw" hint="How people search your niche, one to three words each. Up to 6. The first leads.">
      <div className="flex flex-wrap items-center gap-1.5">
        {(value || []).map((w, i) => (
          <span key={w} className="inline-flex items-center gap-1 rounded-full border border-line bg-raised py-1 pl-3 pr-1 text-[13px]">
            {w}
            {i === 0 ? <Badge tone="accent" className="ml-1">Main</Badge> : null}
            <button type="button" aria-label={`Remove ${w}`} onClick={() => onChange(value.filter((x) => x !== w))} className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink">
              <X size={11} weight="bold" />
            </button>
          </span>
        ))}
      </div>
      {(value || []).length < 6 ? (
        <div className="flex gap-2">
          <Input
            id="intel-kw"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            placeholder={(value || []).length ? "Add another" : "skincare routine, sensitive skin"}
          />
        </div>
      ) : null}
    </Field>
  );
}

function Competitors({ platform, value, onChange }) {
  const label = INTEL_PLATFORMS.find((p) => p.id === platform)?.label || platform;
  const [text, setText] = useState(value.map((h) => `@${h}`).join(" "));
  useEffect(() => {
    setText(value.map((h) => `@${h}`).join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);
  return (
    <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-24 shrink-0 text-[13px] text-muted">{label}</span>
      <Input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(handles(e.target.value));
        }}
        placeholder="@brandone @brandtwo"
        aria-label={`Competitors on ${label}`}
      />
    </label>
  );
}

