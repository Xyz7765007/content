"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "@phosphor-icons/react";
import AppShell from "../../components/shell/AppShell";
import { Card, Field, Input, SPRING, SectionTitle, Tabs } from "../../components/ui";
import { BrandInfoForm, PlatformPersonalityForm, ReferencesForm, TargetsForm } from "../../components/brand/forms";
import LogoutButton from "../../components/auth/LogoutButton";
import ThemeSwitch from "../../components/ThemeSwitch";
import { useSession } from "../../components/auth/useSession";
import { useHydrated, useStore } from "../../lib/store";
import IntelForm from "../../components/brand/IntelForm";
import { Badge, Button } from "../../components/ui";
import { PLANS, formatCredits, resetDate, useAccountData } from "../../lib/account";
import { getJson } from "../../lib/stream";
import { STUDIO_TYPES } from "../../lib/studio/options";

const TABS = [
  { id: "brand", label: "Brand" },
  { id: "market", label: "Market" },
  { id: "tone", label: "Platforms and tone" },
  { id: "examples", label: "Examples" },
  { id: "watch", label: "Watchlists" },
  { id: "account", label: "Plan and account" },
];

export default function BrandPage() {
  return (
    <Suspense fallback={null}>
      <Brand />
    </Suspense>
  );
}

function Brand() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const [tab, setTab] = useState(TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "brand");
  // A link to a tab (for example "Credit history") works from this page too.
  const wanted = params.get("tab");
  useEffect(() => {
    if (TABS.some((t) => t.id === wanted)) setTab(wanted);
  }, [wanted]);
  const brand = useStore((s) => s.brand);
  const setBrand = useStore((s) => s.setBrand);
  const targets = useStore((s) => s.targets);
  const setTargets = useStore((s) => s.setTargets);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const searches = useStore((s) => s.searches);
  const saves = useStore((s) => s.saves);
  const drafts = useStore((s) => s.drafts);
  const updatedAt = useStore((s) => s.updatedAt);

  if (!hydrated) {
    return (
      <AppShell title="Brand">
        <div className="skeleton h-72 rounded-[20px]" />
      </AppShell>
    );
  }

  const posts = Object.values(drafts || {}).reduce((n, d) => n + Object.keys(d || {}).length, 0);

  return (
    <AppShell title="Brand">
      <div className="flex flex-col gap-6">
        <Card className="aurora grain relative overflow-hidden p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="font-display flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] border border-line-strong bg-raised text-[24px] text-ink"
              >
                {(brand.brandName || "?").trim().charAt(0).toUpperCase()}
              </span>
              <div>
                <h2 className="font-display text-[24px] leading-tight">{brand.brandName || "Your brand"}</h2>
                <p className="mt-1 text-[14px] text-muted">{brand.product || "Add what you sell"}</p>
              </div>
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="Watchlists" value={searches.length} />
              <Stat label="Posts written" value={posts} />
              <Stat label="Saved" value={saves.length} />
            </dl>
          </div>
        </Card>

        <div className="no-scrollbar -mx-1 overflow-x-auto px-1 pb-1">
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
            <Card className="p-5 sm:p-8">
              {tab === "brand" ? <BrandInfoForm brand={brand} setBrand={setBrand} /> : null}
              {tab === "market" ? (
                <>
                  <p className="mb-6 max-w-[62ch] text-sm text-muted">
                    This is what every answer, report and piece of content is researched against. The clearer it is, the sharper they get.
                  </p>
                  <IntelForm brand={brand} setBrand={setBrand} />
                </>
              ) : null}
              {tab === "tone" ? <PlatformPersonalityForm brand={brand} setBrand={setBrand} /> : null}
              {tab === "examples" ? <ReferencesForm brand={brand} setBrand={setBrand} /> : null}
              {tab === "watch" ? (
                <>
                  <p className="mb-5 text-sm text-muted">
                    This is what new watchlists start from. Each watchlist can still watch something different.
                  </p>
                  <TargetsForm targets={targets} setTargets={setTargets} />
                </>
              ) : null}
              {tab === "account" ? <Account settings={settings} setSettings={setSettings} /> : null}
            </Card>
          </motion.div>
        </AnimatePresence>

        <SavedHint at={updatedAt} />
      </div>
    </AppShell>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="meta">{label}</dt>
      <dd className="font-display tabular mt-1 text-[24px] leading-none">{value}</dd>
    </div>
  );
}

