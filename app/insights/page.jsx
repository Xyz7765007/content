"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CaretRight, CircleNotch, Warning } from "@phosphor-icons/react";
import AppShell from "../../components/shell/AppShell";
import InsightsNav from "../../components/insights/InsightsNav";
import { NewReportSheet, ReportPicker } from "../../components/insights/NewReport";
import { Appear, Skeleton, cx } from "../../components/ui";
import { GateNote, Locked } from "../../components/plan/PlanBits";
import { useAccountData } from "../../lib/account";
import { getJson } from "../../lib/stream";
import { reportLabel } from "../../lib/intel/kinds";
import { platformLabel } from "../../lib/intel/taxonomy";
import { useReportRuns } from "../../lib/reportRunner";
import { ago } from "../../lib/when";

export default function InsightsPage() {
  const { account, ready } = useAccountData();
  const [reports, setReports] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [picking, setPicking] = useState(null);
  const runs = useReportRuns((s) => s.runs);
  const stillRunning = useRef(false);
  stillRunning.current = Boolean(reports?.some((r) => r.status === "running"));

  useEffect(() => {
    if (!account?.plan) return undefined;
    let alive = true;
    const load = () =>
      getJson("/api/intel/report").then((r) => {
        if (!alive) return;
        if (r.error) setLoadError(r.error);
        else {
          setLoadError(null);
          setReports(r.reports || []);
        }
      });
    load();
    // While a report is running, keep the list current.
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && stillRunning.current) load();
    }, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [account?.plan, attempt]);

  if (ready && account && !account.plan) {
    return (
      <AppShell title="Insights">
        <InsightsNav />
        <Locked
          title="Deep reports on your market"
          body="Trend radars, content playbooks, competitor breakdowns, your audience in their own words, and creator shortlists. Your first one is on Huesy once you have a plan."
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Reports" docTitle="Insights">
      <InsightsNav />
      <div className="flex flex-col gap-10">
        <section aria-labelledby="new-report">
          <h2 id="new-report" className="font-display mb-1 text-[22px]">
            Run a deep report
          </h2>
          <p className="mb-4 text-[13.5px] text-muted">
            {account?.welcomeReport ? "Your first report is free. " : ""}Each one reads hundreds of real posts and keeps what it learns for everything you ask and make next.
          </p>
          <ReportPicker onPick={setPicking} />
        </section>

        <section aria-labelledby="your-reports">
          <h2 id="your-reports" className="font-display mb-4 text-[22px]">
            Your reports
          </h2>
          {reports === null && loadError ? (
            <GateNote error={{ ...loadError, message: "I couldn't load your reports." }} onRetry={() => setAttempt((n) => n + 1)} />
          ) : reports === null ? (
            <div className="space-y-2.5">
              <Skeleton className="h-[68px] w-full" />
              <Skeleton className="h-[68px] w-full" />
            </div>
          ) : !reports.length ? (
            <p className="rounded-[20px] border border-dashed border-line-strong px-5 py-6 text-[14px] text-muted">
              Reports you run will be kept here. Start with a content playbook: it's what Studio leans on most.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {reports.map((r, i) => {
                const status = runs[r.id]?.status || r.status;
                return (
                  <Appear key={r.id} index={i} as="li">
                    <Link
                      href={`/insights/reports/${r.id}`}
                      className="group flex items-center gap-4 rounded-[20px] border border-line bg-surface px-4 py-3.5 transition-[transform,border-color] hover:border-line-strong active:scale-[0.99]"
                    >
                      <span
                        className={cx(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                          status === "failed" ? "bg-danger-soft text-danger" : status === "running" ? "bg-accent-soft text-accent-deep" : "bg-sunken text-muted"
                        )}
                      >
                        {status === "running" ? <CircleNotch size={16} weight="bold" className="animate-spin" /> : status === "failed" ? <Warning size={16} weight="fill" /> : <span className="font-display text-[15px]">{reportLabel(r.kind).charAt(0)}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-ink">{r.title}</span>
                        <span className="mt-0.5 block text-[12.5px] text-muted">
                          {status === "running" ? "Working on it" : status === "failed" ? "Didn't finish, credits returned" : `${reportLabel(r.kind)}${r.params?.platform ? ` on ${platformLabel(r.params.platform)}` : ""}`}
                          <span className="text-faint">, {ago(r.created_at)}</span>
                        </span>
                      </span>
                      <span className="hidden text-[12.5px] text-muted sm:inline">{r.credits ? `${r.credits} credits` : "Free"}</span>
                      <CaretRight size={14} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  </Appear>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <NewReportSheet kind={picking} onClose={() => setPicking(null)} />
    </AppShell>
  );
}
