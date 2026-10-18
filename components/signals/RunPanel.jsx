"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { Button, IconButton, Progress, SPRING, cx } from "../ui";
import Huesy from "../huesy/Huesy";
import { clearRun, startRun, stopRun, useRuns } from "../../lib/runner";
import { useStore } from "../../lib/store";

/**
 * What a search is doing, while it does it: the searches it runs, the sites
 * it reads, and a count of what it has found. Afterwards it says how it went
 * in one sentence, with the one next step that makes sense.
 */
export default function RunPanel({ searchId, className }) {
  const reduced = useReducedMotion();
  const run = useRuns((s) => s.runs[searchId]);
  const search = useStore((s) => s.searches.find((x) => x.id === searchId));
  const updateSearch = useStore((s) => s.updateSearch);

  if (!run) return null;

  const lastQuery = run.queries?.[run.queries.length - 1];
  const found = run.signals?.length || 0;
  const days = search?.config?.lookbackDays || 7;

  const body = (() => {
    if (run.phase === "running") {
      return {
        mood: "watch",
        title: found ? `Found ${found} so far` : run.status || "Planning where to look",
        sub: lastQuery ? `Searching: ${lastQuery}` : "Looking across Google News, Instagram and X",
      };
    }
    if (run.phase === "done") {
      return {
        mood: "found",
        title: run.added ? `${run.added} new, best fits first` : "Nothing new since the last check",
        sub: run.added ? "They're in the list below, marked New." : "Everything I found you already have.",
      };
    }
    if (run.phase === "empty") {
      return {
        mood: "sleepy",
        title: `Nothing in the last ${days} days`,
        sub: days < 30 ? "It's a quiet stretch. A wider window usually finds more." : "Try a broader market or more brands to watch.",
      };
    }
    if (run.phase === "stopped") {
      return {
        mood: "idle",
        title: found ? `Stopped. Kept the ${found} found so far` : "Stopped",
        sub: found ? "They're in the list below." : "Nothing was found before it stopped.",
      };
    }
    return { mood: "oops", title: run.error?.message || "That search didn't finish.", sub: "Nothing was saved from it." };
  })();

  return (
    <AnimatePresence initial={false}>
      <motion.section
        key={searchId}
        aria-live="polite"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={SPRING}
        className={cx(
          "relative overflow-hidden rounded-[22px] border p-4 sm:p-5",
          run.phase === "error" ? "border-danger/25 bg-danger-soft" : "border-line-strong bg-surface shadow-card",
          className
        )}
      >
        <div className="flex items-start gap-3.5">
          <Huesy mood={body.mood} size={46} />
          <div className="min-w-0 flex-1">
            <p className={cx("font-display text-[19px] leading-snug", run.phase === "error" ? "text-danger" : "text-ink")}>
              {body.title}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-muted">
              {run.phase === "running" && lastQuery ? <MagnifyingGlass size={13} className="shrink-0" /> : null}
              <span className="truncate">{body.sub}</span>
            </p>
          </div>
          {run.phase === "running" ? (
            <Button size="sm" variant="ghost" onClick={() => stopRun(searchId)}>
              Stop
            </Button>
          ) : (
            <IconButton label="Dismiss" onClick={() => clearRun(searchId)} size={32}>
              <X size={14} weight="bold" />
            </IconButton>
          )}
        </div>

        {run.phase === "running" ? (
          <div className="mt-4">
            <Progress indeterminate label={null} />
            {run.hosts?.length ? (
              <p className="mt-3 truncate text-[12.5px] text-faint">Reading {run.hosts.slice(0, 4).join(", ")}</p>
            ) : null}
          </div>
        ) : null}

        {run.phase === "empty" && days < 30 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                updateSearch(searchId, { config: { ...search.config, lookbackDays: 30 } });
                startRun(searchId);
              }}
            >
              Widen to 30 days and look again
            </Button>
          </div>
        ) : null}

        {run.phase === "error" ? (
          <div className="mt-4">
            <Button size="sm" variant="quiet" onClick={() => startRun(searchId)}>
              Try again
            </Button>
          </div>
        ) : null}
      </motion.section>
    </AnimatePresence>
  );
}
