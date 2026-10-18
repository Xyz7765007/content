"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, CaretDown, ChartLineUp, FilmSlate, Images, LockSimple, PaintBrushBroad, Stop, TextAa } from "@phosphor-icons/react";
import { Badge, Button, SPRING, cx } from "../ui";
import Huesy from "../huesy/Huesy";
import Markdown from "../Markdown";
import { CostTag } from "../plan/PlanBits";
import { EvidenceStrip, Steps } from "../intel/IntelBits";
import { platformLabel } from "../../lib/intel/taxonomy";

/* ------------------------------------------------------------ suggestions -- */

export function suggestionsFor(brand) {
  const intel = brand?.intel || {};
  const kw = (intel.keywords?.[0] || brand?.product || "your niche").toLowerCase();
  const [p1 = "instagram", p2 = "tiktok"] = intel.platforms?.length ? intel.platforms : ["instagram", "tiktok"];
  const rival = Object.values(intel.competitors || {}).flat()[0];
  return [
    `What's working on ${platformLabel(p1)} for ${kw} right now?`,
    `What's trending on ${platformLabel(p2 === p1 ? "tiktok" : p2)} this week?`,
    `What do people ask about ${kw}?`,
    rival ? `How is @${String(rival).replace(/^@/, "")} doing?` : `Which openings get the most reach in ${kw}?`,
    `Which creators in ${kw} should we work with?`,
    `Give me a full content playbook for ${platformLabel(p1)}`,
  ];
}

export function Suggestions({ brand, onPick, disabled }) {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestionsFor(brand).map((q, i) => (
        <motion.button
          key={q}
          type="button"
          disabled={disabled}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.05 + i * 0.04 }}
          onClick={() => onPick(q)}
          className="rounded-full border border-line bg-surface px-3.5 py-2 text-left text-[13.5px] text-ink/85 transition-[transform,border-color,background-color] hover:border-line-strong hover:bg-raised active:scale-[0.97] disabled:opacity-50 pointer-coarse:min-h-11"
        >
          {q}
        </motion.button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- messages -- */

export function UserBubble({ children }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-[8px] bg-ink px-4 py-2.5 text-[15px] leading-relaxed text-canvas">{children}</p>
    </div>
  );
}

const REPORT_NAMES = {
  trends: "Trend radar",
  playbook: "Content playbook",
  competitors: "Competitor breakdown",
  audience: "Audience voice",
  creators: "Creator shortlist",
};

export function ProposalCard({ proposal, onRun, running, afford }) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-accent-line bg-accent-soft/60 p-4 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-accent-deep">
        <ChartLineUp size={18} weight="bold" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium text-ink">
          {REPORT_NAMES[proposal.kind]}
          {proposal.platform ? ` on ${platformLabel(proposal.platform)}` : ""}
        </p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{proposal.reason}</p>
      </div>
      <span className="flex flex-col items-start gap-1 self-start sm:items-end sm:self-center">
        <Button size="sm" onClick={onRun} loading={running} disabled={running || (!afford && !proposal.free)}>
          Run it
          <CostTag credits={proposal.credits} free={proposal.free} />
        </Button>
        {!afford && !proposal.free ? <span className="text-[12px] text-danger">Not enough credits left this month</span> : null}
      </span>
    </div>
  );
}

const MAKE = [
  { type: "creative", label: "Creative", icon: Images },
  { type: "carousel", label: "Carousel", icon: PaintBrushBroad },
  { type: "reel", label: "Reel", icon: FilmSlate },
  { type: "text", label: "Post", icon: TextAa },
];

export function MakeFromThis({ findingIds, studio }) {
  if (!findingIds?.length) return null;
  const from = findingIds.slice(0, 12).join(",");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[12.5px] text-muted">Make from this</span>
      {MAKE.map(({ type, label, icon: Icon }) => (
        <Link
          key={type}
          href={studio ? `/studio/${type}?from=${from}` : "/plans"}
          title={studio ? undefined : "Making content is part of Studio"}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink transition-[transform,border-color] hover:border-line-strong active:scale-[0.97] pointer-coarse:min-h-11"
        >
          {studio ? <Icon size={14} aria-hidden="true" /> : <LockSimple size={13} className="text-muted" aria-hidden="true" />}
          {label}
        </Link>
      ))}
    </div>
  );
}

