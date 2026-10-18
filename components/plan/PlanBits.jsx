"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { Coins, LockSimple } from "@phosphor-icons/react";
import { Button, ErrorNote, Sheet, cx } from "../ui";
import Huesy from "../huesy/Huesy";
import { PLANS, PRICES, creditsLabel, formatCredits, resetDate, useAccountData } from "../../lib/account";
import { STUDIO_TYPES } from "../../lib/studio/options";

/* ---------------------------------------------------------------- the tag --
   What an action costs, said on the button that does it.
----------------------------------------------------------------------------- */

export function CostTag({ credits, free, included, className }) {
  const text = free ? "Free" : included ? "Included" : creditsLabel(credits);
  return (
    <span
      className={cx(
        "tabular inline-flex items-center gap-1 rounded-full px-2 py-[1px] text-[11.5px] font-medium",
        free || included ? "bg-mist-soft text-mist-deep" : "bg-[#141414]/[0.07] text-current dark:bg-white/10",
        className
      )}
    >
      {!free && !included ? <Coins size={11} weight="fill" aria-hidden="true" /> : null}
      {text}
    </span>
  );
}

// What a Studio step uses from the month, said on its button.
export function AllowanceTag({ kind, className }) {
  const names = { creative: "creative", carousel: "carousel", reel: "reel" };
  return (
    <span className={cx("inline-flex items-center rounded-full bg-[#141414]/[0.07] px-2 py-[1px] text-[11.5px] font-medium dark:bg-white/10", className)}>
      Uses 1 {names[kind]}
    </span>
  );
}

/* -------------------------------------------------------------- the meter --
   Credits left this month, and for Studio what's left of each allowance.
   Opens a sheet with the whole month and what everything costs.
----------------------------------------------------------------------------- */

const ACTION_ROWS = [
  ["ask", "A question in Ask"],
  ["report", "A deep report (your first is free)"],
  ["creators", "A creator search"],
  ["contact", "A creator's contact details"],
  ["radar", "Checking a watchlist"],
];

