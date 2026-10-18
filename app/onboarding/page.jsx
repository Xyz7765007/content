"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, PencilSimpleLine, Sparkle } from "@phosphor-icons/react";
import { Badge, Button, Card, ErrorNote, Field, Input, SPRING, Textarea, ToastHost } from "../../components/ui";
import Huesy from "../../components/huesy/Huesy";
import Wordmark from "../../components/shell/Wordmark";
import { useTitle } from "../../components/shell/AppShell";
import { BrandInfoForm, PlatformPersonalityForm } from "../../components/brand/forms";
import { intelFrom, useHydrated, useStore } from "../../lib/store";
import IntelForm from "../../components/brand/IntelForm";
import { useAccountData } from "../../lib/account";
import { useSession } from "../../components/auth/useSession";
import { quickJob } from "../../lib/api";


/**
 * Setup in about a minute. A name and one sentence; Huesy drafts the rest
 * (voice, audience, the market, the search words and competitors, a tone
 * for each platform); the person checks the draft in one place. Finishing
 * spends nothing: it lands on Today, where the first playbook is free, or on
 * the plans when there isn't one yet.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const hydrated = useHydrated();
  useTitle("Set up your brand");

  const brand = useStore((s) => s.brand);
  const setBrand = useStore((s) => s.setBrand);
  const targets = useStore((s) => s.targets);
  const setTargets = useStore((s) => s.setTargets);
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const { user, configured } = useSession();
  const { account } = useAccountData();

  const [step, setStep] = useState("intro"); // intro | drafting | review
  const [oneLiner, setOneLiner] = useState("");
  const [website, setWebsite] = useState("");
  const [drafted, setDrafted] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (hydrated && brand.brandDescription && !oneLiner) setOneLiner(brand.brandDescription.split(". ")[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const draftIt = async () => {
    setStep("drafting");
    setNote("");
    const r = await quickJob("brand-draft", { brandName: brand.brandName, oneLiner, website });
    if (r.error || !r.data) {
      setNote(r.error?.message ? `${r.error.message} Fill in what you can; it can be tidied later.` : "");
      if (!brand.brandDescription) setBrand({ brandDescription: oneLiner });
      setStep("review");
      return;
    }
    const d = r.data;
    setBrand((b) => ({
      ...b,
      product: d.product || b.product,
      brandDescription: d.brandDescription || b.brandDescription || oneLiner,
      targetAudience: d.targetAudience || b.targetAudience,
      brandPersona: d.brandPersona || b.brandPersona,
      brandValues: d.brandValues || b.brandValues,
      platformPersonality: { ...(d.tones || {}), ...Object.fromEntries(Object.entries(b.platformPersonality || {}).filter(([, v]) => v?.trim())) },
      activePlatforms: (b.activePlatforms || []).length ? b.activePlatforms : ["instagram", "linkedin"],
    }));
    setTargets((t) => ({
      ...t,
      targetMode: "niche",
      niche: t.niche || d.niche || "",
      subNiches: t.subNiches || d.subNiches || "",
      accountList: t.accountList || (d.accounts || []).join("\n"),
    }));
    // Seed the market research settings from the draft, without overwriting
    // anything already chosen.
    setBrand((b) => {
      const seeded = intelFrom(b, { accountList: (d.accounts || []).join("\n") });
      const words = [d.niche, ...String(d.subNiches || "").split(",")].map((w) => String(w || "").trim().toLowerCase()).filter((w) => w.length > 2).slice(0, 4);
      const current = b.intel || {};
      return {
        ...b,
        intel: {
          ...seeded,
          ...current,
          platforms: current.platforms?.length ? current.platforms : seeded.platforms,
          keywords: current.keywords?.length ? current.keywords : words,
          competitors: Object.keys(current.competitors || {}).length ? current.competitors : seeded.competitors,
        },
      };
    });
    setDrafted(true);
    setStep("review");
  };

  const blockers = useMemo(() => {
    const missing = [];
    if (!brand.brandName?.trim()) missing.push({ id: "brandName", label: "a brand name" });
    if (!targets.niche?.trim()) missing.push({ id: "ob-niche", label: "your niche" });
    return missing;
  }, [brand, targets]);

  // Where the brand posts (for writing) follows the platforms it wants to win
  // on, so setup asks once. A newsletter, if chosen, is kept.
  const intelPlatforms = (brand.intel?.platforms || []).join(",");
  useEffect(() => {
    if (step !== "review") return;
    const map = { instagram: "instagram", linkedin: "linkedin", x: "twitter" };
    const mapped = (brand.intel?.platforms || []).map((p) => map[p]).filter(Boolean);
    setBrand((b) => {
      const keepEmail = (b.activePlatforms || []).includes("email") ? ["email"] : [];
      const next = [...new Set([...mapped, ...keepEmail])];
      return { ...b, activePlatforms: next.length ? next : ["instagram"] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelPlatforms, step]);

  const showMissing = () => {
    const first = blockers[0];
    const el = first && document.getElementById(first.id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => el.focus(), 350);
    }
  };

  // Finishing never spends anything: it saves the brand, fills in any market
  // settings left empty, and goes to Today (or to plans, when there's none).
  const finish = () => {
    if (!(brand.intel?.platforms || []).length) {
      setBrand((b) => ({ ...b, intel: { ...intelFrom(b, targets), ...(b.intel || {}), platforms: intelFrom(b, targets).platforms } }));
    }
    completeOnboarding();
    if (configured && !user) {
      router.push("/signup?next=/home");
      return;
    }
    router.push(account && !account.plan ? "/plans" : "/home");
  };

  const fade = reduced ? { opacity: 0 } : { opacity: 0, y: 12 };

  return (
    <div className="relative min-h-[100dvh] bg-canvas">
      <div className="aurora aurora-fade pointer-events-none absolute inset-x-0 top-0 h-[460px]" aria-hidden="true" />

      <header className="relative">
        <div className="mx-auto flex h-[64px] max-w-[880px] items-center justify-between px-4 sm:px-6">
          <Wordmark href="/home" />
          <button
            type="button"
            onClick={() => {
              completeOnboarding();
              router.push("/home");
            }}
            className="rounded-full px-3 py-2 text-[13px] text-muted transition-colors hover:text-ink"
          >
            Skip for now
          </button>
        </div>
      </header>

      <main id="main" className="relative mx-auto max-w-[760px] px-4 pb-32 pt-6 sm:px-6 sm:pt-12">
        <AnimatePresence mode="wait" initial={false}>
          {step === "intro" || step === "drafting" ? (
            <motion.section key="intro" initial={fade} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
              <div className="flex items-center gap-4">
                <Huesy mood={step === "drafting" ? "write" : "idle"} size={64} />
                <div>
                  <p className="meta">Step 1 of 2</p>
                  <h1 className="display-lg mt-1 text-[30px] sm:text-[38px]">Who am I writing for?</h1>
                </div>
              </div>
              <p className="mt-4 max-w-[56ch] text-[15.5px] leading-relaxed text-muted">
                Give me a name and a sentence. I'll draft the rest: the voice, the audience, your market and
                competitors, and a tone for each platform. You check it next.
              </p>

              <Card className="mt-7 p-5 sm:p-7">
                {!hydrated ? (
                  <div className="space-y-4">
                    <div className="skeleton h-11 rounded-xl" />
                    <div className="skeleton h-24 rounded-xl" />
                  </div>
                ) : (
                  <form
                    className="flex flex-col gap-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (brand.brandName?.trim() && oneLiner.trim()) draftIt();
                    }}
                  >
                    <Field label="Brand name" required htmlFor="ob-name">
                      <Input
                        id="ob-name"
                        autoFocus
                        value={brand.brandName}
                        onChange={(e) => setBrand({ brandName: e.target.value })}
                        placeholder="Honest Glow"
                        disabled={step === "drafting"}
                      />
                    </Field>
                    <Field label="What do you do, in a sentence?" required htmlFor="ob-line" hint="The way you'd say it to a friend.">
                      <Textarea
                        id="ob-line"
                        rows={2}
                        value={oneLiner}
                        onChange={(e) => setOneLiner(e.target.value)}
                        placeholder="Refillable skincare for people who hate throwing away half empty bottles."
                        disabled={step === "drafting"}
                      />
                    </Field>
                    <Field label="Website" htmlFor="ob-site" hint="Optional.">
                      <Input
                        id="ob-site"
                        inputMode="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="honestglow.com"
                        disabled={step === "drafting"}
                      />
                    </Field>

                    {step === "drafting" ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-accent-line bg-accent-soft/60 px-4 py-3" aria-live="polite">
                        <Sparkle size={16} weight="fill" className="animate-pulse text-accent-deep" />
                        <p className="text-[14px] text-ink">Reading up on {brand.brandName || "your brand"} and drafting the rest…</p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button type="submit" size="lg" disabled={!brand.brandName?.trim() || !oneLiner.trim()}>
                          <Sparkle size={16} weight="fill" />
                          Draft my brand
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            if (oneLiner.trim() && !brand.brandDescription) setBrand({ brandDescription: oneLiner.trim() });
                            setStep("review");
                          }}
                        >
                          <PencilSimpleLine size={15} />
                          I'll fill it in myself
                        </Button>
                      </div>
                    )}
                  </form>
                )}
              </Card>
            </motion.section>
          ) : (
            <motion.section key="review" initial={fade} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
              <div className="flex items-center gap-4">
                <Huesy mood="found" size={64} />
                <div>
                  <p className="meta">Step 2 of 2</p>
                  <h1 className="display-lg mt-1 text-[30px] sm:text-[38px]">
                    {drafted ? "Here’s what I picked up" : "Tell me about the brand"}
                  </h1>
                </div>
              </div>
              <p className="mt-4 max-w-[58ch] text-[15.5px] leading-relaxed text-muted">
                {drafted
                  ? "Change anything that's off. The more it sounds like you, the more the posts will."
                  : "Fill in what you can. Every field can be changed later in Brand."}
              </p>
              {note ? <ErrorNote className="mt-5">{note}</ErrorNote> : null}

              <div className="mt-7 flex flex-col gap-5">
                <ReviewCard title="The brand" drafted={drafted}>
                  <BrandInfoForm brand={brand} setBrand={setBrand} />
                </ReviewCard>
                <ReviewCard title="Your market" drafted={drafted}>
                  <div className="flex flex-col gap-6">
                    <Field label="Your niche" required htmlFor="ob-niche" hint="What your market is called, in a few words. Everything is researched in it.">
                      <Input
                        id="ob-niche"
                        value={targets.niche || ""}
                        onChange={(e) => setTargets({ niche: e.target.value, targetMode: "niche" })}
                        placeholder="Clean skincare for sensitive skin"
                        maxLength={200}
                      />
                    </Field>
                    <IntelForm brand={brand} setBrand={setBrand} compact />
                  </div>
                </ReviewCard>
                <details className="group rounded-[20px] border border-line bg-surface p-5 sm:p-7">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span>
                      <span className="font-display block text-[21px]">Writing tone for each platform</span>
                      <span className="mt-1 block text-[13.5px] text-muted">Optional. Set it now or any time in Brand.</span>
                    </span>
                    <span className="text-[13px] font-medium text-accent-deep group-open:hidden">Set it now</span>
                  </summary>
                  <div className="mt-6">
                    <PlatformPersonalityForm brand={brand} setBrand={setBrand} />
                  </div>
                </details>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {step === "review" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-6" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-between gap-3 rounded-[20px] border border-line-strong bg-surface p-3 pl-4 shadow-float">
            <Button variant="ghost" size="sm" onClick={() => setStep("intro")}>
              <ArrowLeft size={14} />
              Back
            </Button>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1">
              {blockers.length ? (
                <button type="button" onClick={showMissing} className="min-w-0 text-left text-[13px] text-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
                  Still need {blockers.map((b) => b.label).join(" and ")}
                </button>
              ) : null}
              <Button onClick={blockers.length ? showMissing : finish} aria-disabled={blockers.length > 0 || undefined} className={blockers.length ? "opacity-60" : undefined}>
                {configured && !user ? "Save and create account" : "Finish setup"}
                <ArrowRight size={14} weight="bold" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <ToastHost offset={100} />
    </div>
  );
}

function ReviewCard({ title, drafted, children }) {
  return (
    <Card className="p-5 sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-[21px]">{title}</h2>
        {drafted ? <Badge tone="mist">Drafted by Huesy</Badge> : null}
      </div>
      {children}
    </Card>
  );
}
