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

const handlesFrom = (text) =>
  String(text || "")
    .split(/[\s,]+/)
    .map((h) => h.replace(/^@/, "").replace(/^https?:\/\/(www\.)?[^/]+\//, "").replace(/\/.*$/, "").trim())
    .filter((h) => /^[\w.]{2,30}$/.test(h))
    .slice(0, 4);

export function NewReportSheet({ kind, onClose, preset }) {
  const router = useRouter();
  const brand = useStore((s) => s.brand);
  const targets = useStore((s) => s.targets);
  const { account } = useAccountData();
  const r = kind ? REPORTS[kind] : null;
  const intel = brand.intel || {};
  const allowed = r ? r.platforms : [];
  const preferred = (intel.platforms || []).find((p) => allowed.includes(p)) || allowed[0];

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
    setHandles((preset?.handles || intel.competitors?.[p] || intel.competitors?.instagram || []).map((h) => `@${String(h).replace(/^@/, "")}`).join(" "));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  if (!r) return <Sheet open={false} onClose={onClose} title="" />;
  const price = priceFor(kind, account);
  const parsed = handlesFrom(handles);
  const formats = INTEL_PLATFORMS.find((p) => p.id === platform)?.formats || [];
  const short = !price.free && (account?.credits ?? 0) < price.credits;
  const missing = r.handles && !parsed.length;

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
      width={480}
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
        <Field label="Platform">
          <Segmented label="Platform" value={platform} onChange={setPlatform} options={allowed.map((p) => ({ id: p, label: platformLabel(p) }))} size="sm" className="flex-wrap" />
        </Field>
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
          <Field label={kind === "creators" ? "Creators who talk about" : "What about"} htmlFor="rep-topic" hint="A word or two.">
            <Input id="rep-topic" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder={intel.keywords?.[0] || "skincare"} />
          </Field>
        ) : null}
        {r.handles ? (
          <Field
            label="Competitors"
            htmlFor="rep-handles"
            hint="Up to 4 handles, separated by spaces."
            error={handles && !parsed.length ? "Those don't look like handles. Try @brandname." : null}
          >
            <Input id="rep-handles" value={handles} onChange={(e) => setHandles(e.target.value)} placeholder="@glossier @summerfridays" />
          </Field>
        ) : null}
        {r.sizes ? (
          <Field label="Creator size">
            <Segmented label="Creator size" value={size} onChange={setSize} options={Object.entries(CREATOR_SIZES).map(([id, s]) => ({ id, label: s.label.replace(" followers", "") }))} size="sm" />
          </Field>
        ) : null}
        {short ? <GateNote error={{ code: "no_credits", message: `This needs ${price.credits} credits and you have ${account?.credits ?? 0} left this month.` }} /> : null}
        <GateNote error={error} onRetry={run} />
      </div>
    </Sheet>
  );
}
