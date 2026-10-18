"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, Clock, Coins, Sparkle } from "@phosphor-icons/react";
import AppShell from "../../components/shell/AppShell";
import Huesy from "../../components/huesy/Huesy";
import { Badge, Button, Field, SPRING, Sheet, Textarea, cx, toast } from "../../components/ui";
import { GateNote } from "../../components/plan/PlanBits";
import { PLANS, PRICES, formatCredits, useAccount, useAccountData } from "../../lib/account";

const INCLUDES = {
  tier1: [
    "Ask anything about your market, answered from real posts",
    "Deep reports: trends, a content playbook, competitors, your audience",
    "Creator shortlists with contact details",
    "A free briefing every week",
    `${formatCredits(PLANS.tier1.credits)} credits a month`,
  ],
  tier2: [
    "Everything in Intelligence",
    "10 creatives and 10 carousels a month, made from what's working",
    "3 reels a month, made for you within 24 hours",
    "Captions, posts, threads and newsletters, up to 30 a day",
    `${formatCredits(PLANS.tier2.credits)} credits a month`,
  ],
};

/**
 * Two plans, side by side, with what each includes. While payments aren't
 * switched on, choosing a plan sends a request and the plan starts when it
 * is approved; the page says so before and after.
 */
export default function PlansPage() {
  const { account, ready } = useAccountData();
  const requestPlan = useAccount((s) => s.requestPlan);
  const [chosen, setChosen] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pending = account?.pendingRequest;
  const seats = account?.seats;
  const studioFull = seats && seats.left <= 0 && account?.plan !== "tier2";

  const send = async () => {
    setBusy(true);
    setError(null);
    const r = await requestPlan(chosen, note);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    toast(`Asked for ${PLANS[chosen].name}. I'll switch it on as soon as it's approved.`, { tone: "good" });
    setChosen(null);
  };

  return (
    <AppShell title="Plans">
      <div className="flex flex-col gap-8">
        <section className="flex items-center gap-4">
          <Huesy mood={account?.plan ? "found" : "idle"} size={52} />
          <div className="min-w-0">
            <h2 className="display-lg text-[26px] sm:text-[30px]">
              {account?.plan ? `You're on ${PLANS[account.plan].name}` : "Pick how you'd like to use Huesy"}
            </h2>
            <p className="mt-1 max-w-[62ch] text-[14.5px] text-muted">
              {account?.plan
                ? "Everything you've learned and made stays with you if you change plans."
                : "Your brand and everything you set up stay right here, whichever you choose."}
            </p>
          </div>
        </section>

        {pending ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-mist bg-mist-soft px-5 py-4" role="status">
            <Clock size={18} className="shrink-0 text-mist-deep" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-[14px] text-mist-deep">
              You asked for {PLANS[pending.plan]?.name} on {new Date(pending.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.
              It starts as soon as it's approved, and you'll see it here.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {["tier1", "tier2"].map((id, i) => {
            const plan = PLANS[id];
            const current = account?.plan === id;
            const full = id === "tier2" && studioFull;
            return (
              <motion.section
                key={id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: i * 0.06 }}
                className={cx(
                  "relative flex flex-col rounded-[24px] border p-6 sm:p-7",
                  id === "tier2" ? "aurora grain overflow-hidden border-accent-line bg-surface" : "border-line bg-surface"
                )}
                aria-labelledby={`plan-${id}`}
              >
                <div className="relative flex items-start justify-between gap-3">
                  <div>
                    <h3 id={`plan-${id}`} className="font-display text-[26px] leading-none">
                      {plan.name}
                    </h3>
                    <p className="mt-2 text-[14px] text-muted">{plan.blurb}</p>
                  </div>
                  {current ? <Badge tone="solid" className="shrink-0 whitespace-nowrap">Your plan</Badge> : id === "tier2" && seats ? <Badge tone="accent" className="shrink-0 whitespace-nowrap">{full ? "Seats full" : `${seats.left} of ${seats.limit} seats left`}</Badge> : null}
                </div>
                <p className="relative mt-5 flex items-baseline gap-1.5">
                  <span className="font-display tabular text-[44px] leading-none">${plan.price}</span>
                  <span className="text-[14px] text-muted">a month</span>
                </p>
                <ul className="relative mt-6 flex flex-col gap-2.5">
                  {INCLUDES[id].map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-[14.5px] leading-snug">
                      <Check size={15} weight="bold" className="mt-[3px] shrink-0 text-accent-deep" aria-hidden="true" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="relative mt-auto pt-7">
                  {!ready ? (
                    <div className="skeleton h-12 rounded-full" />
                  ) : current ? (
                    <Button as={Link} href={id === "tier2" ? "/studio" : "/ask"} variant="quiet" size="lg" className="w-full">
                      {id === "tier2" ? "Open Studio" : "Ask something"}
                    </Button>
                  ) : full ? (
                    <Button size="lg" variant="quiet" className="w-full" onClick={() => setChosen(id)}>
                      Join the Studio list
                    </Button>
                  ) : (
                    <Button size="lg" variant={id === "tier2" ? "primary" : "quiet"} className="w-full" onClick={() => setChosen(id)} disabled={pending?.plan === id}>
                      {pending?.plan === id ? "Requested" : account?.plan ? `Switch to ${plan.name}` : `Choose ${plan.name}`}
                    </Button>
                  )}
                </div>
              </motion.section>
            );
          })}
        </div>

        <section className="grid gap-6 rounded-[24px] border border-line bg-surface p-6 sm:grid-cols-[1fr_1.2fr] sm:p-7">
          <div>
            <h3 className="font-display flex items-center gap-2 text-[21px]">
              <Coins size={18} weight="fill" className="text-accent-deep" aria-hidden="true" />
              How credits work
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Credits pay for research. You see the price on the button before anything runs, and when something
              fails or finds nothing, the credits come straight back. They reset each month.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
            {[
              ["A question", PRICES.ask],
              ["A deep report", PRICES.report],
              ["A creator search", PRICES.creators],
              ["Checking a watchlist", PRICES.radar],
              ["A creator's contact", PRICES.contact],
            ].map(([label, n]) => (
              <li key={label} className="flex flex-col">
                <span className="text-muted">{label}</span>
                <span className="tabular font-medium">{formatCredits(n)} credits</span>
              </li>
            ))}
            <li className="flex flex-col">
              <span className="text-muted">Your first report</span>
              <span className="font-medium">Free</span>
            </li>
          </ul>
        </section>

        <Sheet
          open={Boolean(chosen)}
          onClose={() => setChosen(null)}
          title={chosen === "tier2" && studioFull ? "Join the Studio list" : chosen ? `Ask for ${PLANS[chosen].name}` : ""}
          width={480}
          footer={
            <div className="flex flex-wrap gap-2">
              <Button onClick={send} loading={busy} disabled={busy}>
                <Sparkle size={15} weight="fill" />
                Send request
              </Button>
              <Button variant="ghost" onClick={() => setChosen(null)}>
                Not now
              </Button>
            </div>
          }
        >
          {account?.plan === "tier2" && chosen === "tier1" ? (
            <p className="text-[14px] leading-relaxed text-muted">
              Moving to Intelligence keeps your credits, everything you've learned and everything in your Library. Making new
              creatives, carousels, posts and reels stops at the switch; reels you've already sent are still made and delivered.
            </p>
          ) : (
            <p className="text-[14px] leading-relaxed text-muted">
              Huesy is opening plan by plan. Send this and your plan starts as soon as it's approved, usually within a
              day. Nothing is charged here.
            </p>
          )}
          <Field label="Anything we should know?" htmlFor="plan-note" hint="Optional." className="mt-5">
            <Textarea id="plan-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="We post on Instagram and TikTok, about four times a week." />
          </Field>
          <GateNote error={error} className="mt-4" />
        </Sheet>
      </div>
    </AppShell>
  );
}
