"use client";

import { create } from "zustand";
import { streamSearch } from "./api";
import { useStore } from "./store";
import { toast } from "../components/ui";
import { setCredits } from "./account";

/**
 * Searches run here, outside any screen, so moving around the app never
 * cancels one and never yanks the person back when it finishes. Screens
 * read live progress from useRuns; the finished signals are folded into the
 * watchlist they belong to, and a toast says so wherever the person is.
 *
 * run: {
 *   searchId, name, phase: "running" | "done" | "empty" | "error" | "stopped",
 *   status, queries[], hosts[], signals[], added, error, startedAt, endedAt
 * }
 */
export const useRuns = create(() => ({ runs: {} }));

const controllers = new Map();

const patch = (id, fn) =>
  useRuns.setState((s) => {
    const prev = s.runs[id] || {};
    const next = typeof fn === "function" ? fn(prev) : { ...prev, ...fn };
    return { runs: { ...s.runs, [id]: next } };
  });

export const isRunning = (id) => controllers.has(id);

// Hands navigation to whichever screen is mounted (AppShell listens).
export const goTo = (href) => window.dispatchEvent(new CustomEvent("huesy:navigate", { detail: href }));

export function startRun(searchId) {
  if (!searchId || controllers.has(searchId)) return;
  const { getSearch, brand } = useStore.getState();
  const search = getSearch(searchId);
  if (!search) return;

  const ac = new AbortController();
  controllers.set(searchId, ac);
  patch(searchId, {
    searchId,
    name: search.name,
    phase: "running",
    status: "Planning where to look",
    queries: [],
    hosts: [],
    signals: [],
    error: null,
    startedAt: Date.now(),
    endedAt: null,
  });

  const onEvent = (ev) => {
    if (ev.t === "status") patch(searchId, (r) => ({ ...r, status: ev.text }));
    else if (ev.t === "query") patch(searchId, (r) => ({ ...r, queries: [...r.queries, ev.q].slice(-12) }));
    else if (ev.t === "reading")
      patch(searchId, (r) => ({ ...r, hosts: [...new Set([...(ev.hosts || []), ...r.hosts])].slice(0, 12) }));
    else if (ev.t === "signal") patch(searchId, (r) => ({ ...r, signals: [...r.signals, ev.signal] }));
    else if (ev.t === "ranked") {
      const byId = new Map((ev.ranks || []).map((x) => [x.id, x]));
      patch(searchId, (r) => ({
        ...r,
        signals: r.signals.map((s) => (byId.has(s.id) ? { ...s, fit: byId.get(s.id).fit, angle: byId.get(s.id).angle } : s)),
      }));
    } else if (ev.t === "error") {
      if (ev.credits != null) setCredits(ev.credits);
      patch(searchId, (r) => ({ ...r, error: { code: ev.code, message: ev.message } }));
    } else if (ev.t === "done" || ev.t === "refund") {
      if (ev.credits != null) setCredits(ev.credits);
      if (ev.t === "refund") patch(searchId, (r) => ({ ...r, refunded: true }));
    }
  };

  streamSearch({ config: search.config, brand }, onEvent, ac.signal).then((res) => {
    controllers.delete(searchId);
    const run = useRuns.getState().runs[searchId] || {};
    const found = run.signals || [];
    const store = useStore.getState();
    const before = (store.getSearch(searchId)?.signals || []).length;

    // Whatever arrived is kept, even from a run that stopped early, so a
    // dropped connection never costs the person what was already found.
    if (found.length) store.mergeRun(searchId, found);
    const after = (useStore.getState().getSearch(searchId)?.signals || []).length;
    const added = Math.max(0, after - before);

    let phase = "done";
    if (res.aborted) phase = "stopped";
    else if (run.error && !found.length) phase = "error";
    else if (!found.length) phase = "empty";
    patch(searchId, (r) => ({ ...r, phase, added, endedAt: Date.now() }));

    // A check that finished but found nothing still counts as a check.
    if (phase === "empty") {
      const s = useStore.getState().getSearch(searchId);
      useStore.getState().updateSearch(searchId, { lastRunAt: Date.now(), runs: (s?.runs || 0) + 1, lastAdded: 0 });
    }

    // On the watchlist's own page the panel already says how it went.
    const here = typeof window !== "undefined" && window.location.pathname === `/search/${searchId}`;

    if (here) return;
    if (phase === "done" || (phase === "stopped" && found.length)) {
      if (!found.length) return;
      const where = run.name || "your watchlist";
      const message = added
        ? `${added} new for ${where}`
        : `Checked ${where}. Nothing new since last time`;
      toast(message, {
        tone: "good",
        action: added ? { label: "View", onClick: () => goTo(`/search/${searchId}`) } : undefined,
      });
    } else if (phase === "error" && run.error) {
      const next =
        run.error.code === "no_plan" || run.error.code === "studio_only"
          ? { label: "See plans", onClick: () => goTo("/plans") }
          : run.error.code === "no_credits"
            ? { label: "Your month", onClick: () => goTo("/profile?tab=account") }
            : undefined;
      toast(run.error.message, { duration: 7000, action: next });
    }
  });
}

export function stopRun(searchId) {
  controllers.get(searchId)?.abort();
}

export function clearRun(searchId) {
  useRuns.setState((s) => {
    const runs = { ...s.runs };
    delete runs[searchId];
    return { runs };
  });
}

// Every watchlist not checked in the last hour, one after another.
export async function checkAll() {
  const { searches } = useStore.getState();
  const stale = searches.filter((s) => Date.now() - (s.lastRunAt || 0) > 60 * 60 * 1000);
  const list = stale.length ? stale : searches.slice(0, 1);
  for (const s of list) {
    startRun(s.id);
    if (useRuns.getState().runs[s.id]?.phase !== "running") continue;
    // Wait for this one before the next, so two searches never compete.
    await new Promise((resolve) => {
      const unsub = useRuns.subscribe((state) => {
        if (state.runs[s.id]?.phase !== "running") {
          unsub();
          resolve();
        }
      });
    });
  }
}
