"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight } from "@phosphor-icons/react";
import AppShell from "../../components/shell/AppShell";
import Huesy from "../../components/huesy/Huesy";
import { Appear, Badge, Chip, SPRING, Skeleton, cx } from "../../components/ui";
import { GateNote, Locked } from "../../components/plan/PlanBits";
import { StudioLockedTiles, TYPE_ICONS, useSources } from "../../components/studio/StudioBits";
import { CreativeCanvas, Scaled, SlideCanvas } from "../../components/studio/Canvas";
import { ProofBadge } from "../../components/intel/IntelBits";
import { useAccountData } from "../../lib/account";
import { getJson } from "../../lib/stream";
import { STUDIO_TYPES, TEXT_PLATFORM_LABELS } from "../../lib/studio/options";
import { useStore } from "../../lib/store";
import { ago } from "../../lib/when";
import { ReelRow } from "../../components/studio/ReelBits";

export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  );
}


function Studio() {
  const params = useSearchParams();
  const from = params.get("from") || "";
  const sources = useSources(from ? from.split(",") : []);
  const { account, ready } = useAccountData();
  const brandName = useStore((s) => s.brand.brandName);
  const [items, setItems] = useState(null);
  const [reels, setReels] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!account?.studio) return;
    getJson("/api/studio/items").then((r) => {
      if (r.error) setLoadError(r.error);
      else {
        setLoadError(null);
        setItems(r.items || []);
      }
    });
    getJson("/api/studio/reels").then((r) => !r.error && setReels(r.reels || []));
  }, [account?.studio, attempt]);

  const shown = useMemo(() => (items || []).filter((i) => filter === "all" || i.kind === filter), [items, filter]);

  if (ready && account && !account.studio) {
    return (
      <AppShell title="Studio">
        <Locked
          need="studio"
          title="Make content from what's working"
          body="Studio turns what Huesy learns into finished pieces: creatives, carousels and posts made here in minutes, and reels made for you within a day. Every piece follows a pattern measured in your niche, and shows its proof."
        >
          <StudioLockedTiles />
        </Locked>
      </AppShell>
    );
  }

  const left = (k) => account?.allowances?.[k];

  return (
    <AppShell title="Studio">
      <div className="flex flex-col gap-10">
        {sources.length ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-mist bg-mist-soft px-5 py-4">
            <p className="min-w-0 flex-1 text-[14px] text-mist-deep">
              <span className="font-medium">Making from what you picked:</span> {sources[0].statement}
              {sources.length > 1 ? ` (and ${sources.length - 1} more)` : ""}
            </p>
          </div>
        ) : null}

        <section aria-labelledby="make">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 id="make" className="font-display text-[22px]">
              What shall we make?
            </h2>
            {account?.periodEnd ? <span className="text-[12.5px] text-muted">Resets {new Date(account.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {["creative", "carousel", "reel", "text"].map((type, i) => {
              const Icon = TYPE_ICONS[type];
              const a = left(type);
              const out = a && a.left <= 0;
              return (
                <motion.div key={type} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.05 }}>
                  <Link
                    href={`/studio/${type}${from ? `?from=${from}` : ""}`}
                    aria-disabled={out || undefined}
                    tabIndex={out ? -1 : undefined}
                    className={cx(
                      "group flex h-full flex-col gap-4 rounded-[22px] border p-5 transition-[transform,border-color,box-shadow]",
                      out ? "pointer-events-none border-line bg-sunken opacity-70" : "border-line bg-surface hover:border-line-strong hover:shadow-card active:scale-[0.98]"
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-deep transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
                        <Icon size={20} weight="bold" aria-hidden="true" />
                      </span>
                      <span className="tabular text-[12.5px] text-muted">
                        {a ? (
                          <>
                            <span className="font-medium text-ink">{a.left}</span> of {a.limit} left
                          </>
                        ) : account?.text ? (
                          `${account.text.usedToday} written today`
                        ) : null}
                      </span>
                    </span>
                    <span>
                      <span className="block text-[16px] font-medium">{STUDIO_TYPES[type].label === "Post" ? "Post" : STUDIO_TYPES[type].label}</span>
                      <span className="mt-1 block text-[13px] leading-snug text-muted max-sm:hidden">{STUDIO_TYPES[type].blurb}</span>
                    </span>
                    <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-deep">
                      {out ? `Used up, back on ${account?.periodEnd ? new Date(account.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "your next month"}` : type === "reel" ? "Request a reel" : `Make a ${STUDIO_TYPES[type].label.toLowerCase()}`}
                      {!out ? <ArrowRight size={13} weight="bold" className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>

        {reels?.length ? (
          <section aria-labelledby="reels">
            <h2 id="reels" className="font-display mb-4 text-[22px]">
              Your reels
            </h2>
            <ul className="flex flex-col gap-2.5">
              {reels.map((r, i) => (
                <Appear key={r.id} index={i} as="li">
                  <ReelRow reel={r} />
                </Appear>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="library-title" id="library" className="scroll-mt-24">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="library-title" className="font-display text-[22px]">
              Library
            </h2>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {[
                ["all", "Everything"],
                ["creative", "Creatives"],
                ["carousel", "Carousels"],
                ["text", "Posts"],
              ].map(([id, label]) => (
                <Chip key={id} selected={filter === id} onClick={() => setFilter(id)} className="shrink-0">
                  {label}
                </Chip>
              ))}
            </div>
          </div>
          {items === null && loadError ? (
            <GateNote error={{ ...loadError, message: "I couldn't load your Library." }} onRetry={() => setAttempt((n) => n + 1)} />
          ) : items === null ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="aspect-[4/5] rounded-[20px]" />
              ))}
            </div>
          ) : !shown.length ? (
            <div className="flex items-center gap-4 rounded-[20px] border border-dashed border-line-strong px-5 py-6">
              <Huesy mood="sleepy" size={40} />
              <p className="text-[14px] text-muted">{items.length ? "Nothing of that kind yet." : "Everything you make lands here, drafts included. Start with a creative: it takes about two minutes."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {shown.map((item, i) => (
                <Appear key={item.id} index={i}>
                  <LibraryCard item={item} brandName={brandName} />
                </Appear>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function LibraryCard({ item, brandName }) {
  const b = item.body || {};
  const visual = b.visuals?.[b.active ?? 0];
  return (
    <Link href={`/studio/${item.kind}?id=${item.id}`} className="group flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface transition-[transform,border-color,box-shadow] hover:border-line-strong hover:shadow-card active:scale-[0.98]">
      <div className="pointer-events-none overflow-hidden border-b border-line bg-sunken">
        {item.kind === "creative" && (b.chosen || b.headline || b.concepts?.length) ? (
          <Scaled aspect={b.aspect || "4:5"} label="">
            <CreativeCanvas aspect={b.aspect || "4:5"} layout={b.layout || b.concepts?.[0]?.layout} theme={b.theme} headline={b.headline || b.concepts?.[0]?.headline} subline={b.subline ?? b.concepts?.[0]?.subline} image={visual?.url} brandName={brandName} />
          </Scaled>
        ) : item.kind === "carousel" && b.slides?.length ? (
          <Scaled aspect={b.aspect || "4:5"} label="">
            <SlideCanvas slide={b.slides[0]} index={0} total={b.slides.length} aspect={b.aspect || "4:5"} theme={b.theme} brandName={brandName} />
          </Scaled>
        ) : (
          <div className="flex aspect-[4/5] flex-col gap-2 p-4 text-[12.5px] leading-snug text-ink/80">
            <span className="text-[11.5px] font-medium text-muted">{TEXT_PLATFORM_LABELS[b.platform] || "Idea"}</span>
            <span className="line-clamp-[9] whitespace-pre-wrap">{String(b.text || b.concepts?.[0]?.headline || "").replace(/===\w+===\n?/g, "")}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <span className="line-clamp-1 text-[13.5px] font-medium">{item.title}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
          <span>{STUDIO_TYPES[item.kind]?.label}</span>
          {item.status === "ready" ? <Badge tone="accent">Ready</Badge> : item.counted || item.kind === "text" ? null : <Badge>{item.kind === "creative" ? "Ideas, not counted" : "Outline, not counted"}</Badge>}
          <span className="text-faint">{ago(item.updated_at)}</span>
        </span>
        {b.proof ? <ProofBadge proof={b.proof} className="self-start" /> : null}
      </div>
    </Link>
  );
}
