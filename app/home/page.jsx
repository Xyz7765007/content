"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowRight, Binoculars, Lightning, Plus } from "@phosphor-icons/react";
import AppShell from "../../components/shell/AppShell";
import SignalCard from "../../components/signals/SignalCard";
import SignalToolbar, { applySignalFilters } from "../../components/signals/SignalToolbar";
import RunPanel from "../../components/signals/RunPanel";
import { useSignalActions } from "../../components/signals/useSignalActions";
import Huesy from "../../components/huesy/Huesy";
import { Appear, Button, Card, EmptyState, SignalSkeleton } from "../../components/ui";
import { collectSignals, useHydrated, useStore } from "../../lib/store";
import { checkAll, startRun, useRuns } from "../../lib/runner";
import { checkedLine, daysSince } from "../../lib/parse";
import { SAMPLE_SIGNALS } from "../../lib/sample";
import { useAccountData, PRICES } from "../../lib/account";
import { CostTag } from "../../components/plan/PlanBits";
import { NewReportSheet } from "../../components/insights/NewReport";
import { Briefing, Continue, FirstPlaybook, PlanNotice, QuickActions } from "../../components/today/TodayBits";

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
};

export default function TodayPage() {
  const hydrated = useHydrated();
  const searches = useStore((s) => s.searches);
  const brand = useStore((s) => s.brand);
  const onboarded = useStore((s) => s.onboarded);
  const seenAt = useStore((s) => s.seenAt);
  const markSeen = useStore((s) => s.markSeen);
  const runs = useRuns((s) => s.runs);
  const actions = useSignalActions();
  const targets = useStore((s) => s.targets);
  const [filters, setFilters] = useState({ sort: "fit" });
  const { account } = useAccountData();
  const [report, setReport] = useState(null);

  // "New" means new since the last visit, fixed for this visit, and the visit
  // is marked seen on the way out.
  const openedAt = useRef(null);
  if (hydrated && openedAt.current === null) openedAt.current = seenAt || 0;
  useEffect(() => {
    if (!hydrated) return undefined;
    const leave = () => markSeen();
    const onHide = () => document.visibilityState === "hidden" && leave();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      leave();
    };
  }, [hydrated, markSeen]);

  const kept = useMemo(() => collectSignals(searches), [searches]);
  // Signals a running check has found but not yet filed show straight away.
  const live = useMemo(() => {
    const known = new Set(kept.map((s) => s.headline.toLowerCase()));
    return Object.values(runs)
      .filter((r) => r.phase === "running")
      .flatMap((r) => r.signals || [])
      .filter((s) => !known.has(s.headline.toLowerCase()))
      .map((s) => ({ ...s, live: true }));
  }, [runs, kept]);
  const all = useMemo(() => [...live, ...kept], [live, kept]);
  const best = useMemo(
    () => applySignalFilters(kept.filter((s) => (Number(s.fit) || 0) >= 4), { sort: "fit" }).slice(0, 3),
    [kept]
  );
  const bestIds = useMemo(() => new Set(best.map((s) => s.id)), [best]);
  // The list below the best three holds everything else, so its counts and
  // filters describe what is actually in it.
  const rest = useMemo(() => all.filter((s) => !bestIds.has(s.id)), [all, bestIds]);
  const filtered = useMemo(() => applySignalFilters(rest, filters, actions.savedIds), [rest, filters, actions.savedIds]);
  const isNew = (s) => openedAt.current !== null && (s.fetchedAt || 0) > openedAt.current;
  const newCount = all.filter(isNew).length;

  const running = Object.values(runs).find((r) => r.phase === "running");
  const lastRun = searches.reduce((m, s) => Math.max(m, s.lastRunAt || 0), 0);
  const recentRun = Object.values(runs).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];
  const stale = searches.length > 0 && daysSince(lastRun) > 1;

  // Check now runs every watchlist not checked in the last hour, or the
  // newest one, so the price says how many that is.
  const toCheck = Math.max(1, searches.filter((x) => Date.now() - (x.lastRunAt || 0) > 3600000).length);
  const checkButton = searches.length && account?.plan ? (
    <Button size="sm" onClick={() => checkAll()} disabled={Boolean(running)} loading={Boolean(running)}>
      {!running ? <Lightning size={14} weight="fill" /> : null}
      {running ? "Checking" : toCheck > 1 ? `Check ${toCheck} watchlists` : "Check watchlists"}
      {!running ? <CostTag credits={PRICES.radar * toCheck} /> : null}
    </Button>
  ) : null;
  const panelRun = recentRun && recentRun.phase !== "done" ? recentRun : null;

  return (
    <AppShell title="Today">
      {!hydrated ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SignalSkeleton />
          <SignalSkeleton />
          <SignalSkeleton />
        </div>
      ) : !onboarded ? (
        <Welcome />
      ) : (
        <div className="flex flex-col gap-9">
          <section className="flex items-center gap-4">
            {/* The first-playbook card below has its own Huesy, and one speaks at a time. */}
            {!panelRun && !(account?.plan && account.welcomeReport) ? <Huesy mood={newCount ? "found" : "idle"} size={52} /> : null}
            <div className="min-w-0">
              <h2 className="display-lg text-[26px] sm:text-[30px]">
                {greet()}
                {brand.brandName ? `, ${brand.brandName}` : ""}.
              </h2>
              <p className="mt-1 text-[14.5px] text-muted">{todayLine({ account, running, newCount, lastRun, searches })}</p>
            </div>
          </section>

          <PlanNotice account={account} />
          {account?.plan && account.welcomeReport ? <FirstPlaybook platform={brand.intel?.platforms?.[0]} onRun={() => setReport("playbook")} /> : null}
          {account?.plan ? <Briefing brand={brand} targets={targets} studio={account.studio} /> : null}
          {account?.plan ? <Continue account={account} /> : null}
          {account?.plan ? <QuickActions account={account} onReport={() => setReport("trends")} /> : null}

          <FinishBrand brand={brand} />

          {!searches.length ? (
            <FirstWatch />
          ) : (
          <>
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-[22px]">From your watchlists</h2>
              {checkButton}
            </div>
            <p className="text-[13.5px] text-muted">
              {running ? "I'm checking now. New signals appear below as I find them." : `${checkedLine(lastRun)}.`}
              {stale && !running && account?.plan ? (
                <>
                  {" "}
                  <button type="button" onClick={() => checkAll()} className="font-medium text-accent-deep underline decoration-accent-line underline-offset-2">
                    Check again
                  </button>
                </>
              ) : null}
            </p>
          </section>

          <AnimatePresence initial={false}>
            {panelRun ? <RunPanel key={panelRun.searchId} searchId={panelRun.searchId} /> : null}
          </AnimatePresence>

          {best.length ? (
            <section>
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h3 className="font-display text-[19px]">Best for {brand.brandName || "you"}</h3>
                <span className="meta hidden sm:inline">Ranked for your brand</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {best.map((s, i) => (
                  <Appear key={s.id} index={i}>
                    <SignalCard
                      signal={s}
                      brandName={brand.brandName}
                      isNew={isNew(s)}
                      saved={actions.savedIds.has(s.id)}
                      drafts={actions.draftCount(s)}
                      onOpen={actions.openSignal}
                      onWrite={actions.writeSignal}
                      onSave={actions.toggleSignal}
                      hideFit
                    />
                  </Appear>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="font-display mb-4 text-[19px]">{best.length ? "Everything else" : "Everything you’re watching"}</h3>
            <SignalToolbar
              filters={filters}
              onChange={setFilters}
              signals={rest}
              savedIds={actions.savedIds}
              count={filtered.length}
              placeholder="Search every signal"
            />
            {filtered.length === 0 && running && !all.length ? (
              <div className="mt-5">
                <p className="mb-4 text-[13.5px] text-muted">Signals land here as I find them.</p>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <SignalSkeleton />
                  <SignalSkeleton />
                  <SignalSkeleton />
                </div>
              </div>
            ) : filtered.length === 0 && !(filters.query || filters.type || filters.source || filters.savedOnly) && best.length ? (
              <p className="mt-5 text-[13.5px] text-muted">That's everything so far. The best are just above.</p>
            ) : filtered.length === 0 ? (
              <EmptyState
                className="mt-6"
                mood={all.length ? "oops" : "sleepy"}
                title={all.length ? "Nothing matches that" : "Nothing found yet"}
                body={
                  all.length
                    ? "Try fewer words, or clear the filters."
                    : "Your watchlists haven't turned anything up yet. Check again, or widen what you watch."
                }
                action={
                  all.length ? (
                    <Button variant="quiet" onClick={() => setFilters({ sort: filters.sort })}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button as={Link} href="/search" variant="quiet">
                      Open watchlists
                    </Button>
                  )
                }
              />
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence initial={false}>
                  {filtered.map((s, i) => (
                    <Appear key={s.id} index={s.live ? 0 : i}>
                      <SignalCard
                        signal={s}
                        brandName={brand.brandName}
                        isNew={s.live || isNew(s)}
                        saved={actions.savedIds.has(s.id)}
                        drafts={actions.draftCount(s)}
                        onOpen={s.live ? undefined : actions.openSignal}
                        onWrite={s.live ? undefined : actions.writeSignal}
                        onSave={s.live ? undefined : actions.toggleSignal}
                      />
                    </Appear>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
          </>
          )}
        </div>
      )}
      {actions.ui}
      <NewReportSheet kind={report} onClose={() => setReport(null)} />
    </AppShell>
  );
}

// One line under the greeting: what changed, in plain words.
function todayLine({ account, running, newCount, lastRun, searches }) {
  if (running) return "I'm checking your watchlists now.";
  const parts = [];
  if (account?.plan) parts.push(`${(account.credits ?? 0).toLocaleString("en-US")} credits left this month`);
  if (account?.allowances) {
    const a = account.allowances;
    parts.push(`${a.creative.left} creatives, ${a.carousel.left} carousels and ${a.reel.left} reels to make`);
  }
  if (newCount) parts.push(`${newCount} new signals since your last visit`);
  if (!parts.length) return searches.length ? `${checkedLine(lastRun)}.` : "Here's where everything starts.";
  return `${parts.join(". ")}.`;
}

function Welcome() {
  return (
    <div className="flex flex-col gap-8">
      <Card className="aurora grain relative overflow-hidden p-7 sm:p-10">
        <Huesy mood="idle" size={72} />
        <h2 className="display-lg mt-5 max-w-[22ch] text-[28px] sm:text-[34px]">Hi, I’m Huesy.</h2>
        <p className="mt-3 max-w-[56ch] text-[15.5px] leading-relaxed text-muted">
          I read what's working in your market right now: the trends, the openings, the competitors and what your
          audience asks. Then I help you make content built on it. Tell me about your brand first; it takes about a
          minute.
        </p>
        <Button as={Link} href="/onboarding" size="lg" className="mt-7">
          Set up my brand
          <ArrowRight size={16} weight="bold" />
        </Button>
      </Card>

      <section>
        <h2 className="font-display mb-1 text-[20px]">Brand moves, too</h2>
        <p className="mb-4 text-[13.5px] text-muted">Watchlists bring back launches and collabs worth posting about. These are samples from invented brands.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SAMPLE_SIGNALS.map((s) => (
            <SignalCard key={s.id} signal={s} preview />
          ))}
        </div>
      </section>
    </div>
  );
}

// Set up, but nothing watched yet: one tap starts watching what setup
// already captured.
function FirstWatch() {
  const router = useRouter();
  const targets = useStore((s) => s.targets);
  const draft = useStore((s) => s.draft);
  const saveSearch = useStore((s) => s.saveSearch);
  const { account } = useAccountData();
  const what =
    targets.targetMode === "accounts"
      ? `${String(targets.accountList || "").split(/\n|,/).filter((a) => a.trim()).length} brands`
      : targets.niche;

  const start = () => {
    const name = targets.targetMode === "accounts" ? "Brands I watch" : targets.niche || "My market";
    const id = saveSearch({ ...draft, ...targets, name }, []);
    startRun(id);
    router.push(`/search/${id}`);
  };

  return (
    <section className="flex flex-col gap-4 rounded-[24px] border border-dashed border-line-strong bg-surface p-5 sm:flex-row sm:items-center sm:p-6">
      <Huesy mood="idle" size={44} />
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[19px] leading-snug">{what ? `Shall I watch ${what} for brand moves?` : "Watch your market for brand moves"}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
          A watchlist checks Google News, Instagram and X for launches, collabs and campaigns worth posting about, ranked for your brand.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {what && account?.plan ? (
          <Button onClick={start} size="sm">
            <Binoculars size={15} />
            Start watching
            <CostTag credits={PRICES.radar} />
          </Button>
        ) : null}
        <Button as={Link} href="/search/new" size="sm" variant="quiet">
          <Plus size={14} weight="bold" />
          {what && account?.plan ? "Something else" : "Set up a watchlist"}
        </Button>
      </div>
    </section>
  );
}

// Until the brand has a voice and an audience, posts are generic. A quiet
// card says so, and goes away once they are there.
function FinishBrand({ brand }) {
  const missing = [
    !brand.brandPersona?.trim() && "your voice",
    !brand.targetAudience?.trim() && "your audience",
    !(brand.activePlatforms || []).length && "where you post",
  ].filter(Boolean);
  if (!missing.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-mist bg-mist-soft px-5 py-4">
      <p className="min-w-0 flex-1 text-[14px] text-mist-deep">
        Posts will sound more like you once I know {missing.join(" and ")}.
      </p>
      <Button as={Link} href="/profile" size="sm" variant="quiet">
        Finish your brand
      </Button>
    </div>
  );
}