// One answer: how it was worked out, the answer, the posts behind it, and
// what to do next.
export function Answer({ text, steps, live, evidence, proposal, findingIds, sample, credits, note, studio, onRunProposal, runningProposal, afford, streaming }) {
  const [showSteps, setShowSteps] = useState(false);
  const reduced = useReducedMotion();
  const thinking = live && !text;
  return (
    <div className="flex gap-3">
      <div className="hidden pt-0.5 sm:block">
        <Huesy mood={thinking ? "watch" : streaming ? "write" : "idle"} size={30} track={false} />
      </div>
      <div className="min-w-0 flex-1">
        {live && steps?.length ? (
          <Steps steps={steps} live className="mb-3" />
        ) : !live && steps?.length ? (
          <button
            type="button"
            onClick={() => setShowSteps((v) => !v)}
            aria-expanded={showSteps}
            className="mb-2 inline-flex items-center gap-1 text-[12.5px] text-muted transition-colors hover:text-ink"
          >
            How I worked this out
            <CaretDown size={11} weight="bold" className={cx("transition-transform", showSteps && "rotate-180")} aria-hidden="true" />
          </button>
        ) : null}
        <AnimatePresence initial={false}>
          {!live && showSteps ? (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
              <Steps steps={steps} className="mb-3" />
            </motion.div>
          ) : null}
        </AnimatePresence>
        {thinking && !steps?.length ? <p className="text-[14px] text-muted">Thinking about where to look…</p> : null}
        {text ? (
          <motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <Markdown>{text}</Markdown>
          </motion.div>
        ) : null}
        {!streaming && (evidence?.length || proposal || findingIds?.length || note) ? (
          <div className="mt-4 flex flex-col gap-4">
            {note ? <p className="rounded-2xl bg-mist-soft px-3.5 py-2.5 text-[13px] text-mist-deep">{note}</p> : null}
            <EvidenceStrip posts={evidence} />
            {proposal ? <ProposalCard proposal={proposal} onRun={onRunProposal} running={runningProposal} afford={afford?.(proposal.credits)} /> : null}
            <MakeFromThis findingIds={findingIds} studio={studio} />
          </div>
        ) : null}
        {!streaming && (credits != null || sample) ? (
          <p className="mt-3 flex items-center gap-2 text-[12px] text-faint">
            {credits != null ? <span>{credits ? `${credits} credits` : "Free"}</span> : null}
            {sample ? <Badge tone="mist">Sample data</Badge> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- composer -- */

export function Composer({ value, onChange, onSend, onStop, busy, stoppable = true, disabled, price, credits, resets, inputRef }) {
  const local = useRef(null);
  const ref = inputRef || local;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(180, el.scrollHeight)}px`;
  }, [value, ref]);
  const short = credits != null && credits < price;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && value.trim()) onSend();
      }}
      className="rounded-[22px] border border-line-strong bg-raised p-2 shadow-card focus-within:border-accent-deep focus-within:ring-4 focus-within:ring-accent/30"
    >
      <label htmlFor="ask-input" className="sr-only">
        Ask Huesy about your market
      </label>
      <textarea
        id="ask-input"
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!busy && value.trim()) onSend();
          }
        }}
        disabled={disabled}
        placeholder="Ask about trends, competitors, your audience or what to post"
        className="block max-h-[180px] w-full resize-none bg-transparent px-3 pt-2 pb-1 text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint"
      />
      <div className="flex items-center justify-between gap-3 px-1.5 pt-1">
        <span className={cx("text-[12px]", short ? "text-danger" : "text-faint pointer-coarse:invisible")}>
          {short ? `You have ${credits} credits left. They reset${resets ? ` on ${resets}` : " with your next month"}.` : "Enter to send, Shift and Enter for a new line"}
        </span>
        {/* Separate keys: Stop and Ask must never be the same button, or the
            click that stops an answer would land on Ask and send it again. */}
        {busy ? (
          <Button key="stop" type="button" size="sm" variant="quiet" onClick={onStop} disabled={!stoppable} title={stoppable ? undefined : "One moment"}>
            <Stop size={13} weight="fill" />
            Stop
          </Button>
        ) : (
          <Button key="ask" type="submit" size="sm" disabled={disabled || !value.trim() || short}>
            Ask
            <CostTag credits={price} />
            <ArrowUp size={13} weight="bold" />
          </Button>
        )}
      </div>
    </form>
  );
}
