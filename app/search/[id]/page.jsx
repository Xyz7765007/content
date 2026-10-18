"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CheckSquare, DownloadSimple, Lightning, PencilSimple, Plus, X } from "@phosphor-icons/react";
import AppShell from "../../../components/shell/AppShell";
import SignalCard from "../../../components/signals/SignalCard";
import SignalToolbar, { applySignalFilters } from "../../../components/signals/SignalToolbar";
import RunPanel from "../../../components/signals/RunPanel";
import { useSignalActions } from "../../../components/signals/useSignalActions";
import { Appear, Button, EmptyState, SPRING, SignalSkeleton, toast } from "../../../components/ui";
import { useHydrated, useStore } from "../../../lib/store";
import { startRun, useRuns } from "../../../lib/runner";
import { checkedLine, exportSignalsCSV } from "../../../lib/parse";

const BATCH_CAP = 10;

export default function WatchlistPage() {
  const { id } = useParams();
  const router = useRouter();
  const hydrated = useHydrated();
  const search = useStore((s) => s.searches.find((x) => x.id === id));
  const brand = useStore((s) => s.brand);
  const setCompose = useStore((s) => s.setCompose);
  const run = useRuns((s) => s.runs[id]);
  const actions = useSignalActions();

  const [filters, setFilters] = useState({ sort: "fit" });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState({});

  const signals = search?.signals || [];
  // While a run is live, its finds show at the top before they are folded in.
  const liveOnly = useMemo(() => {
    if (run?.phase !== "running") return [];
    const known = new Set(signals.map((s) => s.headline.toLowerCase()));
    return (run.signals || []).filter((s) => !known.has(s.headline.toLowerCase())).map((s) => ({ ...s, live: true }));
  }, [run, signals]);
  const shown = useMemo(
    () => applySignalFilters([...liveOnly, ...signals], filters, actions.savedIds),
    [liveOnly, signals, filters, actions.savedIds]
  );
  const picked = signals.filter((s) => selected[s.id]);
  const running = run?.phase === "running";
  const freshCutoff = run?.startedAt || 0;

  if (!hydrated) {
    return (
      <AppShell title="Watchlist" back={{ href: "/search", label: "Watching" }}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SignalSkeleton />
          <SignalSkeleton />
          <SignalSkeleton />
        </div>
      </AppShell>
    );
  }

  if (!search) {
    return (
      <AppShell title="Watchlist" back={{ href: "/search", label: "Watching" }}>
        <EmptyState
          mood="oops"
          title="I can’t find that watchlist"
          body="It may have been deleted, or it lives in another account."
          action={
            <Button as={Link} href="/search">
              Back to Watching
            </Button>
          }
        />
      </AppShell>
    );
  }

  const toggle = (signal) => {
    if (!selected[signal.id] && Object.keys(selected).length >= BATCH_CAP) {
      toast(`Up to ${BATCH_CAP} at a time. Write these, then pick more.`);
      return;
    }
    setSelected((cur) => {
      const next = { ...cur };
      if (next[signal.id]) delete next[signal.id];
      else next[signal.id] = true;
      return next;
    });
  };

  const writeBatch = () => {
    setCompose({ searchId: id, signals: picked, selectedPlatforms: [] });
    router.push("/compose");
  };

  return (
    <AppShell
      title={search.name}
      docTitle={search.name}
      back={{ href: "/search", label: "Watching" }}
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            className="hidden sm:inline-flex"
            onClick={() => router.push(`/search/new?edit=${id}`)}
          >
            <PencilSimple size={14} />
            Edit
          </Button>
          <Button size="sm" onClick={() => startRun(id)} disabled={running} loading={running}>
            {!running ? <Lightning size={14} weight="fill" /> : null}
            {running ? "Checking" : "Check now"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6 pb-32">
        <p className="-mt-1 text-[13.5px] text-muted">
          {running ? "Checking now." : `${checkedLine(search.lastRunAt)}.`} {signals.length} {signals.length === 1 ? "signal" : "signals"} so far
          {search.runs > 1 ? ` from ${search.runs} checks` : ""}.
        </p>

        <AnimatePresence initial={false}>{run ? <RunPanel key="run" searchId={id} /> : null}</AnimatePresence>

        {signals.length || liveOnly.length ? (
          <>
            <SignalToolbar
              filters={filters}
              onChange={setFilters}
              signals={[...liveOnly, ...signals]}
              savedIds={actions.savedIds}
              count={shown.length}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                size="sm"
                variant={selecting ? "quiet" : "ghost"}
                onClick={() => {
                  setSelecting((v) => !v);
                  setSelected({});
                }}
              >
                {selecting ? <X size={14} weight="bold" /> : <CheckSquare size={15} />}
                {selecting ? "Done selecting" : "Select several to write"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => exportSignalsCSV(shown.filter((s) => !s.live), `${search.name.replace(/\W+/g, "_")}_signals.csv`)}
              >
                <DownloadSimple size={15} />
                Export CSV
              </Button>
            </div>
            {shown.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence initial={false}>
                  {shown.map((s, i) => (
                    <Appear key={s.id} index={s.live ? 0 : i}>
                      <SignalCard
                        signal={s}
                        brandName={brand.brandName}
                        isNew={s.live || (freshCutoff && (s.fetchedAt || 0) >= freshCutoff)}
                        saved={actions.savedIds.has(s.id)}
                        drafts={actions.draftCount(s)}
                        onOpen={s.live ? undefined : actions.openSignal}
                        onWrite={s.live ? undefined : actions.writeSignal}
                        onSave={s.live ? undefined : actions.toggleSignal}
                        selectable={selecting && !s.live}
                        selected={Boolean(selected[s.id])}
                        onSelect={toggle}
                      />
                    </Appear>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <EmptyState
                mood="oops"
                title="Nothing matches that"
                body="Try fewer words, or clear the filters."
                action={
                  <Button variant="quiet" onClick={() => setFilters({ sort: filters.sort })}>
                    Clear filters
                  </Button>
                }
              />
            )}
          </>
        ) : !run ? (
          <EmptyState
            mood="sleepy"
            title="Nothing here yet"
            body="Check now and I'll look across Google News, Instagram and X."
            action={
              <Button onClick={() => startRun(id)}>
                <Lightning size={15} weight="fill" />
                Check now
              </Button>
            }
          />
        ) : null}
      </div>

      <AnimatePresence>
        {selecting ? (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={SPRING}
            className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-30 px-4 lg:bottom-5 lg:left-[232px] lg:px-8"
          >
            <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-between gap-3 rounded-[20px] border border-line-strong bg-surface p-3 pl-4 shadow-float">
              <p className="text-[13.5px] text-ink">
                <span className="font-medium tabular">{picked.length}</span> selected
                <span className="text-muted"> · up to {BATCH_CAP} at a time</span>
              </p>
              <Button onClick={writeBatch} disabled={!picked.length}>
                Write posts for {picked.length || "them"}
                <ArrowRight size={15} weight="bold" />
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {actions.ui}
    </AppShell>
  );
}
