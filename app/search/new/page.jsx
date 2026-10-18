"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Binoculars, Sparkle } from "@phosphor-icons/react";
import AppShell from "../../../components/shell/AppShell";
import Huesy from "../../../components/huesy/Huesy";
import RegionPicker from "../../../components/signals/RegionPicker";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Field,
  Input,
  SPRING,
  Segmented,
  Textarea,
  toast,
} from "../../../components/ui";
import {
  GLOBAL_REGION,
  RESEARCH_PLATFORMS,
  RESULT_SIZES,
  SIGNAL_TYPES,
  isGlobal,
  normaliseRegions,
} from "../../../lib/constants";
import { quickJob } from "../../../lib/api";
import { startRun } from "../../../lib/runner";
import { useHydrated, useStore } from "../../../lib/store";

// What counts as a signal, as choices instead of a checklist. "Custom" opens
// the full list with instructions per kind.
const PRESETS = [
  { id: "any", label: "Anything notable", types: [] },
  { id: "launches", label: "Launches and collabs", types: ["product_launch", "collab"] },
  { id: "campaigns", label: "Campaigns and moments", types: ["campaign", "controversy"] },
  { id: "moves", label: "Market moves", types: ["market_move", "repositioning", "expansion"] },
  { id: "custom", label: "Custom", types: null },
];

const WINDOWS = [
  { id: 3, label: "3 days" },
  { id: 7, label: "7 days" },
  { id: 14, label: "14 days" },
  { id: 30, label: "30 days" },
];

const presetFor = (types = []) => {
  const key = [...types].sort().join(",");
  const hit = PRESETS.find((p) => p.types && [...p.types].sort().join(",") === key);
  return hit ? hit.id : "custom";
};

const brandsIn = (text) =>
  String(text || "")
    .split(/\n|,/)
    .map((a) => a.trim())
    .filter(Boolean);

export default function BuilderPage() {
  return (
    <Suspense fallback={null}>
      <Builder />
    </Suspense>
  );
}

