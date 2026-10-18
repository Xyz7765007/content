"use client";

import { create } from "zustand";
import { streamNdjson } from "./stream";
import { slimBrand } from "./api";
import { setCredits } from "./account";
import { goTo } from "./runner";
import { toast } from "../components/ui";

/**
 * Deep reports run here, outside any screen. Starting one resolves as soon as
 * the report exists (so the page can open it), and the run carries on while
 * the person moves around; the report page reads its live steps from here,
 * and a toast says when it's ready if they're elsewhere.
 */
export const useReportRuns = create(() => ({ runs: {} }));

const patch = (id, fn) =>
  useReportRuns.setState((s) => {
    const prev = s.runs[id] || { steps: [] };
    return { runs: { ...s.runs, [id]: typeof fn === "function" ? fn(prev) : { ...prev, ...fn } } };
  });

const foldStep = (steps, step) => {
  const i = steps.findIndex((x) => x.id === step.id);
  const next = { id: step.id, label: step.label, status: step.status };
  if (i < 0) return [...steps, next];
  const copy = [...steps];
  copy[i] = next;
  return copy;
};

export function startReport({ kind, params, brand, targets }) {
  return new Promise((resolve) => {
    let id = null;
    let settled = false;
    const settle = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    streamNdjson(
      "/api/intel/report",
      { kind, params, brand: slimBrand(brand), targets },
      (e) => {
        if (e.t === "start") {
          id = e.reportId;
          if (e.credits != null) setCredits(e.credits);
          patch(id, { status: "running", title: e.title, steps: [], free: e.free, charged: e.charged });
          settle({ reportId: id, free: e.free, charged: e.charged });
        } else if (e.t === "step" && id) {
          patch(id, (r) => ({ ...r, steps: foldStep(r.steps || [], e) }));
        } else if (e.t === "done" && id) {
          patch(id, (r) => ({ ...r, status: "ready" }));
          const here = typeof window !== "undefined" && window.location.pathname === `/insights/reports/${id}`;
          if (!here) toast(`${useReportRuns.getState().runs[id]?.title || "Your report"} is ready`, { tone: "good", action: { label: "Open", onClick: () => goTo(`/insights/reports/${id}`) } });
        } else if (e.t === "error") {
          if (e.credits != null) setCredits(e.credits);
          if (id) {
            patch(id, (r) => ({ ...r, status: "failed", error: { code: e.code, message: e.message }, refunded: e.refunded }));
            const here = typeof window !== "undefined" && window.location.pathname === `/insights/reports/${id}`;
            if (!here) toast(e.message, { duration: 6000 });
          } else settle({ error: { code: e.code, message: e.message } });
        }
      }
    ).then(() => settle({ error: { code: "failed", message: "That report didn't start. Try again." } }));
  });
}
