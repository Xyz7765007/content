"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, ChatCircleDots, ChartLineUp, Clock, Lightning, Sparkle } from "@phosphor-icons/react";
import { Badge, Button, SPRING, Skeleton, cx } from "../ui";
import Huesy from "../huesy/Huesy";
import { CostTag } from "../plan/PlanBits";
import { TYPE_ICONS } from "../studio/StudioBits";
import { ReelRow } from "../studio/ReelBits";
import { EvidenceStrip } from "../intel/IntelBits";
import { getJson, sendJson } from "../../lib/stream";
import { slimBrand } from "../../lib/api";
import { PLANS } from "../../lib/account";
import { STUDIO_TYPES } from "../../lib/studio/options";
import { platformLabel } from "../../lib/intel/taxonomy";
import { standouts } from "../../lib/intel/standouts";
import { ago } from "../../lib/when";

/* ------------------------------------------------------------- plan state -- */

export function PlanNotice({ account }) {
  if (!account) return null;
  if (account.pendingRequest) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-mist bg-mist-soft px-5 py-4" role="status">
        <Clock size={18} className="shrink-0 text-mist-deep" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[14px] text-mist-deep">
          Your request for {PLANS[account.pendingRequest.plan]?.name} is waiting for approval. It starts the moment it's approved.
        </p>
      </div>
    );
  }
  if (account.plan) return null;
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="aurora grain relative overflow-hidden rounded-[24px] border border-accent-line bg-surface p-6 sm:p-8">
      <h2 className="display-lg relative max-w-[26ch] text-[24px] sm:text-[28px]">Choose how you'd like to use Huesy</h2>
      <p className="relative mt-2 max-w-[58ch] text-[14.5px] leading-relaxed text-muted">
        Intelligence answers anything about your market from real posts. Studio adds content made from what's working, including reels made for you.
      </p>
      <Button as={Link} href="/plans" size="lg" className="relative mt-5">
        See plans
        <ArrowRight size={15} weight="bold" />
      </Button>
    </motion.section>
  );
}

/* ----------------------------------------------------------- first report -- */

export function FirstPlaybook({ onRun, platform }) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="aurora grain relative overflow-hidden rounded-[24px] border border-accent-line bg-surface p-6 sm:p-8">
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <Huesy mood="idle" size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="display-lg text-[24px] sm:text-[28px]">Your first content playbook is on me</h2>
          <p className="mt-2 max-w-[58ch] text-[14.5px] leading-relaxed text-muted">
            I'll read hundreds of recent {platform ? platformLabel(platform) : ""} posts in your niche and show you which openings, formats and lengths win, with examples. Everything after builds on it.
          </p>
        </div>
        <Button size="lg" onClick={onRun} className="shrink-0">
          <Sparkle size={16} weight="fill" />
          Make my playbook
          <CostTag free />
        </Button>
      </div>
    </motion.section>
  );
}

/* --------------------------------------------------------------- briefing -- */

const MOVE_ICON = { trend: ChartLineUp, sound: Sparkle, interest: ChartLineUp, format: Lightning };

