"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "@phosphor-icons/react";
import AppShell from "../../components/shell/AppShell";
import { Card, Field, Input, SPRING, SectionTitle, Tabs } from "../../components/ui";
import { BrandInfoForm, PlatformPersonalityForm, ReferencesForm, TargetsForm } from "../../components/brand/forms";
import LogoutButton from "../../components/auth/LogoutButton";
import ThemeSwitch from "../../components/ThemeSwitch";
import { useSession } from "../../components/auth/useSession";
import { useHydrated, useStore } from "../../lib/store";

const TABS = [
  { id: "brand", label: "Brand" },
  { id: "tone", label: "Platforms and tone" },
  { id: "examples", label: "Examples" },
  { id: "watch", label: "What I watch" },
  { id: "account", label: "Account" },
];

export default function BrandPage() {
  const hydrated = useHydrated();
  const [tab, setTab] = useState("brand");
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

function Account({ settings, setSettings }) {
  const { user, configured } = useSession();
  return (
    <div className="flex flex-col gap-9">
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

      <section>
        <SectionTitle sub="Optional. With a Google AI Studio key, Huesy can turn an Instagram image prompt into the picture itself. The key stays on this device and is never sent to Huesy.">
          Image rendering
        </SectionTitle>
        <Field label="Google AI Studio key" htmlFor="googleKey" hint="From aistudio.google.com/apikey">
          <Input
            id="googleKey"
            type="password"
            autoComplete="off"
            value={settings.googleKey || ""}
            onChange={(e) => setSettings({ googleKey: e.target.value })}
            placeholder="Paste the key"
          />
        </Field>
      </section>
    </div>
  );
}
