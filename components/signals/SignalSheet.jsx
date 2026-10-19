"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, BookmarkSimple, Check, Lightning } from "@phosphor-icons/react";
import { Badge, Button, Input, Sheet, cx } from "../ui";
import PostCard, { PLATFORM_META } from "../compose/PostCard";
import Huesy from "../huesy/Huesy";
import { useStore } from "../../lib/store";
import { isBusy, useWriting, write } from "../../lib/writer";
import { hasSourceLink, hostOf, relativeDay, resolveSignalUrl } from "../../lib/parse";
import { sourceCta } from "../../lib/intel/taxonomy";

const ALL = ["instagram", "linkedin", "twitter", "email"];

/**
 * One signal, opened inside Huesy: what happened, why it matters for this
 * brand, and the posts. Opened from "Write a post" it starts writing at once
 * for the platforms the brand publishes on; opened from the headline it waits
 * to be asked.
 */
export default function SignalSheet({ signal, open, onClose, autoWrite = false, saved, onToggleSave, onSavePost }) {
  const brand = useStore((s) => s.brand);
  const drafts = useStore((s) => (signal ? s.drafts?.[signal.id] : null)) || {};
  const jobs = useWriting((s) => s.jobs);
  const defaults = useMemo(() => {
    const active = (brand.activePlatforms || []).filter((p) => ALL.includes(p));
    return active.length ? active : ALL;
  }, [brand.activePlatforms]);
  const [platforms, setPlatforms] = useState(defaults);
  const [personalise, setPersonalise] = useState("");
  const started = useRef(null);

  // Each time a different signal opens, start from the brand's platforms, or
  // from the ones that already have drafts.
  useEffect(() => {
    if (!open || !signal) return;
    const withDrafts = Object.keys(drafts);
    setPlatforms(withDrafts.length ? [...new Set([...withDrafts])] : defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signal?.id]);

  // "Write a post" means write: no extra button to press.
  useEffect(() => {
    if (!open || !signal || !autoWrite || started.current === signal.id) return;
    started.current = signal.id;
    const missing = defaults.filter((p) => !drafts[p]);
    if (missing.length) write(signal, missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signal?.id, autoWrite]);

  useEffect(() => {
    if (!open) started.current = null;
  }, [open]);

  if (!signal) return null;

  const linked = hasSourceLink(signal);
  const url = resolveSignalUrl(signal);
  const busy = isBusy(jobs, signal.id, platforms);
  const writingCount = platforms.filter((p) => ["queued", "writing"].includes(jobs[`${signal.id}:${p}`]?.state)).length;
  const shown = ALL.filter((p) => platforms.includes(p) && (drafts[p] || jobs[`${signal.id}:${p}`]));
  const unwritten = platforms.filter((p) => !drafts[p]);

  const toggle = (p) =>
    setPlatforms((cur) => (cur.includes(p) ? (cur.length > 1 ? cur.filter((x) => x !== p) : cur) : [...cur, p]));

  const options = platforms.includes("email") && personalise.trim() ? { emailPersonalisation: personalise.trim() } : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={640}
      label={signal.headline}
      title={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pr-2 text-[12px] text-muted">
          {signal.type ? <Badge>{signal.type}</Badge> : null}
          {signal.brand ? <span className="font-medium text-ink">{signal.brand}</span> : null}
          <span>{[signal.source, relativeDay(signal.date)].filter(Boolean).join(" · ")}</span>
          {signal.sample ? <Badge tone="mist">Sample</Badge> : null}
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={() => onToggleSave?.(signal)} className={cx(saved && "text-accent-deep")}>
            <BookmarkSimple size={15} weight={saved ? "fill" : "regular"} />
            {saved ? "Saved" : "Save signal"}
          </Button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1 rounded-full border border-accent-line px-3.5 text-[13px] font-medium text-accent-deep transition-colors hover:bg-accent-soft"
          >
            {linked ? sourceCta({ source: signal.source, url }) : "Find this story"}
            <ArrowUpRight size={13} weight="bold" />
          </a>
        </div>
      }
    >
      <h2 className="font-display text-[23px] leading-snug text-ink sm:text-[25px]">{signal.headline}</h2>
      {signal.summary ? <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">{signal.summary}</p> : null}
      {signal.angle || signal.significance ? (
        <div className="mt-4 rounded-xl border border-mist bg-mist-soft px-4 py-3 text-[13.5px] leading-relaxed text-mist-deep">
          {signal.angle ? (
            <>
              <span className="font-medium">The angle for {brand.brandName || "you"}: </span>
              {signal.angle}
            </>
          ) : (
            signal.significance
          )}
        </div>
      ) : null}
      {!linked ? (
        <p className="mt-2 text-[12.5px] text-faint">This one came without a source link. Check it before you post.</p>
      ) : null}

      <section className="mt-6 border-t border-line pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-medium text-ink">Write it for</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ALL.map((p) => {
                const on = platforms.includes(p);
                const Icon = PLATFORM_META[p].icon;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p)}
                    className={cx(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-[transform,background-color,border-color] active:scale-[0.97] pointer-coarse:min-h-11",
                      on ? "border-ink bg-ink font-medium text-canvas" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
                    )}
                  >
                    <Icon size={14} />
                    {PLATFORM_META[p].label}
                    {drafts[p] ? <Check size={12} weight="bold" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <Button onClick={() => write(signal, unwritten.length ? unwritten : platforms, options)} loading={busy} disabled={busy}>
            {!busy ? <Lightning size={15} weight="fill" /> : null}
            {busy ? "Writing" : unwritten.length ? `Write ${unwritten.length === 1 ? "it" : `${unwritten.length} posts`}` : "Write again"}
          </Button>
        </div>

        {platforms.includes("email") ? (
          <div className="mt-3 max-w-[420px]">
            <Input
              value={personalise}
              onChange={(e) => setPersonalise(e.target.value)}
              placeholder="Newsletter merge fields, e.g. first name, city"
              aria-label="Newsletter merge fields"
              className="h-10"
            />
          </div>
        ) : null}

        {busy ? (
          <div className="mt-5 flex items-center gap-3" aria-live="polite">
            <Huesy mood="write" size={32} track={false} />
            <p className="text-[14px] text-ink">
              {writingCount === 1 ? "Writing your post" : `Writing ${writingCount} posts`} in {brand.brandName ? `${brand.brandName}’s` : "your"} voice…
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-4">
          {shown.map((p) => {
            const job = jobs[`${signal.id}:${p}`];
            const state = job?.state && job.state !== "done" ? job.state : drafts[p] ? "done" : "queued";
            return (
              <PostCard
                key={`${signal.id}:${p}`}
                signal={signal}
                platform={p}
                brand={brand}
                state={state}
                error={job?.error}
                errorCode={job?.code}
                onRetry={() => write(signal, [p], options)}
                onSave={({ text }) => onSavePost?.({ signal, platform: p, text, label: PLATFORM_META[p].label })}
              />
            );
          })}
          {!shown.length ? (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">
              Pick where it's going and press Write. Each post is written in your voice for that platform.
            </p>
          ) : null}
        </div>
      </section>
    </Sheet>
  );
}
