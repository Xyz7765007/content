"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, CircleNotch, Warning } from "@phosphor-icons/react";
import { SPRING, cx } from "../ui";
import Huesy from "../huesy/Huesy";
import { formatLabel, hookLabel, platformLabel, sourceCta } from "../../lib/intel/taxonomy";
import { ago, compact, times } from "../../lib/when";

/* ------------------------------------------------------------------ steps --
   What Huesy is doing, line by line, as it does it.
----------------------------------------------------------------------------- */

export function Steps({ steps, live = false, className }) {
  const reduced = useReducedMotion();
  if (!steps?.length) return null;
  return (
    <ol className={cx("flex flex-col gap-1.5", className)} aria-live={live ? "polite" : undefined}>
      <AnimatePresence initial={false}>
        {steps.map((s) => (
          <motion.li
            key={s.id}
            layout={reduced ? false : "position"}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="flex items-start gap-2.5 text-[13.5px] leading-snug"
          >
            <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center">
              {s.status === "running" && live ? (
                <CircleNotch size={14} weight="bold" className="animate-spin text-accent-deep" aria-hidden="true" />
              ) : s.status === "error" ? (
                <Warning size={14} weight="fill" className="text-faint" aria-hidden="true" />
              ) : (
                <Check size={13} weight="bold" className="text-accent-deep" aria-hidden="true" />
              )}
            </span>
            <span className={cx(s.status === "running" && live ? "text-ink" : "text-muted")}>{s.label}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}

// Folds a step event into a list, replacing a step with the same id.
export const withStep = (steps, step) => {
  const i = steps.findIndex((s) => s.id === step.id);
  if (i < 0) return [...steps, { id: step.id, label: step.label, status: step.status }];
  const next = [...steps];
  next[i] = { id: step.id, label: step.label, status: step.status };
  return next;
};

/* ------------------------------------------------------------ source link --
   Where something came from, as a link that says where it goes: "View on
   Instagram", "Read on Reddit", "Read on The Economic Times". Every piece of
   intel carries one.
----------------------------------------------------------------------------- */

export function SourceLink({ url, platform, source, label, pill = false, className }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cx(
        "inline-flex items-center gap-1 font-medium text-accent-deep",
        pill ? "min-h-8 rounded-full border border-accent-line px-3 text-[12.5px] transition-colors hover:bg-accent-soft" : "text-[12.5px] hover:underline",
        className
      )}
    >
      {label || sourceCta({ url, platform, source })}
      <ArrowUpRight size={pill ? 12 : 11} weight="bold" aria-hidden="true" />
    </a>
  );
}

// Several sources for one thing: the first one named, the rest numbered.
export function SourceLinks({ items, className }) {
  const list = (items || []).filter((x) => x?.url).slice(0, 4);
  if (!list.length) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {list.map((x, i) => (
        <SourceLink key={x.url} url={x.url} platform={x.platform} source={x.source} label={i === 0 ? null : `${i + 1}`} />
      ))}
    </div>
  );
}

// News stories, two columns on wide screens, each saying where it reads.
export function NewsList({ items, className }) {
  const list = (items || []).filter((n) => n?.url && n.title);
  if (!list.length) return null;
  return (
    <ul className={cx("grid gap-x-8 gap-y-3 md:grid-cols-2", className)}>
      {list.map((n) => (
        <li key={n.url} className="min-w-0 text-[14px] leading-snug">
          <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {n.title}
          </a>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            <SourceLink url={n.url} source={n.source} />
            {n.date ? <span>{n.date}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- evidence --
   A real post behind a claim: who, what, how it did, and a link to it.
----------------------------------------------------------------------------- */

export function EvidencePost({ post, className }) {
  const [thumb, setThumb] = useState(Boolean(post.thumbnail));
  const lift = post.beat ?? post.lift ?? post.strength;
  const liftWord = post.beat != null ? "their normal" : "a typical post";
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "group flex w-[248px] shrink-0 flex-col overflow-hidden rounded-[18px] border border-line bg-surface transition-[transform,border-color] hover:border-line-strong active:scale-[0.98]",
        className
      )}
    >
      {thumb ? (
        <span className="relative block aspect-[4/3] overflow-hidden bg-sunken">
          {/* Platform thumbnails expire; a broken one quietly disappears. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setThumb(false)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        </span>
      ) : null}
      <span className="flex flex-1 flex-col gap-2 p-3.5">
        <span className="flex items-center justify-between gap-2 text-[12px] text-muted">
          <span className="truncate">
            {platformLabel(post.platform)} {post.format ? formatLabel(post.format).replace(/s$/, "").toLowerCase() : "post"}
            {post.handle ? <> by <span className="text-ink">@{post.handle}</span></> : null}
          </span>
          <ArrowUpRight size={13} className="shrink-0 text-faint transition-colors group-hover:text-ink" aria-hidden="true" />
        </span>
        {post.caption ? <span className="line-clamp-3 text-[13.5px] leading-snug text-ink/85">{post.caption}</span> : null}
        <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[12px] text-muted">
          {lift != null && lift > 0 ? (
            <span className="font-medium text-accent-deep">
              {times(lift)} {liftWord}
            </span>
          ) : null}
          {post.views != null ? <span className="tabular">{compact(post.views)} views</span> : post.likes != null ? <span className="tabular">{compact(post.likes)} likes</span> : null}
          {post.hook ? <span>{hookLabel(post.hook)}</span> : null}
        </span>
        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-deep group-hover:underline">
          {sourceCta({ platform: post.platform, url: post.url })}
          <ArrowUpRight size={11} weight="bold" aria-hidden="true" />
        </span>
      </span>
    </a>
  );
}

export function EvidenceStrip({ posts, title = "Posts behind this", className }) {
  if (!posts?.length) return null;
  return (
    <section className={className}>
      <h4 className="mb-2.5 text-[12.5px] font-medium text-muted">{title}</h4>
      <div className="no-scrollbar -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
        {posts.map((p, i) => (
          <EvidencePost key={p.url || i} post={p} className="snap-start" />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ proof --
   How strong the evidence behind a piece of content is, and what it is.
----------------------------------------------------------------------------- */

const PROOF_TONE = {
  Strong: "border-accent-line bg-accent-soft text-accent-deep",
  Good: "border-mist bg-mist-soft text-mist-deep",
  Thin: "border-line bg-sunken text-muted",
};

export function ProofBadge({ proof, className }) {
  if (!proof) return null;
  return (
    <span className={cx("tabular inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11.5px] font-medium", PROOF_TONE[proof.label] || PROOF_TONE.Thin, className)}>
      {proof.label} proof
      <span className="opacity-70">{proof.score}/100</span>
    </span>
  );
}

export function ProofCard({ pack, className }) {
  const [open, setOpen] = useState(false);
  if (!pack?.proof) return null;
  const p = pack.pattern;
  const researched = pack.research?.ran;
  return (
    <div className={cx("rounded-[20px] border border-line bg-surface p-4 sm:p-5", className)}>
      <div className="flex items-start gap-3.5">
        <ProofRing score={pack.proof.score} label={pack.proof.label} />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] text-muted">
            {!p
              ? "General best practice for now"
              : p.chosen
                ? "Built on the insight you picked"
                : researched && pack.research?.found
                  ? "Built on posts I just checked"
                  : researched
                    ? "Fresh posts didn't turn up, so this is built on what I already know"
                    : "Built on what I already know"}
          </p>
          <p className="mt-0.5 text-[15px] font-medium leading-snug text-ink">
            {p
              ? `${p.hookLabel} openings${p.formatLabel ? ` in ${p.formatLabel.toLowerCase()}` : ""} reach about ${times(p.strength)} a typical post on ${pack.borrowedFrom ? `${platformLabel(pack.borrowedFrom)}, the closest platform measured` : pack.platformLabel}.`
              : `Not enough recent ${pack.platformLabel} posts in your niche yet, so this follows general best practice.`}
          </p>
          {p ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{pack.proof.reasons.join(", ")}</p> : <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">Ask about your niche or run a playbook, and the next one will be built on measured posts.</p>}
        </div>
      </div>
      {pack.needs?.length || pack.examples?.length ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-3 text-[12.5px] font-medium text-accent-deep underline decoration-accent-line underline-offset-2"
        >
          {open ? "Hide the evidence" : "See the evidence"}
        </button>
      ) : null}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
            <div className="flex flex-col gap-4 pt-4">
              {pack.needs?.length ? (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {pack.needs.map((n) => (
                    <li key={n.kind} className="flex items-center gap-2 text-[13px]">
                      <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", n.status === "covered" ? "bg-accent-deep" : n.status === "missing" ? "bg-line-strong" : "bg-mist-deep")} aria-hidden="true" />
                      <span className="text-ink">{n.label}</span>
                      <span className="text-muted">
                        {n.status === "covered" ? (n.age != null ? `checked ${n.age ? `${n.age}d ago` : "today"}` : "known") : n.status === "missing" ? "not enough yet" : n.status === "stale" ? "out of date" : "thin"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {pack.examples?.length ? <EvidenceStrip posts={pack.examples} title="Standout posts it learned from" /> : null}
              {pack.sounds?.length ? (
                <p className="text-[13px] text-muted">
                  Sounds moving now: {pack.sounds.slice(0, 3).map((s) => `"${s.title}"${s.commercial === false ? " (not for brand accounts)" : ""}`).join(", ")}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ProofRing({ score = 0, label }) {
  const reduced = useReducedMotion();
  const r = 19;
  const c = 2 * Math.PI * r;
  const tone = label === "Strong" ? "var(--c-accent-deep)" : label === "Good" ? "var(--c-mist-deep)" : "var(--c-faint)";
  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center" role="img" aria-label={`${label} proof, ${score} out of 100`}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--c-sunken)" strokeWidth="4" />
        <motion.circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduced ? c * (1 - score / 100) : c }}
          animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ type: "spring", bounce: 0, duration: 1 }}
        />
      </svg>
      <span className="font-display tabular text-[15px]">{score}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ chart --
   Reach by group, as plain horizontal bars with the sample size beside each.
----------------------------------------------------------------------------- */

export function BarChart({ title, data, unit = "x", note, className }) {
  const reduced = useReducedMotion();
  const rows = (data || []).filter((d) => d.value != null && d.value > 0);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((d) => d.value));
  return (
    <figure className={cx("rounded-[20px] border border-line bg-surface p-4 sm:p-5", className)}>
      <figcaption className="mb-3.5">
        <span className="text-[14px] font-medium text-ink">{title}</span>
        {note ? <span className="mt-0.5 block text-[12px] text-muted">{note}</span> : null}
      </figcaption>
      <ul className="flex flex-col gap-2.5">
        {rows.map((d, i) => (
          <li key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px] max-sm:grid-cols-[minmax(0,7rem)_1fr_auto]">
            <span className="truncate text-ink/85" title={d.label}>
              {d.label}
            </span>
            <span className="h-2 overflow-hidden rounded-full" aria-hidden="true">
              <motion.span
                className={cx("block h-full rounded-full", i === 0 ? "bg-accent-deep" : "bg-accent")}
                initial={reduced ? { width: `${(d.value / max) * 100}%` } : { width: 0 }}
                whileInView={{ width: `${Math.max(4, (d.value / max) * 100)}%` }}
                viewport={{ once: true }}
                transition={{ type: "spring", bounce: 0, duration: 0.8, delay: reduced ? 0 : i * 0.05 }}
              />
            </span>
            <span className="tabular whitespace-nowrap text-right text-muted">
              <span className="font-medium text-ink">
                {unit === "x" ? times(d.value) : compact(d.value)}
                {unit === "/wk" ? "/wk" : ""}
              </span>
              {d.n != null && unit === "x" ? <span className="ml-1.5 text-[11.5px]">n={d.n}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ---------------------------------------------------------------- finding --
   One fact Huesy learned, with how fresh and how sure it is.
----------------------------------------------------------------------------- */

const KIND_LABEL = {
  format: "Format",
  hook: "Opening",
  length: "Length",
  sound: "Sounds",
  hashtag: "Hashtags",
  examples: "Standouts",
  trend: "Rising",
  interest: "Search interest",
  competitor: "Competitor",
  audience: "Audience",
};

export const findingKindLabel = (k) => KIND_LABEL[k] || "Finding";

export function FindingCard({ finding, actions, className }) {
  const days = finding.fetched_at ? Math.floor((Date.now() - new Date(finding.fetched_at).getTime()) / 86400000) : null;
  const stale = days != null && days > 21;
  return (
    <article className={cx("flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4", className)}>
      <div className="flex items-center justify-between gap-3 text-[12px] text-muted">
        <span className="flex items-center gap-2">
          <span className="font-medium text-ink">{findingKindLabel(finding.kind)}</span>
          <span>{finding.platform === "google" ? "Google" : platformLabel(finding.platform)}</span>
        </span>
        <span className={cx(stale && "text-faint")}>{finding.fetched_at ? ago(finding.fetched_at) : ""}</span>
      </div>
      <p className="text-[14.5px] leading-snug text-ink">{finding.statement}</p>
      {(finding.evidence || []).some((e) => e?.url) ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span>Seen in</span>
          <SourceLinks items={finding.evidence} />
        </div>
      ) : null}
      {actions ? <div className="mt-auto flex flex-wrap gap-2 pt-1">{actions}</div> : null}
    </article>
  );
}

// Huesy at work, for loading moments that take a while.
export function Working({ title, steps, className }) {
  return (
    <div className={cx("rounded-[20px] border border-accent-line bg-accent-soft/50 p-4 sm:p-5", className)} aria-live="polite">
      <div className="flex items-center gap-3">
        <Huesy mood="watch" size={36} track={false} />
        <p className="text-[15px] font-medium text-ink">{title}</p>
      </div>
      {steps?.length ? <Steps steps={steps} live className="mt-3.5 pl-1" /> : null}
    </div>
  );
}