export function Briefing({ brand, targets, studio }) {
  const [state, setState] = useState({ loading: true, briefing: null, building: false });
  const tried = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await getJson("/api/intel/briefing");
      if (!alive) return;
      if (r.error) {
        setState({ loading: false, briefing: null, building: false, error: r.error });
        return;
      }
      setState({ loading: false, briefing: r.briefing, building: !r.fresh });
      if (!r.fresh && !tried.current) {
        tried.current = true;
        const b = await sendJson("/api/intel/briefing", { brand: slimBrand(brand), targets });
        if (!alive) return;
        setState({ loading: false, briefing: b.briefing || r.briefing, building: false });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const b = state.briefing?.body;
  if (state.loading) return <Skeleton className="h-48 w-full rounded-[24px]" />;
  if (!b && state.building) {
    return (
      <div className="flex items-center gap-3 rounded-[24px] border border-line bg-surface px-5 py-5" aria-live="polite">
        <Huesy mood="watch" size={36} track={false} />
        <p className="text-[14.5px]">Putting this week's briefing together…</p>
      </div>
    );
  }
  if (b?.v === 2) return <BriefingV2 briefing={state.briefing} building={state.building} studio={studio} />;
  if (!b || (!b.moves?.length && !b.ideas?.length)) return null;
  const from = (b.findingIds || []).slice(0, 12).join(",");
  const shown = standouts(b);

  return (
    <section aria-labelledby="briefing" className="rounded-[24px] border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="briefing" className="font-display text-[22px]">
          This week on {platformLabel(b.platform)}
        </h2>
        <span className="flex items-center gap-2 text-[12.5px] text-muted">
          {state.building ? "Refreshing…" : `${state.briefing.title}`}
          {b.sample ? <Badge tone="mist">Sample data</Badge> : null}
        </span>
      </div>
      {b.posts ? (
        <p className="mt-1 text-[13px] text-muted">
          From {b.posts} posts in your niche in the last 7 days{shown.thin ? ", an early read" : ""}. Free, every week.
        </p>
      ) : null}
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {b.moves?.length ? (
          <div>
            <h3 className="mb-2.5 text-[13px] font-medium text-muted">What's moving</h3>
            <ul className="flex flex-col gap-2.5">
              {b.moves.map((m, i) => {
                const Icon = MOVE_ICON[m.kind] || ChartLineUp;
                return (
                  <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: i * 0.06 }} className="flex items-start gap-3 text-[14.5px] leading-snug">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
                      <Icon size={14} weight="bold" aria-hidden="true" />
                    </span>
                    {m.text}
                  </motion.li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {b.ideas?.length ? (
          <div>
            <h3 className="mb-2.5 text-[13px] font-medium text-muted">Worth posting</h3>
            <ul className="flex flex-col gap-2.5">
              {b.ideas.map((idea, i) => (
                <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.1 + i * 0.06 }} className="flex flex-col gap-1 rounded-2xl bg-sunken px-3.5 py-3">
                  <span className="font-display text-[16.5px] leading-snug">"{idea.title}"</span>
                  <span className="text-[12.5px] text-muted">{idea.why}</span>
                  <Link href={studio ? `/studio/${idea.type}?topic=${encodeURIComponent(idea.title)}${from ? `&from=${from}` : ""}` : "/plans"} className="mt-1 self-start text-[12.5px] font-medium text-accent-deep underline decoration-accent-line underline-offset-2">
                    {studio ? `Make it as a ${STUDIO_TYPES[idea.type]?.label.toLowerCase()}` : "Make it with Studio"}
                  </Link>
                </motion.li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <EvidenceStrip posts={shown.posts} title={shown.title} className="mt-6" />
    </section>
  );
}

const PLATFORM_NAME = (id) => (id === "reddit" ? "Reddit" : platformLabel(id));

// The weekly briefing across every platform where the market talks: what
// moved, the posts taking off, the week's news, and what to post.
function BriefingV2({ briefing, building, studio }) {
  const b = briefing.body;
  const platforms = b.platforms || [];
  const [tab, setTab] = useState("all");
  const here = tab === "all" ? platforms : platforms.filter((p) => p.platform === tab);
  const moves = (b.moves || []).filter((m) => tab === "all" || !m.platform || m.platform === tab);
  const hot = here.flatMap((p) => (p.hot || []).slice(0, tab === "all" ? 2 : 4));
  const ideas = (b.ideas || []).filter((i) => tab === "all" || i.platform === tab);
  const from = (b.findingIds || []).slice(0, 12).join(",");
  if (!platforms.length && !b.news?.length) return null;

  return (
    <section aria-labelledby="briefing" className="rounded-[24px] border border-line bg-surface p-5 sm:p-7" data-briefing="v2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="briefing" className="font-display text-[22px]">
          This week in your market
        </h2>
        <span className="flex items-center gap-2 text-[12.5px] text-muted">
          {building ? "Refreshing…" : briefing.title}
          {b.sample ? <Badge tone="mist">Sample data</Badge> : null}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        From {b.posts.toLocaleString("en-US")} posts on {platforms.map((p) => PLATFORM_NAME(p.platform)).join(", ") || "your platforms"}
        {b.news?.length ? ` and ${b.news.length} news stories` : ""} in the last 7 days{b.thin ? ", an early read" : ""}. Free, every week.
      </p>
      {platforms.length > 1 ? (
        <div role="tablist" aria-label="Platforms" className="no-scrollbar -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1">
          {[{ id: "all", label: "All" }, ...platforms.map((p) => ({ id: p.platform, label: `${PLATFORM_NAME(p.platform)}${p.posts ? ` ${p.posts}` : ""}` }))].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "shrink-0 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                tab === t.id ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          {moves.length ? (
            <div>
              <h3 className="mb-2.5 text-[13px] font-medium text-muted">What's moving</h3>
              <ul className="flex flex-col gap-2.5">
                {moves.map((m, i) => {
                  const Icon = MOVE_ICON[m.kind] || ChartLineUp;
                  return (
                    <motion.li key={`${tab}-${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: i * 0.05 }} className="flex items-start gap-3 text-[14.5px] leading-snug">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
                        <Icon size={14} weight="bold" aria-hidden="true" />
                      </span>
                      {m.text}
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {tab !== "all"
            ? here.map((p) => (
                <div key={p.platform} className="flex flex-col gap-3">
                  {p.topics?.length ? (
                    <div>
                      <h3 className="mb-2 text-[13px] font-medium text-muted">Most talked about</h3>
                      <ul className="flex flex-wrap gap-1.5">
                        {p.topics.map((t) => (
                          <li key={t.topic} className="rounded-full border border-line bg-sunken px-2.5 py-1 text-[12.5px]">
                            {t.topic} <span className="text-muted">· {t.accounts} accounts</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {p.hashtags?.length ? (
                    <p className="text-[13px] text-muted">
                      <span className="font-medium text-ink/80">{p.hashtags.some((h) => h.growthPct != null) ? "Rising tags: " : "Most used tags: "}</span>
                      {p.hashtags.map((h) => `#${h.tag}${h.growthPct != null ? ` (${h.growthPct > 0 ? "+" : ""}${h.growthPct}%)` : h.posts ? ` (${h.posts})` : ""}`).join(", ")}
                    </p>
                  ) : null}
                  {p.sounds?.length ? (
                    <p className="text-[13px] text-muted">
                      <span className="font-medium text-ink/80">Sounds: </span>
                      {p.sounds.map((x) => `"${x.title}"${x.commercial === false ? " (not for brand accounts)" : ""}`).join(", ")}
                    </p>
                  ) : null}
                  {p.note ? <p className="text-[12.5px] text-muted">{p.note}</p> : null}
                  {!p.posts && !p.hashtags?.length ? <p className="text-[13px] text-muted">Quiet week here: little new in your niche.</p> : null}
                </div>
              ))
            : null}
          {ideas.length ? (
            <div>
              <h3 className="mb-2.5 text-[13px] font-medium text-muted">Worth posting</h3>
              <ul className="flex flex-col gap-2.5">
                {ideas.map((idea, i) => (
                  <li key={i} className="flex flex-col gap-1 rounded-2xl bg-sunken px-3.5 py-3">
                    <span className="font-display text-[16.5px] leading-snug">{idea.title}</span>
                    <span className="text-[12.5px] text-muted">{idea.why}</span>
                    <Link href={studio ? `/studio/${idea.type}?topic=${encodeURIComponent(idea.title)}${from ? `&from=${from}` : ""}` : "/plans"} className="mt-1 self-start text-[12.5px] font-medium text-accent-deep underline decoration-accent-line underline-offset-2">
                      {studio ? `Make it as a ${STUDIO_TYPES[idea.type]?.label.toLowerCase() || "post"}` : "Make it with Studio"}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {tab === "all" && b.news?.length ? (
          <div>
            <h3 className="mb-2.5 text-[13px] font-medium text-muted">In the news</h3>
            <ul className="flex flex-col gap-2.5">
              {b.news.map((n) => (
                <li key={n.url} className="text-[14px] leading-snug">
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {n.title}
                  </a>
                  <span className="mt-0.5 block text-[12px] text-muted">
                    {[n.source, n.date].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <EvidenceStrip posts={hot} title="Taking off this week" className="mt-6" />
    </section>
  );
}

/* --------------------------------------------------------------- continue -- */

export function Continue({ account }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!account?.plan) return;
    (async () => {
      const [t, items, reels] = await Promise.all([
        getJson("/api/intel/threads"),
        account.studio ? getJson("/api/studio/items") : Promise.resolve({ items: [] }),
        account.studio ? getJson("/api/studio/reels") : Promise.resolve({ reels: [] }),
      ]);
      setData({
        thread: (t.threads || [])[0] || null,
        items: (items.items || []).filter((i) => i.status !== "ready").slice(0, 3),
        reels: (reels.reels || []).filter((r) => r.status !== "cancelled" && (r.status !== "delivered" || !r.results?.checks?.length)).slice(0, 2),
      });
    })();
  }, [account?.plan, account?.studio]);
  if (!data || (!data.thread && !data.items.length && !data.reels.length)) return null;
  return (
    <section aria-labelledby="continue">
      <h2 id="continue" className="font-display mb-3 text-[22px]">
        Pick up where you left off
      </h2>
      <div className="flex flex-col gap-2.5">
        {data.reels.map((r) => (
          <ReelRow key={r.id} reel={r} />
        ))}
        {data.thread ? (
          <Link href={`/ask?t=${data.thread.id}`} className="group flex items-center gap-4 rounded-[20px] border border-line bg-surface px-4 py-3.5 transition-[transform,border-color] hover:border-line-strong active:scale-[0.99]">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
              <ChatCircleDots size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{data.thread.title}</span>
              <span className="text-[12.5px] text-muted">Conversation, {ago(data.thread.updated_at)}</span>
            </span>
            <ArrowRight size={14} className="text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        ) : null}
        {data.items.map((i) => {
          const Icon = TYPE_ICONS[i.kind];
          return (
            <Link key={i.id} href={`/studio/${i.kind}?id=${i.id}`} className="group flex items-center gap-4 rounded-[20px] border border-line bg-surface px-4 py-3.5 transition-[transform,border-color] hover:border-line-strong active:scale-[0.99]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{i.title}</span>
                <span className="text-[12.5px] text-muted">
                  {STUDIO_TYPES[i.kind]?.label} draft, {ago(i.updated_at)}
                </span>
              </span>
              <ArrowRight size={14} className="text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- quick actions -- */

export function QuickActions({ account, onReport }) {
  const studio = account?.studio;
  const tiles = [
    { href: "/ask", label: "Ask a question", icon: ChatCircleDots },
    { href: "/insights", label: "Run a deep report", icon: ChartLineUp },
    ...(studio
      ? ["creative", "carousel", "reel", "text"].map((t) => ({ href: `/studio/${t}`, label: t === "reel" ? "Request a reel" : `Make a ${STUDIO_TYPES[t].label.toLowerCase()}`, icon: TYPE_ICONS[t] }))
      : [{ href: "/plans", label: "Make content with Studio", icon: TYPE_ICONS.creative }]),
  ];
  return (
    <section aria-label="Quick actions" className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
      {tiles.map((t, i) => {
        const Icon = t.icon;
        const cls = "group flex h-full flex-col items-start gap-3 rounded-[20px] border border-line bg-surface p-4 text-left transition-[transform,border-color,box-shadow] hover:border-line-strong hover:shadow-card active:scale-[0.97]";
        const inner = (
          <>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent-deep transition-transform duration-300 group-hover:-rotate-6">
              <Icon size={17} weight="bold" aria-hidden="true" />
            </span>
            <span className="text-[13.5px] font-medium leading-snug">{t.label}</span>
          </>
        );
        return (
          <motion.div key={t.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.04 }} className="w-[132px] shrink-0 snap-start sm:w-auto">
            {t.href ? (
              <Link href={t.href} className={cls}>
                {inner}
              </Link>
            ) : (
              <button type="button" onClick={t.onClick} className={cx(cls, "w-full")}>
                {inner}
              </button>
            )}
          </motion.div>
        );
      })}
    </section>
  );
}
