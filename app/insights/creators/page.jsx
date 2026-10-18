"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CaretRight, Users } from "@phosphor-icons/react";
import AppShell from "../../../components/shell/AppShell";
import InsightsNav from "../../../components/insights/InsightsNav";
import { NewReportSheet } from "../../../components/insights/NewReport";
import { Appear, Button, EmptyState, Skeleton } from "../../../components/ui";
import { CostTag, GateNote, Locked } from "../../../components/plan/PlanBits";
import { PRICES, useAccountData } from "../../../lib/account";
import { getJson } from "../../../lib/stream";
import { platformLabel } from "../../../lib/intel/taxonomy";
import { compact, dayLabel } from "../../../lib/when";

// Every creator shortlist, newest first, with its best matches up front.
export default function CreatorsPage() {
  const { account, ready } = useAccountData();
  const [lists, setLists] = useState(null);
  const [pending, setPending] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [finding, setFinding] = useState(false);

  useEffect(() => {
    if (!account?.plan) return;
    (async () => {
      const r = await getJson("/api/intel/report");
      if (r.error) {
        setLoadError(r.error);
        return;
      }
      setLoadError(null);
      const all = (r.reports || []).filter((x) => x.kind === "creators");
      setPending(all.filter((x) => x.status !== "ready").slice(0, 4));
      const mine = all.filter((x) => x.status === "ready").slice(0, 6);
      const full = await Promise.all(mine.map((x) => getJson(`/api/intel/report?id=${x.id}`).then((d) => d.report).catch(() => null)));
      setLists(full.filter(Boolean));
    })();
  }, [account?.plan, attempt]);

  if (ready && account && !account.plan) {
    return (
      <AppShell title="Creators">
        <InsightsNav />
        <Locked title="Creators who fit your brand" body="I search creators in your niche, read their recent posts, and rank them by how on-topic, engaged and active they are, with their contact when they publish one." />
      </AppShell>
    );
  }

  const findButton = (
    <Button onClick={() => setFinding(true)} size="sm">
      <Users size={15} />
      Find creators
      <CostTag credits={PRICES.creators} />
    </Button>
  );

  return (
    <AppShell title="Creators" actions={lists?.length ? findButton : null}>
      <InsightsNav />
      {pending.length ? (
        <ul className="mb-4 flex flex-col gap-2">
          {pending.map((p) => (
            <li key={p.id}>
              <Link href={`/insights/reports/${p.id}`} className="flex items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3 text-[14px]">
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="text-[12.5px] text-muted">{p.status === "running" ? "Working on it" : "Didn't finish, credits returned"}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {lists === null && loadError ? (
        <GateNote error={{ ...loadError, message: "I couldn't load your creator shortlists." }} onRetry={() => setAttempt((n) => n + 1)} />
      ) : lists === null ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : !lists.length && pending.length ? null : !lists.length ? (
        <EmptyState
          mood="idle"
          title="No creator shortlists yet"
          body="Tell me the topic and the size you want. I'll search creators in your niche, read their recent posts and rank them by fit, with contacts on request."
          action={findButton}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {lists.map((l, i) => {
            const top = (l.body?.data?.creators || []).filter((c) => c.fit != null).slice(0, 5);
            return (
              <Appear key={l.id} index={i}>
                <Link href={`/insights/reports/${l.id}`} className="group block rounded-[20px] border border-line bg-surface p-5 transition-[transform,border-color] hover:border-line-strong active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[16px] font-medium">{l.title}</h2>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {(l.body?.data?.creators || []).length} creators{l.params?.platform ? ` on ${platformLabel(l.params.platform)}` : ""}, {dayLabel(l.created_at)}
                      </p>
                    </div>
                    <CaretRight size={15} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  {top.length ? (
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {top.map((c) => (
                        <li key={c.handle} className="flex items-center gap-2 rounded-full border border-line bg-raised py-1 pl-1 pr-3 text-[13px]">
                          <span className="font-display tabular flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-[12px] text-accent-deep">{c.fit}</span>
                          @{c.handle}
                          <span className="text-muted">{compact(c.followers)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Link>
              </Appear>
            );
          })}
        </div>
      )}
      <NewReportSheet kind={finding ? "creators" : null} onClose={() => setFinding(false)} />
    </AppShell>
  );
}
