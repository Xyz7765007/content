"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DownloadSimple, Lightning, X } from "@phosphor-icons/react";
import AppShell from "../../components/shell/AppShell";
import PostCard, { PLATFORM_META } from "../../components/compose/PostCard";
import Huesy from "../../components/huesy/Huesy";
import { useSaving } from "../../components/signals/BoardPicker";
import { Badge, Button, Card, EmptyState, cx } from "../../components/ui";
import { useHydrated, useStore } from "../../lib/store";
import { isBusy, useWriting, write } from "../../lib/writer";
import { exportDraftsCSV, relativeDay } from "../../lib/parse";

const ALL = ["instagram", "linkedin", "twitter", "email"];

/**
 * Several signals, several platforms, one page. Platforms start from where
 * the brand publishes, the size of the run is said before it starts, and
 * every post appears under its signal as soon as it is written.
 */
export default function ComposePage() {
  const hydrated = useHydrated();
  const compose = useStore((s) => s.compose);
  const setCompose = useStore((s) => s.setCompose);
  const brand = useStore((s) => s.brand);
  const drafts = useStore((s) => s.drafts);
  const jobs = useWriting((s) => s.jobs);
  const { savePost, picker } = useSaving();

  const defaults = useMemo(() => {
    const active = (brand.activePlatforms || []).filter((p) => ALL.includes(p));
    return active.length ? active : ALL;
  }, [brand.activePlatforms]);
  const [platforms, setPlatforms] = useState(null);
  const chosen = platforms || defaults;
  const signals = compose.signals || [];
  const pieces = signals.length * chosen.length;
  const minutes = Math.max(1, Math.round((pieces * 18) / 3 / 60));
  const busy = signals.some((s) => isBusy(jobs, s.id, chosen));
  const started = signals.some((s) => chosen.some((p) => drafts?.[s.id]?.[p] || jobs[`${s.id}:${p}`]));

  if (!hydrated) {
    return (
      <AppShell title="Write posts">
        <div className="skeleton h-64 rounded-[20px]" />
      </AppShell>
    );
  }

  const back = compose.searchId ? { href: `/search/${compose.searchId}`, label: "Watchlist" } : { href: "/home", label: "Today" };

  if (!signals.length) {
    return (
      <AppShell title="Write posts" back={back}>
        <EmptyState
          mood="sleepy"
          title="No signals picked"
          body="Open a watchlist, choose Select several to write, and pick the ones worth a post."
          action={
            <Button as={Link} href="/search">
              Go to Watching
            </Button>
          }
        />
      </AppShell>
    );
  }

  const toggle = (p) =>
    setPlatforms((cur) => {
      const list = cur || defaults;
      return list.includes(p) ? (list.length > 1 ? list.filter((x) => x !== p) : list) : [...list, p];
    });

  const removeSignal = (id) => setCompose({ signals: signals.filter((s) => s.id !== id) });

  return (
    <AppShell
      title="Write posts"
      back={back}
      actions={
        started ? (
          <Button size="sm" variant="ghost" onClick={() => exportDraftsCSV(drafts, signals)}>
            <DownloadSimple size={15} />
            Export
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-6">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-[20px]">
                {signals.length} {signals.length === 1 ? "signal" : "signals"}, {chosen.length}{" "}
                {chosen.length === 1 ? "platform" : "platforms"}
              </h2>
              <p className="mt-1 flex items-center gap-2 text-[13.5px] text-muted" aria-live="polite">
                {busy ? <Huesy mood="write" size={24} track={false} /> : null}
                {busy
                  ? "Writing now. You can leave this page; the posts will be here."
                  : `${pieces} posts, about ${minutes} ${minutes === 1 ? "minute" : "minutes"}. You can leave this page while I write.`}
              </p>
            </div>
            <Button
              onClick={() => signals.forEach((s) => write(s, chosen.filter((p) => !drafts?.[s.id]?.[p])))}
              loading={busy}
              disabled={busy || signals.every((s) => chosen.every((p) => drafts?.[s.id]?.[p]))}
            >
              {!busy ? <Lightning size={15} weight="fill" /> : null}
              {busy ? "Writing" : signals.every((s) => chosen.every((p) => drafts?.[s.id]?.[p])) ? "All written" : started ? "Write the rest" : `Write ${pieces} posts`}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {ALL.map((p) => {
              const on = chosen.includes(p);
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
                </button>
              );
            })}
          </div>
        </Card>

        {signals.map((s) => {
          const shown = chosen.filter((p) => drafts?.[s.id]?.[p] || jobs[`${s.id}:${p}`]);
          return (
            <section key={s.id}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                    {s.type ? <Badge>{s.type}</Badge> : null}
                    {s.brand ? <span className="font-medium text-ink">{s.brand}</span> : null}
                    <span>{relativeDay(s.date)}</span>
                  </div>
                  <h3 className="font-display mt-1.5 text-[19px] leading-snug">{s.headline}</h3>
                </div>
                {!shown.length ? (
                  <Button size="sm" variant="ghost" onClick={() => removeSignal(s.id)} aria-label={`Remove ${s.headline}`}>
                    <X size={14} weight="bold" />
                    Remove
                  </Button>
                ) : null}
              </div>
              {shown.length ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {shown.map((p) => {
                    const job = jobs[`${s.id}:${p}`];
                    const state = job?.state && job.state !== "done" ? job.state : drafts?.[s.id]?.[p] ? "done" : "queued";
                    return (
                      <PostCard
                        key={`${s.id}:${p}`}
                        signal={s}
                        platform={p}
                        brand={brand}
                        state={state}
                        error={job?.error}
                errorCode={job?.code}
                        onRetry={() => write(s, [p])}
                        onSave={({ text }) => savePost({ signal: s, platform: p, text, label: PLATFORM_META[p].label })}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-[13px] text-muted">
                  Waiting for you to press Write.
                </p>
              )}
            </section>
          );
        })}
      </div>
      {picker}
    </AppShell>
  );
}
