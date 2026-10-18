"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChatCircleDots, LockSimple, PaintBrushBroad } from "@phosphor-icons/react";
import AppShell from "../../../components/shell/AppShell";
import InsightsNav from "../../../components/insights/InsightsNav";
import { NewReportSheet } from "../../../components/insights/NewReport";
import { Appear, Button, EmptyState, Segmented, Skeleton } from "../../../components/ui";
import { GateNote, Locked } from "../../../components/plan/PlanBits";
import { FindingCard } from "../../../components/intel/IntelBits";
import { useAccountData } from "../../../lib/account";
import { getJson } from "../../../lib/stream";
import { platformLabel } from "../../../lib/intel/taxonomy";

const ORDER = ["trend", "sound", "interest", "hook", "format", "length", "examples", "hashtag", "competitor", "audience"];
const GROUP = {
  trend: "Rising right now",
  sound: "Rising right now",
  interest: "Rising right now",
  hook: "What works",
  format: "What works",
  length: "What works",
  examples: "What works",
  hashtag: "What works",
  competitor: "Competitors",
  audience: "Your audience",
};

/**
 * Everything Huesy has learned about this market, newest fact per pattern.
 * Ask and Studio read from here first, and re-check anything too old.
 */
export default function KnowledgePage() {
  const { account, ready } = useAccountData();
  const [findings, setFindings] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [platform, setPlatform] = useState("all");
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!account?.plan) return;
    getJson("/api/intel/findings").then((r) => {
      if (r.error) setLoadError(r.error);
      else {
        setLoadError(null);
        setFindings(r.findings || []);
      }
    });
  }, [account?.plan, attempt]);

  const platforms = useMemo(() => [...new Set((findings || []).map((f) => f.platform))], [findings]);
  const shown = useMemo(
    () =>
      (findings || [])
        .filter((f) => platform === "all" || f.platform === platform)
        .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || new Date(b.fetched_at) - new Date(a.fetched_at)),
    [findings, platform]
  );
  const groups = useMemo(() => {
    const out = new Map();
    for (const f of shown) {
      const g = GROUP[f.kind] || "Other";
      if (!out.has(g)) out.set(g, []);
      out.get(g).push(f);
    }
    return [...out.entries()];
  }, [shown]);

  if (ready && account && !account.plan) {
    return (
      <AppShell title="What I know">
        <InsightsNav />
        <Locked title="Everything I learn about your market, kept" body="Every answer and report adds facts here: what's rising, what works, how competitors post and what your audience asks. Studio builds on them." />
      </AppShell>
    );
  }

  return (
    <AppShell title="What I know">
      <InsightsNav />
      {findings === null && loadError ? (
        <GateNote error={{ ...loadError, message: "I couldn't load what I know." }} onRetry={() => setAttempt((n) => n + 1)} />
      ) : findings === null ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : !findings.length ? (
        <EmptyState
          mood="sleepy"
          title="I don't know your market yet"
          body="Run a content playbook or ask a question, and what I learn lands here. Studio uses it to make content that follows what's working."
          action={
            <>
              <Button onClick={() => setReport("playbook")}>{account?.welcomeReport ? "Get your free playbook" : "Run a playbook"}</Button>
              <Button as={Link} href="/ask" variant="quiet">
                Ask a question
              </Button>
            </>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[60ch] text-[13.5px] text-muted">
              {findings.length} things I know, newest first. Anything older than three weeks gets checked again before Studio relies on it.
            </p>
            {platforms.length > 1 ? (
              <Segmented
                label="Platform"
                size="sm"
                value={platform}
                onChange={setPlatform}
                options={[{ id: "all", label: "All" }, ...platforms.map((p) => ({ id: p, label: p === "google" ? "Google" : platformLabel(p) }))]}
              />
            ) : null}
          </div>
          {groups.map(([name, list]) => (
            <section key={name} aria-label={name}>
              <h2 className="font-display mb-3 text-[20px]">{name}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((f, i) => (
                  <Appear key={f.id} index={i}>
                    <FindingCard
                      finding={f}
                      className="h-full"
                      actions={
                        <>
                          <Button as={Link} href={`/ask?q=${encodeURIComponent(`${f.statement} What should we post because of this?`)}`} size="sm" variant="ghost">
                            <ChatCircleDots size={14} />
                            Ask about this
                          </Button>
                          <Button as={Link} href={account?.studio ? `/studio?from=${f.id}` : "/plans"} size="sm" variant="ghost">
                            {account?.studio ? <PaintBrushBroad size={14} /> : <LockSimple size={13} />}
                            Make from this
                          </Button>
                        </>
                      }
                    />
                  </Appear>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <NewReportSheet kind={report} onClose={() => setReport(null)} />
    </AppShell>
  );
}
