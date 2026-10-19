"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowClockwise, ChatCircleDots, DownloadSimple, Envelope, LockSimple, Phone } from "@phosphor-icons/react";
import AppShell from "../../../../components/shell/AppShell";
import InsightsNav from "../../../../components/insights/InsightsNav";
import { NewReportSheet } from "../../../../components/insights/NewReport";
import Huesy from "../../../../components/huesy/Huesy";
import Markdown, { InlineMarkdown } from "../../../../components/Markdown";
import { Badge, Button, ErrorNote, SPRING, Skeleton, cx, toast } from "../../../../components/ui";
import { CostTag, GateNote } from "../../../../components/plan/PlanBits";
import { BarChart, EvidenceStrip, Working } from "../../../../components/intel/IntelBits";
import { getJson, sendJson } from "../../../../lib/stream";
import { reportLabel } from "../../../../lib/intel/kinds";
import { formatLabel, hookLabel, platformLabel, profileUrl } from "../../../../lib/intel/taxonomy";
import { useReportRuns } from "../../../../lib/reportRunner";
import { PRICES, setCredits, useAccountData } from "../../../../lib/account";
import { compact, dayLabel } from "../../../../lib/when";

const TYPE_FOR_FORMAT = { reel: "reel", video: "reel", short: "reel", carousel: "carousel", image: "creative", text: "text" };

