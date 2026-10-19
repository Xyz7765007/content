"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChartLineUp, Compass, Megaphone, Sparkle, Users } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { Button, Field, Input, SPRING, Segmented, Select, Sheet, cx } from "../ui";
import { CostTag, GateNote } from "../plan/PlanBits";
import { REPORTS, CREATOR_SIZES } from "../../lib/intel/kinds";
import { PLATFORMS as INTEL_PLATFORMS, platformLabel } from "../../lib/intel/taxonomy";
import { PRICES, useAccountData } from "../../lib/account";
import { startReport } from "../../lib/reportRunner";
import { useStore } from "../../lib/store";
import { useMarketMap } from "../../lib/marketMap";

const ICONS = { trends: ChartLineUp, playbook: Sparkle, competitors: Compass, audience: Megaphone, creators: Users };

const priceFor = (kind, account) => {
  const free = kind !== "creators" && Boolean(account?.welcomeReport);
  return { free, credits: free ? 0 : PRICES[REPORTS[kind].action] };
};

// The five deep reports as cards, each opening a short setup sheet.
// The playbook leads: Studio builds on it more than anything else.
const ORDER = ["playbook", "trends", "competitors", "audience", "creators"];

export function ReportPicker({ onPick }) {
  const { account } = useAccountData();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ORDER.map((kind, i) => {
        const r = REPORTS[kind];
        const Icon = ICONS[kind];
        const lead = i === 0;
        // The first report is free whichever it is; the tag says so on the
        // one we recommend, so the others don't all claim to be free.
        const price = lead ? priceFor(kind, account) : { free: false, credits: PRICES[r.action] };
        return (
          <motion.button
            key={kind}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: i * 0.04 }}
            onClick={() => onPick(kind)}
            className={cx(
              "group flex flex-col items-start gap-3 rounded-[20px] border p-4 text-left transition-[transform,border-color,box-shadow] hover:shadow-card active:scale-[0.98]",
              lead ? "aurora grain relative overflow-hidden border-accent-line bg-surface sm:col-span-2 sm:p-5" : "border-line bg-surface hover:border-line-strong"
            )}
          >
            <span className="relative flex w-full items-center justify-between gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent-deep transition-transform group-hover:scale-105">
                <Icon size={17} weight="bold" aria-hidden="true" />
              </span>
              <CostTag credits={price.credits} free={price.free} />
            </span>
            <span className="relative">
              <span className={cx("block font-medium text-ink", lead ? "text-[17px]" : "text-[15px]")}>
                {r.label}
                {lead ? <span className="ml-2 align-middle text-[12px] font-normal text-accent-deep">Start here</span> : null}
              </span>
              <span className="mt-1 block max-w-[52ch] text-[13px] leading-snug text-muted">{r.blurb}</span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

// Competitors as typed: names, @handles or links, comma or line separated.
const competitorsFrom = (text) =>
  String(text || "")
    .split(/[\n,]+/)
    .map((h) => h.trim())
    .filter((h) => h.length >= 2 && h.length <= 120)
    .slice(0, 4);

const PLATFORM_NAMES = { all: "All platforms", reddit: "Reddit" };
const nameOf = (p) => PLATFORM_NAMES[p] || platformLabel(p);
const REVIEW_NAMES = { amazon: "Amazon ratings", trustpilot: "Trustpilot", google_maps: "Google reviews", app_stores: "app store reviews" };
const list = (xs, n = 3) => {
  const v = xs.filter((x, i) => x && xs.findIndex((y) => String(y || "").toLowerCase() === String(x).toLowerCase()) === i).slice(0, n);
  return v.length <= 1 ? v.join("") : `${v.slice(0, -1).join(", ")} and ${v[v.length - 1]}`;
};

// What a report will read, from the market map, said before anyone pays.
function readPlan(kind, { platform, map, topic, competitors }) {
  if (!map) return [];
  const where = (map.platforms || []).filter((p) => p.fit === "core" || p.fit === "useful").map((p) => p.id);
  const words = list([topic, ...(map.terms || [])].filter(Boolean), 3);
  const subs = (map.subreddits || []).slice(0, 3).map((s) => `r/${s}`);
  const reviews = (map.reviewSources || []).map((r) => REVIEW_NAMES[r]).filter(Boolean);
  switch (kind) {
    case "playbook":
      return [
        { label: `Recent ${nameOf(platform)} posts`, detail: `a deep sample about ${words}${platform === "x" ? ", from the last week (as far back as X search goes)" : ", from the last 30 days"}` },
        { label: "Measured", detail: "openings, formats, length, posting times and calls to action, each with its sample size" },
        (map.competitors || []).some((c) => (platform === "x" ? c.x : c[platform])) ? { label: "Competitors", detail: `what works for ${list(map.competitors.filter((c) => (platform === "x" ? c.x : c[platform])).map((c) => c.name), 2)} on ${nameOf(platform)}` } : null,
      ].filter(Boolean);
    case "trends": {
      const ps = platform === "all" ? where.slice(0, 3) : [platform];
      return [
        { label: "This week's posts", detail: `on ${list(ps.map(nameOf), 3)} about ${words}` },
        { label: "The news", detail: `the last 7 days${map.country ? `, ${map.country} editions first` : ""}` },
        ps.includes("tiktok") ? { label: "TikTok's trend boards", detail: "rising hashtags and the sounds chart" } : null,
      ].filter(Boolean);
    }
    case "competitors": {
      const names = competitors.length ? competitors : (map.competitors || []).filter((c) => !c.suggested).concat((map.competitors || []).filter((c) => c.suggested)).slice(0, 3).map((c) => c.name);
      return [
        { label: names.length ? list(names, 4) : "Your competitors", detail: `their accounts on ${list(where.filter((p) => p !== "reddit").map(nameOf), 4)}, each checked to be really theirs` },
        { label: "Ads", detail: "what they're running in the Meta and LinkedIn ad libraries" },
        reviews.length ? { label: "Reviews", detail: list(reviews, 3) } : null,
        { label: "Who talks about them", detail: "X, Reddit and the news, last 30 days" },
      ].filter(Boolean);
    }
    case "audience":
      return [
        subs.length || where.includes("reddit") ? { label: "Forums", detail: subs.length ? `Reddit, including ${list(subs, 3)}` : "Reddit" } : null,
        { label: "Comments", detail: `on the busiest ${list(where.filter((p) => ["youtube", "instagram", "tiktok", "x", "linkedin"].includes(p)).map(nameOf), 3)} posts` },
        reviews.length ? { label: "Reviews", detail: list(reviews, 3) } : null,
      ].filter(Boolean);
    case "creators":
      return [
        ["instagram", "tiktok", "youtube"].includes(platform)
          ? { label: `${nameOf(platform)} creators`, detail: `in ${words}${map.country ? `, ${map.country} first` : ""}, from a creator index` }
          : { label: `${nameOf(platform)} creators`, detail: `the people whose ${words} posts do best on ${nameOf(platform)}` },
        { label: "Checked", detail: "each one's recent posts and bio for fit, plus engagement and how recently they posted" },
      ];
    default:
      return [];
  }
}

export function NewReportSheet({ kind, onClose, preset }) {
  const router = useRouter();
  const brand = useStore((s) => s.brand);
  const targets = useStore((s) => s.targets);
  const { account } = useAccountData();
  const r = kind ? REPORTS[kind] : null;
  const intel = brand.intel || {};
  const allowed = r?.platforms || [];
  const preferred = kind === "trends" ? "all" : (intel.platforms || []).find((p) => allowed.includes(p)) || allowed[0] || null;
  const { map, loading: mapLoading, missingBrand } = useMarketMap({ enabled: Boolean(kind) });

  const [platform, setPlatform] = useState(preferred);
  const [focus, setFocus] = useState("");
  const [topic, setTopic] = useState("");
  const [handles, setHandles] = useState("");
  const [size, setSize] = useState("small");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!kind) return;
    const p = preset?.platform && allowed.includes(preset.platform) ? preset.platform : preferred;
    setPlatform(p);
    setFocus(r?.focus === "format" ? preset?.format || "" : preset?.topic || preset?.focus || intel.keywords?.[0] || "");
    setTopic(r?.focus === "format" ? preset?.topic || "" : "");
    const own = Object.values(intel.competitors || {}).flat().map((h) => `@${String(h).replace(/^@/, "")}`);
    setHandles((preset?.handles?.length ? preset.handles : own).slice(0, 4).join(", "));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  if (!r) return <Sheet open={false} onClose={onClose} title="" />;
  const price = priceFor(kind, account);
  const parsed = competitorsFrom(handles);
  const formats = INTEL_PLATFORMS.find((p) => p.id === platform)?.formats || [];
  const short = !price.free && (account?.credits ?? 0) < price.credits;
  const known = (map?.competitors || []).map((c) => c.name).filter(Boolean);
  const missing = r.handles && !parsed.length && !known.length && !mapLoading;
  const plan = readPlan(kind, { platform, map, topic: (r.focus === "format" ? topic : focus).trim(), competitors: parsed });

  const run = async () => {
    setBusy(true);
    setError(null);
    const params = { platform, format: r.focus === "format" ? focus || null : null, topic: (r.focus === "format" ? topic : focus).trim() || null };
    if (r.handles) params.handles = parsed;
    if (r.sizes) params.followers = { min: CREATOR_SIZES[size].min, max: CREATOR_SIZES[size].max };
    const res = await startReport({ kind, params, brand, targets });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onClose();
    router.push(`/insights/reports/${res.reportId}`);
  };

  return (
    <Sheet
      open={Boolean(kind)}
      onClose={onClose}
      title={r.label}
      width={500}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px] text-muted">
            {price.free ? "Your first report is on Huesy." : `You have ${(account?.credits ?? 0).toLocaleString("en-US")} credits.`}
          </span>
          <Button onClick={run} loading={busy} disabled={busy || short || missing}>
            Run report
            <CostTag credits={price.credits} free={price.free} />
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[14px] leading-relaxed text-muted">{r.blurb} It takes a minute or two, and keeps going if you leave this page.</p>
        {allowed.length ? (
          <Field label="Where">
            <Segmented label="Where" value={platform} onChange={setPlatform} options={allowed.map((p) => ({ id: p, label: nameOf(p) }))} size="sm" className="flex-wrap" />
          </Field>
        ) : null}
        {r.focus === "format" ? (
          <Field label="Focus on" htmlFor="rep-format" hint="Optional. Leave it to cover every format.">
            <Select id="rep-format" value={focus} onChange={(e) => setFocus(e.target.value)}>
              <option value="">Every format</option>
              {formats.map((f) => (
                <option key={f} value={f}>
                  {{ reel: "Reels", carousel: "Carousels", image: "Single images", video: "Videos", short: "Shorts", text: "Text posts" }[f]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {r.focus === "format" ? (
          <Field label="About" htmlFor="rep-about" hint="Optional. A topic inside your niche, one to three words.">
            <Input id="rep-about" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={intel.keywords?.[0] || "morning routine"} maxLength={60} />
          </Field>
        ) : null}
        {r.focus === "topic" ? (
          <Field label={kind === "creators" ? "Creators who talk about" : "What about"} htmlFor="rep-topic" hint={kind === "audience" ? "Optional. A product or problem, a few words." : "A word or two."}>
            <Input id="rep-topic" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder={intel.keywords?.[0] || "skincare"} />
          </Field>
        ) : null}
        {r.handles ? (
          <Field
            label="Competitors"
            htmlFor="rep-handles"
            hint={known.length ? `Up to 4: names, @handles or links, separated by commas. Leave it empty to compare ${list(known, 3)}.` : "Up to 4: names, @handles or links, separated by commas."}
          >
            <Input id="rep-handles" value={handles} onChange={(e) => setHandles(e.target.value)} placeholder="Minimalist, @plumgoodness, linkedin.com/company/mamaearth" />
          </Field>
        ) : null}
        {r.sizes ? (
          <Field label="Creator size">
            <Segmented label="Creator size" value={size} onChange={setSize} options={Object.entries(CREATOR_SIZES).map(([id, s]) => ({ id, label: s.label.replace(" followers", "") }))} size="sm" />
          </Field>
        ) : null}
        <section aria-label="What I'll read" className="rounded-2xl border border-line bg-sunken px-4 py-3.5">
          <h3 className="text-[12.5px] font-medium text-muted">What I'll read</h3>
          {missingBrand ? (
            <p className="mt-2 text-[13px] text-muted">
              Set up your brand first, so I know your market. <a href="/onboarding" className="font-medium text-accent-deep underline underline-offset-2">Set it up</a>
            </p>
          ) : mapLoading && !plan.length ? (
            <p className="mt-2 text-[13px] text-muted" aria-live="polite">Working out where your market talks…</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {plan.map((line) => (
                <li key={line.label} className="text-[13.5px] leading-snug">
                  <span className="font-medium text-ink">{line.label}</span>
                  <span className="text-muted">: {line.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        {missing ? <GateNote error={{ code: "no_competitors", message: "Add at least one competitor: a name, an @handle or a link." }} /> : null}
        {short ? <GateNote error={{ code: "no_credits", message: `This needs ${price.credits} credits and you have ${account?.credits ?? 0} left this month.` }} /> : null}
        <GateNote error={error} onRetry={run} />
      </div>
    </Sheet>
  );
}
