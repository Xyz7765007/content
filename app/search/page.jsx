"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Binoculars, Lightning, PencilSimple, Plus, TrashSimple } from "@phosphor-icons/react";
import { AnimatePresence } from "motion/react";
import AppShell from "../../components/shell/AppShell";
import InsightsNav from "../../components/insights/InsightsNav";
import { CostTag } from "../../components/plan/PlanBits";
import { PRICES } from "../../lib/account";
import { Appear, Badge, Button, Card, EmptyState, IconButton, toast } from "../../components/ui";
import { useHydrated, useStore } from "../../lib/store";
import { isGlobal, normaliseRegions, researchPlatformById } from "../../lib/constants";
import { startRun, useRuns } from "../../lib/runner";
import { checkedLine, daysSince } from "../../lib/parse";

export default function WatchingPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const searches = useStore((s) => s.searches);
  const deleteSearch = useStore((s) => s.deleteSearch);
  const restoreSearch = useStore((s) => s.restoreSearch);
  const runs = useRuns((s) => s.runs);

  const remove = (s) => {
    const undo = deleteSearch(s.id);
    toast(`Deleted ${s.name}`, { action: { label: "Undo", onClick: () => restoreSearch(undo) } });
  };

  return (
    <AppShell
      title="Watchlists"
      actions={
        <Button as={Link} href="/search/new" size="sm">
          <Plus size={14} weight="bold" />
          New watchlist
        </Button>
      }
    >
      <InsightsNav />
      {!hydrated ? (
        <div className="space-y-3">
          <div className="skeleton h-28 rounded-[20px]" />
          <div className="skeleton h-28 rounded-[20px]" />
        </div>
      ) : !searches.length ? (
        <EmptyState
          mood="idle"
          title="Nothing on watch yet"
          body="A watchlist is a market or a set of brands I check for launches, collabs and campaigns. Make one and I'll start looking."
          action={
            <Button as={Link} href="/search/new">
              <Plus size={15} weight="bold" />
              Make a watchlist
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {searches.map((s, i) => {
              const regions = normaliseRegions(s.config?.researchLocations);
              const run = runs[s.id];
              const running = run?.phase === "running";
              const what =
                s.config?.targetMode === "accounts"
                  ? `${String(s.config?.accountList || "").split(/\n|,/).filter((a) => a.trim()).length} brands`
                  : s.config?.niche;
              const platforms = (s.config?.researchPlatforms || []).map((p) => researchPlatformById(p)?.label).filter(Boolean);
              const old = Boolean(s.lastRunAt) && daysSince(s.lastRunAt) > 7;
              return (
                <Appear key={s.id} index={i}>
                  <Card className="group flex flex-wrap items-center gap-4 p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-card sm:p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-[19px] text-ink">
                          <Link href={`/search/${s.id}`} className="decoration-accent-line decoration-2 underline-offset-4 hover:underline">
                            {s.name}
                          </Link>
                        </h2>
                        <Badge>
                          {(s.signals || []).length} {(s.signals || []).length === 1 ? "signal" : "signals"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[13px] text-muted">
                        {[what, platforms.join(", "), isGlobal(regions) ? "anywhere" : regions.join(", ")].filter(Boolean).join("; ")}
                      </p>
                      <p className={old ? "mt-1 text-[12.5px] text-accent-deep" : "mt-1 text-[12.5px] text-faint"}>
                        {running
                          ? `Checking now${run.signals?.length ? `, ${run.signals.length} found` : ""}`
                          : `${checkedLine(s.lastRunAt)}${old && s.lastRunAt ? ". Worth a fresh look." : ""}`}
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:flex-nowrap">
                      <Button size="sm" variant="quiet" onClick={() => startRun(s.id)} disabled={running} loading={running} className="max-sm:w-full">
                        {!running ? <Lightning size={14} weight="fill" /> : null}
                        {running ? "Checking" : "Check now"}
                        {!running ? <CostTag credits={PRICES.radar} /> : null}
                      </Button>
                      <Button as={Link} href={`/search/${s.id}`} size="sm" variant="quiet">
                        Open
                        <ArrowRight size={13} weight="bold" />
                      </Button>
                      <span className="ml-auto flex items-center sm:ml-0">
                        <IconButton label={`Edit ${s.name}`} onClick={() => router.push(`/search/new?edit=${s.id}`)}>
                          <PencilSimple size={16} />
                        </IconButton>
                        <IconButton label={`Delete ${s.name}`} onClick={() => remove(s)}>
                          <TrashSimple size={16} />
                        </IconButton>
                      </span>
                    </div>
                  </Card>
                </Appear>
              );
            })}
          </AnimatePresence>
          <p className="mt-2 flex items-center gap-2 text-[13px] text-faint">
            <Binoculars size={14} />
            Checking a watchlist runs a fresh search for {PRICES.radar} credits, given back if it finds nothing. New signals join the list, and the ones you have stay put.
          </p>
        </div>
      )}
    </AppShell>
  );
}