export default function ReportPage() {
  const { id } = useParams();
  const router = useRouter();
  const { account } = useAccountData();
  const run = useReportRuns((s) => s.runs[id]);
  const [report, setReport] = useState(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [again, setAgain] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer;
    const load = async () => {
      const r = await getJson(`/api/intel/report?id=${id}`);
      if (!alive) return;
      if (r.error) {
        if (r.error.code === "not_found") setMissing(true);
        else setLoadError(r.error);
        return;
      }
      setLoadError(null);
      setReport(r.report);
      // The server is the truth: keep checking while it says it's running.
      if (r.report.status === "running") timer = setTimeout(load, 3500);
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, attempt]);

  // When the run in this tab finishes, read the saved report straight away.
  useEffect(() => {
    if (run?.status === "ready" || run?.status === "failed") {
      getJson(`/api/intel/report?id=${id}`).then((r) => !r.error && setReport(r.report));
    }
  }, [run?.status, id]);

  const status = report?.status === "running" && run?.status === "failed" && run.error?.code !== "network" ? "failed" : report?.status;
  const body = report?.body;
  const title = report?.title || run?.title || "Report";

  if (missing) {
    return (
      <AppShell title="Report" back={{ href: "/insights", label: "Insights" }}>
        <ErrorNote
          action={
            <Button as={Link} href="/insights" size="sm" variant="quiet">
              Back to Insights
            </Button>
          }
        >
          I couldn't find that report. It may have been deleted.
        </ErrorNote>
      </AppShell>
    );
  }

  return (
    <AppShell title={title} docTitle={title} back={{ href: "/insights", label: "Insights" }}>
      <InsightsNav />
      {!report && loadError ? (
        <GateNote error={{ ...loadError, message: "I couldn't load this report." }} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !report ? (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : status === "running" ? (
        <div className="flex flex-col gap-5">
          <Working title={`Working on your ${reportLabel(report.kind).toLowerCase()}`} steps={run?.steps} />
          <p className="text-[13.5px] text-muted">It takes a minute or two. You can leave this page; I'll keep going and tell you when it's ready.</p>
        </div>
      ) : status === "failed" ? (
        <div className="flex flex-col gap-4">
          <ErrorNote
            action={
              <Button size="sm" variant="quiet" onClick={() => setAgain(true)}>
                <ArrowClockwise size={14} />
                Run it again
              </Button>
            }
          >
            {run?.error?.message || "This report didn't finish."} {report.credits ? "Your credits are back." : ""}
          </ErrorNote>
        </div>
      ) : (
        <ReportBody report={report} body={body} account={account} onAgain={() => setAgain(true)} />
      )}
      <NewReportSheet kind={again ? report?.kind : null} preset={report?.params} onClose={() => setAgain(false)} />
    </AppShell>
  );
}

function ReportBody({ report, body, account, onAgain }) {
  const charts = body?.charts || {};
  const data = body?.data || {};
  const ideas = body?.ideas || [];
  const studio = account?.studio;
  const from = (body?.findingIds || []).slice(0, 12).join(",");
  return (
    <div className="flex flex-col gap-9">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="aurora grain relative overflow-hidden rounded-[24px] border border-line bg-surface p-6 sm:p-8">
        <div className="relative flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          <Badge tone="neutral">{reportLabel(report.kind)}</Badge>
          {report.params?.platform ? <span>{report.params.platform === "all" ? "All platforms" : platformLabel(report.params.platform)}</span> : null}
          <span>{dayLabel(report.created_at)}</span>
          <span>{report.credits ? `${report.credits} credits` : "Free"}</span>
          {body?.sample ? <Badge tone="mist">Sample data</Badge> : null}
        </div>
        <div className="relative mt-5 flex items-start gap-4">
          <Huesy mood="found" size={44} className="hidden sm:inline-block" />
          <p className="font-display max-w-[60ch] text-[21px] leading-snug sm:text-[24px] [&_strong]:font-medium">
            <InlineMarkdown>{body?.summary}</InlineMarkdown>
          </p>
        </div>
        {body?.read?.length ? (
          <p className="relative mt-4 text-[12.5px] leading-relaxed text-muted">
            <span className="font-medium text-ink/80">What I read: </span>
            {body.read.slice(0, 6).map((r) => `${r.items.toLocaleString("en-US")} from ${r.label}`).join(" · ")}
          </p>
        ) : null}
        <div className="relative mt-6 flex flex-wrap gap-2">
          <Button as={Link} href={`/ask?q=${encodeURIComponent(`About my ${report.title}: `)}`} size="sm" variant="quiet">
            <ChatCircleDots size={15} />
            Ask about this
          </Button>
          <Button size="sm" variant="ghost" onClick={onAgain}>
            <ArrowClockwise size={14} />
            Run it again
          </Button>
        </div>
      </motion.section>

      {ideas.length ? (
        <section aria-labelledby="ideas">
          <h2 id="ideas" className="font-display mb-1 text-[22px]">
            Ideas to make
          </h2>
          <p className="mb-4 text-[13.5px] text-muted">Each one is built on a pattern measured above. Studio turns them into finished pieces.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {ideas.map((idea, i) => {
              const type = TYPE_FOR_FORMAT[String(idea.format).toLowerCase()] || "creative";
              return (
                <motion.article
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ ...SPRING, delay: i * 0.04 }}
                  className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="accent">{String(idea.format || "post").replace(/^\w/, (c) => c.toUpperCase())}</Badge>
                  </div>
                  <h3 className="text-[15.5px] font-medium leading-snug text-ink">{idea.title}</h3>
                  <p className="font-display text-[17px] leading-snug text-ink/90">"{idea.hook}"</p>
                  <p className="text-[13px] leading-relaxed text-muted">{idea.why}</p>
                  <div className="mt-auto pt-1">
                    <Button
                      as={Link}
                      href={studio ? `/studio/${type}?topic=${encodeURIComponent(idea.hook)}${from ? `&from=${from}` : ""}` : "/plans"}
                      size="sm"
                      variant="quiet"
                    >
                      {studio ? null : <LockSimple size={13} />}
                      Make this
                    </Button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>
      ) : null}

      {charts.hooks?.length || charts.formats?.length || charts.lengths?.length || charts.times?.length || charts.cadence?.length || charts.questions?.length || charts.topics?.length || charts.followers?.length ? (
        <section aria-labelledby="numbers" className="flex flex-col gap-3">
          <h2 id="numbers" className="font-display text-[22px]">
            The numbers
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            <BarChart title="Reach by opening" note="How many times a typical post's reach each kind of opening gets" data={charts.hooks} />
            <BarChart title="Reach by format" data={charts.formats} />
            <BarChart title="Reach by length" data={charts.lengths} />
            <BarChart title="Reach by posting time" note="Local time in your market" data={charts.times} />
            <BarChart title="Posts a week" data={charts.cadence} unit="/wk" />
            <BarChart title="What people ask most" data={charts.questions} unit="count" />
            <BarChart title="Most talked-about this week" note="Accounts posting about each topic" data={charts.topics} unit="count" />
            <BarChart title="Audience size" data={charts.followers} unit="count" />
          </div>
        </section>
      ) : null}

      {report.kind === "competitors" ? (data.competitors ? <CompetitorCards competitors={data.competitors} /> : <Competitors accounts={data.accounts} />) : null}
      {report.kind === "creators" ? <Creators report={report} creators={data.creators || []} /> : null}

      {body?.sections?.length ? (
        <section className="flex flex-col gap-3">
          {body.sections.map((s, i) => (
            <article key={i} className="rounded-[20px] border border-line bg-surface p-5 sm:p-6">
              <h3 className="font-display mb-3 text-[19px]">{s.title}</h3>
              <Markdown>{s.body}</Markdown>
            </article>
          ))}
        </section>
      ) : null}

      <EvidenceStrip posts={body?.evidence} title="Standout posts in this report" />
    </div>
  );
}

function Competitors({ accounts }) {
  if (!accounts?.length) return null;
  return (
    <section aria-labelledby="accounts" className="flex flex-col gap-3">
      <h2 id="accounts" className="font-display text-[22px]">
        Account by account
      </h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {accounts.map((a) => (
          <article key={a.handle} className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5">
            <h3 className="text-[16px] font-medium">@{a.handle}</h3>
            {a.note ? (
              <p className="text-[13.5px] text-muted">{a.note}</p>
            ) : (
              <>
                <dl className="grid grid-cols-3 gap-3">
                  <Stat label="Followers" value={compact(a.followers) ?? "–"} />
                  <Stat label="Posts a week" value={a.postsPerWeek ?? "–"} />
                  <Stat label="Normal views" value={compact(a.normalViews) ?? compact(a.normalLikes) ?? "–"} />
                </dl>
                {a.hooks?.length ? (
                  <p className="text-[13px] text-muted">
                    Leans on {a.hooks.map((h) => `${hookLabel(h.key).toLowerCase()} (${h.n})`).join(", ")}. Mostly {a.formats?.map((f) => formatLabel(f.key).toLowerCase()).join(", ")}.
                  </p>
                ) : null}
                <EvidenceStrip posts={a.breakouts} title="Their breakouts" />
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

// One card per competitor: every platform they're on, the ads they run,
// what reviewers say and how much they're talked about.
function CompetitorCards({ competitors }) {
  if (!competitors?.length) return null;
  return (
    <section aria-labelledby="competitors" className="flex flex-col gap-3">
      <h2 id="competitors" className="font-display text-[22px]">
        Competitor by competitor
      </h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {competitors.map((c) => (
          <article key={c.name} className="flex min-w-0 flex-col gap-4 rounded-[20px] border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[16px] font-medium">{c.name}</h3>
              {c.website ? (
                <a href={`https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-muted hover:underline">
                  {c.website}
                </a>
              ) : null}
            </div>
            {(c.accounts || []).length ? (
              <ul className="flex flex-col gap-2">
                {c.accounts.map((a) => (
                  <li key={a.platform} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13.5px]">
                    <span>
                      <span className="font-medium">{platformLabel(a.platform)}</span>
                      {a.account ? <span className="text-muted"> {a.account}</span> : null}
                    </span>
                    <span className="tabular text-[12.5px] text-muted">
                      {a.note || [a.followers != null ? `${compact(a.followers)} followers` : null, a.postsPerWeek != null ? `${a.postsPerWeek}/wk` : null, a.normalViews != null ? `${compact(a.normalViews)} normal views` : a.normalLikes != null ? `${compact(a.normalLikes)} normal likes` : null].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">I couldn't confirm any of their accounts.</p>
            )}
            <dl className="grid grid-cols-3 gap-3 border-t border-line pt-3">
              <Stat label="Ads running" value={c.ads?.running ?? 0} />
              <Stat label="Reviews" value={c.reviews ? `${c.reviews.average}★` : "–"} />
              <Stat label="Mentions, 30d" value={c.mentions?.last30Days ?? 0} />
            </dl>
            {c.notFound?.length ? <p className="text-[12px] text-muted">Not found on {c.notFound.map(platformLabel).join(", ")}.</p> : null}
            <EvidenceStrip posts={(c.accounts || []).flatMap((a) => (a.breakouts || []).slice(0, 2))} title="What breaks out for them" />
          </article>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="font-display tabular mt-0.5 text-[20px] leading-none">{value}</dd>
    </div>
  );
}

function toCsv(creators) {
  const cols = ["platform", "handle", "name", "followers", "engagement", "fit", "relevance", "why", "lastPost", "location", "email", "url"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...creators.map((c) => cols.map((k) => esc(k === "email" ? c.contact?.email || c.email : c[k])).join(","))].join("\n");
}

function Creators({ report, creators: initial }) {
  const [creators, setCreators] = useState(initial);
  const [opening, setOpening] = useState(null);
  const { account } = useAccountData();
  useEffect(() => setCreators(initial), [initial]);
  const checked = useMemo(() => creators.filter((c) => c.fit != null), [creators]);
  const rest = useMemo(() => creators.filter((c) => c.fit == null), [creators]);

  const reveal = async (handle, { quiet = false } = {}) => {
    setOpening(handle);
    const r = await sendJson("/api/intel/contact", { handle, reportId: report.id });
    setOpening(null);
    if (r.error) {
      toast(r.error.message, { duration: 6000 });
      return false;
    }
    if (r.credits != null) setCredits(r.credits);
    setCreators((list) => list.map((c) => (c.handle === handle ? { ...c, contact: { found: r.found, email: r.email, phone: r.phone, website: r.website } } : c)));
    if (!r.found && !quiet) toast(`@${handle} doesn't publish a contact. No credits used.`);
    return true;
  };

  // The top ten without a contact yet, one after another.
  const [bulk, setBulk] = useState(false);
  const pending = creators.filter((c) => c.fit != null && !c.contact && !c.email).slice(0, 10);
  const revealAll = async () => {
    setBulk(true);
    let found = 0;
    for (const c of pending) {
      const ok = await reveal(c.handle, { quiet: true });
      if (!ok) break;
      found += 1;
    }
    setBulk(false);
    toast(`Checked ${found} creators. Only the contacts found were charged.`, { tone: "good" });
  };

  const download = () => {
    const blob = new Blob([toCsv(creators)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${report.title.replace(/[^\w]+/g, "-").toLowerCase()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (!creators.length) return null;
  return (
    <section aria-labelledby="creators" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="creators" className="font-display text-[22px]">
            Ranked by fit
          </h2>
          <p className="mt-1 text-[13.5px] text-muted">Fit weighs how on-topic their recent posts are, how much their audience engages, and how recently they posted.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pending.length > 1 && (account?.credits ?? 0) >= PRICES.contact * pending.length ? (
            <Button size="sm" variant="quiet" onClick={revealAll} loading={bulk} disabled={bulk || Boolean(opening)}>
              Get the top {pending.length} contacts
              <CostTag credits={PRICES.contact * pending.length} />
            </Button>
          ) : null}
          <Button size="sm" variant="quiet" onClick={download}>
            <DownloadSimple size={15} />
            Download CSV
          </Button>
        </div>
      </div>
      <ul className="flex flex-col gap-2.5">
        {checked.map((c, i) => (
          <motion.li
            key={c.handle}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ ...SPRING, delay: Math.min(i, 8) * 0.03 }}
            className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3.5">
              <span className={cx("flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full leading-none", c.fit >= 70 ? "bg-accent-soft text-ink" : "bg-sunken text-ink")} aria-label={`Fit ${c.fit} out of 100`}>
                <span className="font-display tabular text-[16px]">{c.fit}</span>
                <span className="mt-0.5 text-[9.5px] font-medium uppercase tracking-wide opacity-80">fit</span>
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">
                  <a href={c.url || profileUrl(c.platform, c.handle)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {c.platform === "linkedin" ? c.name || c.handle : `@${c.handle}`}
                  </a>
                    {c.name && c.platform !== "linkedin" ? <span className="font-normal text-muted"> {c.name}</span> : null}
                </p>
                {c.why ? <p className="mt-0.5 text-[12.5px] text-ink/75">{c.why}</p> : null}
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {[
                    c.followers != null ? `${compact(c.followers)} followers` : null,
                    c.engagement != null ? `${c.engagement}% engagement` : null,
                    c.daysQuiet != null ? `posted ${c.daysQuiet === 0 ? "today" : `${c.daysQuiet}d ago`}` : null,
                    c.location,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!c.contact && c.email ? (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-[13px] text-accent-deep hover:underline" title="Published in their bio">
                  <Envelope size={14} />
                  {c.email}
                </a>
              ) : c.contact?.found ? (
                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                  {c.contact.email ? (
                    <a href={`mailto:${c.contact.email}`} className="inline-flex items-center gap-1.5 text-accent-deep hover:underline">
                      <Envelope size={14} />
                      {c.contact.email}
                    </a>
                  ) : null}
                  {c.contact.phone ? (
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <Phone size={14} />
                      {c.contact.phone}
                    </span>
                  ) : null}
                </span>
              ) : c.contact && !c.contact.found ? (
                <span className="text-[12.5px] text-muted">No public contact</span>
              ) : (
                (account?.credits ?? 0) < PRICES.contact ? (
                  <span className="text-[12.5px] text-muted">Needs {PRICES.contact} credits</span>
                ) : (
                  <Button size="sm" variant="quiet" onClick={() => reveal(c.handle)} loading={opening === c.handle} disabled={Boolean(opening) || bulk}>
                    Get contact
                    <CostTag credits={PRICES.contact} />
                  </Button>
                )
              )}
            </div>
          </motion.li>
        ))}
      </ul>
      {rest.length ? (
        <p className="text-[13px] text-muted">
          {rest.length} more matched but weren't checked: {rest.slice(0, 12).map((c) => `@${c.handle}`).join(", ")}
          {rest.length > 12 ? "…" : ""}. They're in the CSV.
        </p>
      ) : null}
    </section>
  );
}
