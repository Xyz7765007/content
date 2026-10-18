"use client";

import { create } from "zustand";
import { writePost } from "./api";
import { useStore } from "./store";

/**
 * Writing runs here, outside any screen, so a sheet can close while posts are
 * still being written and reopen to find them done. Up to three posts are
 * written at once; each piece reports its own state.
 *
 * jobs[`${signalId}:${platform}`] = { state: "queued" | "writing" | "done" | "error", error }
 */
export const useWriting = create(() => ({ jobs: {} }));

const MAX_PARALLEL = 3;
const queue = [];
let active = 0;

const key = (signalId, platform) => `${signalId}:${platform}`;
const setJob = (k, value) => useWriting.setState((s) => ({ jobs: { ...s.jobs, [k]: value } }));

export const jobState = (jobs, signalId, platform) => jobs[key(signalId, platform)];

function pump() {
  while (active < MAX_PARALLEL && queue.length) {
    const job = queue.shift();
    active += 1;
    run(job).finally(() => {
      active -= 1;
      pump();
    });
  }
}

async function run({ signal, platform, options }) {
  const k = key(signal.id, platform);
  setJob(k, { state: "writing" });
  const { brand } = useStore.getState();
  const r = await writePost({ platform, signal, brand, options });
  if (r.error || !r.text) {
    setJob(k, { state: "error", error: r.error?.message || "I couldn't write this one. Try again.", code: r.error?.code || null });
    return;
  }
  useStore.getState().setDraftPost(signal.id, platform, r.text);
  setJob(k, { state: "done" });
}

export function write(signal, platforms, options) {
  for (const platform of platforms) {
    const k = key(signal.id, platform);
    const current = useWriting.getState().jobs[k]?.state;
    if (current === "queued" || current === "writing") continue;
    setJob(k, { state: "queued" });
    queue.push({ signal, platform, options });
  }
  pump();
}

export const isBusy = (jobs, signalId, platforms) =>
  platforms.some((p) => ["queued", "writing"].includes(jobs[key(signalId, p)]?.state));