export function PlanMeter({ compact = false, className }) {
  const { account, ready } = useAccountData();
  const [open, setOpen] = useState(false);
  if (!ready || !account) return compact ? null : <div className={cx("skeleton h-[74px] rounded-2xl", className)} />;

  if (!account.plan) {
    return compact ? (
      <Link
        href="/plans"
        className={cx("flex h-8 items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-3 text-[12.5px] font-medium text-accent-deep pointer-coarse:h-10", className)}
      >
        Choose a plan
      </Link>
    ) : (
      <Link href="/plans" className={cx("block rounded-2xl border border-accent-line bg-accent-soft p-3.5 transition-transform active:scale-[0.98]", className)}>
        <p className="text-[13px] font-medium text-accent-deep">Choose a plan</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted">Asking, reports and Studio open with a plan.</p>
      </Link>
    );
  }

  const share = account.creditsPerPeriod ? account.credits / account.creditsPerPeriod : 0;
  const low = account.credits < PRICES.ask;

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${creditsLabel(account.credits)} left. Open your month`}
          className={cx(
            "tabular flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-transform active:scale-[0.96] pointer-coarse:h-10",
            low ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-surface text-ink",
            className
          )}
        >
          <Coins size={13} weight="fill" className={low ? "" : "text-accent-deep"} aria-hidden="true" />
          {account.credits >= 10000 ? `${(account.credits / 1000).toFixed(1)}k` : formatCredits(account.credits)}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cx("w-full rounded-2xl border border-line bg-surface p-3.5 text-left transition-[transform,border-color] hover:border-line-strong active:scale-[0.98]", className)}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] text-muted">{account.planName}</span>
            <span className="text-[11.5px] text-faint">Resets {resetDate(account)}</span>
          </span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className={cx("font-display tabular text-[22px] leading-none", low ? "text-danger" : "text-ink")}>{formatCredits(account.credits)}</span>
            <span className="text-[12px] text-muted">credits</span>
          </span>
          <span className="mt-2.5 block h-1 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <motion.span
              className={cx("block h-full rounded-full", low ? "bg-danger" : "bg-accent")}
              initial={false}
              animate={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }}
              transition={{ type: "spring", bounce: 0, duration: 0.6 }}
            />
          </span>
          {account.allowances ? (
            <span className="mt-2.5 flex gap-3 text-[11.5px] text-muted">
              {Object.entries(account.allowances).map(([k, a]) => (
                <span key={k} className="tabular">
                  <span className="font-medium text-ink">{a.left}</span> {STUDIO_TYPES[k]?.plural.toLowerCase()}
                </span>
              ))}
            </span>
          ) : null}
        </button>
      )}
      <MonthSheet open={open} onClose={() => setOpen(false)} account={account} />
    </>
  );
}

function MonthSheet({ open, onClose, account }) {
  const plan = PLANS[account.plan];
  return (
    <Sheet open={open} onClose={onClose} title="Your month" width={460}>
      <div className="flex flex-col gap-7">
        <section>
          <p className="text-[13px] text-muted">
            {plan.name} plan · resets {resetDate(account)}
          </p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="font-display tabular text-[40px] leading-none">{formatCredits(account.credits)}</span>
            <span className="text-sm text-muted">of {formatCredits(account.creditsPerPeriod)} credits left</span>
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Credits pay for asking and research. If something fails or finds nothing, the credits come straight back.
          </p>
        </section>

        {account.allowances ? (
          <section>
            <h3 className="text-[13px] font-medium text-ink">Studio this month</h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {Object.entries(account.allowances).map(([k, a]) => (
                <li key={k} className="flex items-center justify-between gap-3 text-[14px]">
                  <span>{STUDIO_TYPES[k]?.plural}</span>
                  <span className="tabular text-muted">
                    <span className="font-medium text-ink">{a.left}</span> of {a.limit} left
                  </span>
                </li>
              ))}
              {account.text ? (
                <li className="flex items-center justify-between gap-3 text-[14px]">
                  <span>Posts written today</span>
                  <span className="tabular text-muted">
                    <span className="font-medium text-ink">{account.text.usedToday}</span> of {account.text.perDay}
                  </span>
                </li>
              ) : null}
            </ul>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">The research behind everything you make in Studio is included.</p>
          </section>
        ) : null}

        <section>
          <h3 className="text-[13px] font-medium text-ink">What things cost</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {ACTION_ROWS.map(([id, label]) => (
              <li key={id} className="flex items-center justify-between gap-3 text-[14px]">
                <span className="text-muted">{label}</span>
                <CostTag credits={PRICES[id]} />
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 text-[14px]">
              <span className="text-muted">Your weekly briefing</span>
              <CostTag free />
            </li>
          </ul>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button as={Link} href="/profile?tab=account" variant="quiet" size="sm" onClick={onClose}>
            Credit history
          </Button>
          {!account.studio ? (
            <Button as={Link} href="/plans" size="sm" onClick={onClose}>
              See Studio
            </Button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- gates --
   Every refusal says what happened and offers the one next step.
----------------------------------------------------------------------------- */

const NEXT = {
  no_plan: { label: "See plans", href: "/plans" },
  studio_only: { label: "See Studio", href: "/plans" },
  seats_full: { label: "See plans", href: "/plans" },
  no_credits: { label: "Your month", href: "/profile?tab=account" },
  allowance_used: { label: "Open Library", href: "/studio#library" },
};

export function GateNote({ error, onRetry, retryLabel, className }) {
  if (!error) return null;
  const next = NEXT[error.code];
  const retryable = !next && !["bad_request", "not_found", "text_fair_use", "declined"].includes(error.code);
  return (
    <ErrorNote
      className={className}
      onRetry={retryable ? onRetry : undefined}
      retryLabel={retryLabel || (error.code === "dropped" ? "Look again" : undefined)}
      action={
        next ? (
          <Button as={Link} href={next.href} size="sm" variant="quiet">
            {next.label}
          </Button>
        ) : null
      }
    >
      {error.message}
    </ErrorNote>
  );
}

// A whole screen that needs a plan (or Studio) the person doesn't have.
export function Locked({ need = "any", title, body, children }) {
  const { account } = useAccountData();
  const seats = account?.seats;
  const studio = need === "studio";
  return (
    <div className="overflow-hidden rounded-[24px] border border-line bg-surface">
      <div className="aurora grain relative px-6 py-10 sm:px-10 sm:py-12">
        <div className="flex items-center gap-3">
          <Huesy mood="idle" size={56} />
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface/80 text-muted">
            <LockSimple size={15} weight="bold" aria-hidden="true" />
          </span>
        </div>
        <h2 className="display-lg mt-5 max-w-[24ch] text-[28px] sm:text-[32px]">{title}</h2>
        {body ? <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-muted">{body}</p> : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button as={Link} href="/plans" size="lg">
            {studio ? "See Studio" : "See plans"}
          </Button>
          {studio && seats ? (
            <span className="text-[13px] text-muted">
              {seats.left > 0 ? `${seats.left} of ${seats.limit} Studio seats left` : "Studio seats are full right now"}
            </span>
          ) : null}
        </div>
      </div>
      {children ? <div className="border-t border-line p-6 sm:p-8">{children}</div> : null}
    </div>
  );
}