function Builder() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("edit");
  const hydrated = useHydrated();

  const targets = useStore((s) => s.targets);
  const draft = useStore((s) => s.draft);
  const editing = useStore((s) => (editId ? s.searches.find((x) => x.id === editId) : null));
  const saveSearch = useStore((s) => s.saveSearch);
  const updateSearch = useStore((s) => s.updateSearch);

  const [cfg, setCfg] = useState(null);
  const [preset, setPreset] = useState("any");
  const [helping, setHelping] = useState({});

  useEffect(() => {
    if (!hydrated || cfg) return;
    const base = editing
      ? { ...editing.config, name: editing.name }
      : {
          ...draft,
          targetMode: draft.targetMode || targets.targetMode || "niche",
          niche: draft.niche || targets.niche || "",
          subNiches: draft.subNiches || targets.subNiches || "",
          accountList: draft.accountList || targets.accountList || "",
        };
    setCfg(base);
    setPreset(presetFor(base.selectedSignals));
  }, [hydrated, cfg, editing, draft, targets]);

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  const ready = cfg
    ? (cfg.targetMode === "accounts" ? brandsIn(cfg.accountList).length > 0 : Boolean(cfg.niche?.trim())) &&
      (cfg.researchPlatforms || []).length > 0
    : false;

  const summary = useMemo(() => {
    if (!cfg) return "";
    const what = cfg.targetMode === "accounts" ? `${brandsIn(cfg.accountList).length} brands` : cfg.niche || "No market yet";
    const where = (cfg.researchPlatforms || []).map((p) => RESEARCH_PLATFORMS.find((x) => x.id === p)?.label).join(", ");
    const regions = normaliseRegions(cfg.researchLocations);
    return [what, where, isGlobal(regions) ? "anywhere" : regions.join(", "), `last ${cfg.lookbackDays || 7} days`].join(" · ");
  }, [cfg]);

  if (!hydrated || !cfg) {
    return (
      <AppShell title={editId ? "Edit watchlist" : "New watchlist"} back={{ href: "/search", label: "Watching" }}>
        <div className="space-y-4">
          <div className="skeleton h-40 rounded-[20px]" />
          <div className="skeleton h-64 rounded-[20px]" />
        </div>
      </AppShell>
    );
  }

  const pickPreset = (id) => {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p.types) set({ selectedSignals: p.types });
  };

  const togglePlatform = (id) => {
    const cur = cfg.researchPlatforms || [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (next.length) set({ researchPlatforms: next });
  };

  const sizeId = RESULT_SIZES.find((r) => r.range[0] === cfg.resultRange?.[0])?.id || "standard";

  const helpWrite = async (signalId) => {
    setHelping((h) => ({ ...h, [signalId]: true }));
    const context = cfg.targetMode === "accounts" ? brandsIn(cfg.accountList).join(", ") : `${cfg.niche} ${cfg.subNiches || ""}`;
    const r = await quickJob("instruction", { signalId, context });
    setHelping((h) => ({ ...h, [signalId]: false }));
    if (r.error) return toast(r.error.message, { duration: 5000 });
    set({ signalPrompts: { ...(cfg.signalPrompts || {}), [signalId]: r.text } });
  };

  const autoName = cfg.targetMode === "accounts" ? brandsIn(cfg.accountList).slice(0, 2).join(" and ") + (brandsIn(cfg.accountList).length > 2 ? " and others" : "") : cfg.niche;

  const submit = (runNow = true) => {
    const name = cfg.name?.trim() || autoName || "My watchlist";
    const config = { ...cfg, name };
    if (editing) {
      updateSearch(editing.id, { name, config });
      if (runNow) startRun(editing.id);
      else toast("Saved", { tone: "good" });
      router.push(`/search/${editing.id}`);
      return;
    }
    const id = saveSearch(config, []);
    startRun(id);
    router.push(`/search/${id}`);
  };

  return (
    <AppShell title={editing ? "Edit watchlist" : "New watchlist"} back={{ href: "/search", label: "Watching" }}>
      <div className="mx-auto flex max-w-[760px] flex-col gap-5 pb-36">
        <div className="flex items-center gap-3.5">
          <Huesy mood="idle" size={44} />
          <div>
            <h2 className="display-lg text-[24px] sm:text-[28px]">What should I watch?</h2>
            <p className="text-[14px] text-muted">A whole market, or a list of brands you care about.</p>
          </div>
        </div>

        <Card className="p-5 sm:p-6">
          <Segmented
            label="What to watch"
            value={cfg.targetMode === "accounts" ? "accounts" : "niche"}
            onChange={(v) => set({ targetMode: v })}
            options={[
              { id: "niche", label: "A market" },
              { id: "accounts", label: "Specific brands" },
            ]}
          />
          <div className="mt-5">
            <AnimatePresence mode="wait" initial={false}>
              {cfg.targetMode === "accounts" ? (
                <motion.div key="accounts" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
                  <Field label="Brands to watch" required htmlFor="b-accounts" hint="One per line, or separated by commas. Competitors, partners, anyone whose moves matter.">
                    <Textarea
                      id="b-accounts"
                      rows={5}
                      value={cfg.accountList || ""}
                      onChange={(e) => set({ accountList: e.target.value })}
                      placeholder={"Glossier\nSummer Fridays\nLaneige"}
                    />
                  </Field>
                  {brandsIn(cfg.accountList).length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {brandsIn(cfg.accountList).slice(0, 24).map((b) => (
                        <span key={b} className="rounded-full border border-line bg-sunken px-2.5 py-1 text-[12px] text-ink">
                          {b}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </motion.div>
              ) : (
                <motion.div key="niche" className="flex flex-col gap-4" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
                  <Field label="Market" required htmlFor="b-niche">
                    <Input id="b-niche" value={cfg.niche || ""} onChange={(e) => set({ niche: e.target.value })} placeholder="Beauty and skincare" />
                  </Field>
                  <Field label="Narrow it down" htmlFor="b-sub" hint="Optional. Themes that matter most, comma separated.">
                    <Input
                      id="b-sub"
                      value={cfg.subNiches || ""}
                      onChange={(e) => set({ subNiches: e.target.value })}
                      placeholder="Clean beauty, refills, founder led brands"
                    />
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h3 className="text-[14px] font-medium text-ink">What counts as news</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Chip key={p.id} selected={preset === p.id} onClick={() => pickPreset(p.id)}>
                {p.label}
              </Chip>
            ))}
          </div>
          <AnimatePresence initial={false}>
            {preset === "custom" ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={SPRING}
                className="overflow-hidden"
              >
                <div className="mt-4 flex flex-col divide-y divide-line border-t border-line">
                  {SIGNAL_TYPES.filter((t) => t.id !== "custom").map((t) => {
                    const on = (cfg.selectedSignals || []).includes(t.id);
                    return (
                      <div key={t.id} className="py-3.5">
                        <Checkbox
                          checked={on}
                          onChange={() =>
                            set({
                              selectedSignals: on
                                ? (cfg.selectedSignals || []).filter((x) => x !== t.id)
                                : [...(cfg.selectedSignals || []), t.id],
                            })
                          }
                          label={t.label}
                          description={t.desc}
                        />
                        {on ? (
                          <div className="mt-3 pl-[30px]">
                            <Textarea
                              rows={2}
                              value={cfg.signalPrompts?.[t.id] || ""}
                              onChange={(e) => set({ signalPrompts: { ...(cfg.signalPrompts || {}), [t.id]: e.target.value } })}
                              placeholder={`What counts as ${t.label.toLowerCase()} for you (optional)`}
                              aria-label={`What counts as ${t.label}`}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mt-1.5"
                              onClick={() => helpWrite(t.id)}
                              loading={helping[t.id]}
                              disabled={helping[t.id]}
                            >
                              {!helping[t.id] ? <Sparkle size={13} weight="fill" className="text-accent-deep" /> : null}
                              Suggest one
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </Card>

        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <Field label="Where to look">
            <div className="flex flex-wrap gap-2">
              {RESEARCH_PLATFORMS.map((p) => (
                <Chip key={p.id} selected={(cfg.researchPlatforms || []).includes(p.id)} onClick={() => togglePlatform(p.id)}>
                  {p.label}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Regions" hint="Type a country or region. Anything not on the list can be added as typed.">
            <RegionPicker value={normaliseRegions(cfg.researchLocations || [GLOBAL_REGION])} onChange={(v) => set({ researchLocations: v })} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="How far back">
              <Segmented size="sm" label="How far back" value={cfg.lookbackDays || 7} onChange={(v) => set({ lookbackDays: v })} options={WINDOWS} />
            </Field>
            <Field label="How many">
              <Segmented
                size="sm"
                label="How many signals"
                value={sizeId}
                onChange={(id) => set({ resultRange: RESULT_SIZES.find((r) => r.id === id).range })}
                options={RESULT_SIZES.map((r) => ({ id: r.id, label: r.id === "focused" ? "A few" : r.id === "standard" ? "A full read" : "Lots" }))}
              />
            </Field>
          </div>
          <Field label="Name" htmlFor="b-name" hint="Optional. How it shows in your list.">
            <Input id="b-name" value={cfg.name || ""} onChange={(e) => set({ name: e.target.value })} placeholder={autoName || "My watchlist"} />
          </Field>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] z-30 px-4 lg:bottom-5 lg:left-[232px] lg:px-8">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-between gap-3 rounded-[20px] border border-line-strong bg-surface p-3 pl-4 shadow-float">
          <p className="min-w-0 flex-1 truncate text-[13px] text-muted">{summary}</p>
          <div className="flex items-center gap-2">
            <Button as={Link} href={editing ? `/search/${editing.id}` : "/search"} variant="ghost" size="sm">
              Cancel
            </Button>
            {editing ? (
              <Button variant="quiet" size="md" onClick={() => submit(false)} disabled={!ready}>
                Save
              </Button>
            ) : null}
            <Button onClick={() => submit(true)} disabled={!ready}>
              <Binoculars size={15} />
              {editing ? "Save and check" : "Start watching"}
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
