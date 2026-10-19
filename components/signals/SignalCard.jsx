"use client";

import { ArrowUpRight, BookmarkSimple, Check, PencilSimpleLine } from "@phosphor-icons/react";
import { Badge, Button, cx } from "../ui";
import { hasSourceLink, hostOf, relativeDay, resolveSignalUrl } from "../../lib/parse";

/**
 * One market signal: what happened, why it matters for this brand, and the
 * two things to do with it, write a post or save it. The headline opens the
 * signal in Huesy; the source link opens the original.
 */
export default function SignalCard({
  signal,
  brandName,
  isNew = false,
  saved = false,
  drafts = 0,
  onOpen,
  onWrite,
  onSave,
  selectable = false,
  selected = false,
  onSelect,
  preview = false,
  hideFit = false,
}) {
  const linked = hasSourceLink(signal);
  const url = resolveSignalUrl(signal);
  const host = linked ? hostOf(url) : "";
  const fit = Number(signal.fit) || 0;
  const angle = signal.angle || signal.significance;

  // In select mode the whole card is a label for a real checkbox, so it can
  // be picked with a pointer, the keyboard or a screen reader alike.
  const Root = selectable ? "label" : "article";

  return (
    <Root
      className={cx(
        "group relative flex h-full flex-col rounded-[20px] border bg-surface p-4 transition-[border-color,box-shadow,transform] duration-200 sm:p-5",
        selectable && "cursor-pointer active:scale-[0.99] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-accent-deep",
        selected ? "border-ink shadow-card ring-1 ring-ink" : "border-line hover:border-line-strong hover:shadow-card"
      )}
    >
      {selectable ? (
        <input
          type="checkbox"
          className="sr-only"
          checked={selected}
          onChange={() => onSelect?.(signal)}
          aria-label={`Select ${signal.headline}`}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-muted">
          {signal.type ? <Badge>{signal.type}</Badge> : null}
          {signal.brand ? <span className="font-medium text-ink">{signal.brand}</span> : null}
          <span>
            {[signal.source, relativeDay(signal.date)].filter(Boolean).join(" · ")}
          </span>
          {/* The same move seen in several places: every source, linked. */}
          {(signal.sources || []).length > 1 ? (
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              <span aria-hidden="true">·</span>
              <span>also on</span>
              {signal.sources.slice(1, 4).map((x, i) =>
                x.url ? (
                  <a key={i} href={x.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline decoration-line-strong underline-offset-2 hover:text-accent-deep">
                    {x.label}
                  </a>
                ) : (
                  <span key={i}>{x.label}</span>
                )
              )}
            </span>
          ) : null}
          {signal.sample ? <Badge tone="mist">Sample</Badge> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isNew ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-deep" aria-hidden="true" />
              New
            </span>
          ) : null}
          {selectable ? (
            <span
              className={cx(
                "flex h-6 w-6 items-center justify-center rounded-full border transition-colors",
                selected ? "border-ink bg-ink text-canvas" : "border-line-strong bg-raised"
              )}
              aria-hidden="true"
            >
              {selected ? <Check size={13} weight="bold" /> : null}
            </span>
          ) : fit >= 4 && !hideFit ? (
            <Badge tone="mist">{fit >= 5 ? "Top fit" : "Good fit"}</Badge>
          ) : null}
        </div>
      </div>

      <h3 className="font-display mt-3 text-[17.5px] leading-snug text-ink">
        {preview || selectable || !onOpen ? (
          signal.headline
        ) : (
          <button
            type="button"
            onClick={() => onOpen(signal)}
            className="text-left decoration-accent-line decoration-2 underline-offset-4 hover:underline"
          >
            {signal.headline}
          </button>
        )}
      </h3>

      {signal.summary ? (
        <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{signal.summary}</p>
      ) : null}

      {angle ? (
        <p className="mt-3 rounded-xl border border-mist bg-mist-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-mist-deep">
          {signal.angle && brandName ? <span className="font-medium">For {brandName}: </span> : null}
          {angle}
        </p>
      ) : null}

      {!preview && !selectable ? (
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-2 pt-4">
          {onWrite ? (
            <Button size="sm" variant="quiet" onClick={() => onWrite(signal)}>
              <PencilSimpleLine size={14} />
              {drafts ? "Open drafts" : "Write a post"}
            </Button>
          ) : null}
          {onSave ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSave(signal)}
              aria-pressed={saved}
              className={cx(saved && "text-accent-deep")}
            >
              <BookmarkSimple size={15} weight={saved ? "fill" : "regular"} />
              {saved ? "Saved" : "Save"}
            </Button>
          ) : null}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-full px-1.5 text-[12.5px] text-muted transition-colors hover:text-accent-deep"
            title={linked ? "Open the original" : "This signal came without a link. Search the news for it."}
          >
            {linked ? host || "Source" : "Find this story"}
            <ArrowUpRight size={12} weight="bold" />
          </a>
        </div>
      ) : null}

      {drafts && !selectable ? (
        <span className="absolute -top-2 left-5 rounded-full border border-line-strong bg-raised px-2 py-[1px] text-[10.5px] font-medium text-ink">
          {drafts} {drafts === 1 ? "draft" : "drafts"}
        </span>
      ) : null}
    </Root>
  );
}