// Changes save as they are typed; this says so, quietly, right after one.
function SavedHint({ at }) {
  const [recent, setRecent] = useState(false);
  const first = useRef(at);
  useEffect(() => {
    if (at === first.current) return undefined;
    setRecent(true);
    const t = setTimeout(() => setRecent(false), 2500);
    return () => clearTimeout(t);
  }, [at]);
  return (
    <p className="flex h-5 items-center gap-1.5 text-[13px] text-muted" aria-live="polite">
      {recent ? <Check size={13} weight="bold" className="text-accent-deep" /> : null}
      {recent ? "Saved" : "Changes save as you type."}
    </p>
  );
}

function PlanSection() {
  const { account } = useAccountData();
  const [history, setHistory] = useState(null);
  useEffect(() => {
    if (account?.plan) getJson("/api/account?history=1").then((r) => setHistory(r.error ? "error" : r.history || []));
  }, [account?.plan, account?.credits]);
  if (!account) return <div className="skeleton h-40 rounded-[20px]" />;
  if (!account.plan) {
    return (
      <section>
        <SectionTitle sub="Asking, reports and Studio open with a plan. Everything you've set up stays.">Plan</SectionTitle>
        <Button as={Link} href="/plans">
          See plans
        </Button>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-5">
      <SectionTitle sub={`${PLANS[account.plan].name}, $${PLANS[account.plan].price} a month. Credits reset on ${resetDate(account)}.`}>Plan and credits</SectionTitle>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl bg-sunken p-3.5">
          <dt className="meta">Credits left</dt>
          <dd className="font-display tabular mt-1 text-[24px] leading-none">{formatCredits(account.credits)}</dd>
        </div>
        {account.allowances
          ? Object.entries(account.allowances).map(([k, a]) => (
              <div key={k} className="rounded-2xl bg-sunken p-3.5">
                <dt className="meta">{STUDIO_TYPES[k].plural} left</dt>
                <dd className="font-display tabular mt-1 text-[24px] leading-none">
                  {a.left}
                  <span className="text-[14px] text-muted"> of {a.limit}</span>
                </dd>
              </div>
            ))
          : null}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button as={Link} href="/plans" size="sm" variant="quiet">
          {account.studio ? "Plans" : "See Studio"}
        </Button>
      </div>
      <div>
        <h3 className="mb-2 text-[13px] font-medium">This month's credits</h3>
        {history === null ? (
          <div className="skeleton h-24 rounded-2xl" />
        ) : history === "error" ? (
          <p className="text-[13.5px] text-danger">I couldn't load the history. Reload the page to try again.</p>
        ) : !history.length ? (
          <p className="text-[13.5px] text-muted">Nothing spent yet this month.</p>
        ) : (
          <ul className="flex flex-col">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13.5px] last:border-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{h.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-4">
                  <span className={h.delta >= 0 ? "tabular font-medium text-good" : "tabular font-medium"}>
                    {h.delta >= 0 ? "+" : ""}
                    {formatCredits(h.delta)}
                  </span>
                  <span className="hidden w-24 text-right text-[12px] text-faint sm:inline">{new Date(h.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Account({ settings, setSettings }) {
  const { user, configured } = useSession();
  return (
    <div className="flex flex-col gap-9">
      <PlanSection />
      <section>
        <SectionTitle
          sub={
            configured
              ? user
                ? `Signed in as ${user.email}. Your brand, watchlists and drafts follow you to any device.`
                : "You're not signed in."
              : "Accounts aren't connected here, so everything stays in this browser."
          }
        >
          Account
        </SectionTitle>
        {configured && user ? <LogoutButton variant="quiet" /> : null}
      </section>

      <section>
        <SectionTitle sub="Light, dark, or the same as your device. Kept on this device.">Appearance</SectionTitle>
        <ThemeSwitch labels />
      </section>


    </div>
  );
}
