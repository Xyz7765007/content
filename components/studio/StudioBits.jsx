"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FilmSlate, Images, LockSimple, PaintBrushBroad, Sparkle, TextAa, Trash } from "@phosphor-icons/react";
import { Button, Field, IconButton, Input, SPRING, Segmented, cx } from "../ui";
import { GateNote } from "../plan/PlanBits";
import { ProofCard, Steps, withStep } from "../intel/IntelBits";
import { streamNdjson, getJson } from "../../lib/stream";
import { slimBrand } from "../../lib/api";
import { useStore } from "../../lib/store";
import { STUDIO_TYPES, TEXT_PLATFORM_LABELS } from "../../lib/studio/options";
import { platformLabel } from "../../lib/intel/taxonomy";

export const TYPE_ICONS = { creative: Images, carousel: PaintBrushBroad, reel: FilmSlate, text: TextAa };

// The brand as every studio call sends it.
export function useBrandPayload() {
  const brand = useStore((s) => s.brand);
  const targets = useStore((s) => s.targets);
  return { brand: slimBrand(brand), targets, rawBrand: brand };
}

// The platforms a type can be made for, the brand's own first.
export function platformsFor(type, brand) {
  const allowed = STUDIO_TYPES[type].platforms;
  const mine = (brand?.intel?.platforms || []).map((p) => (type === "text" && p === "x" ? "twitter" : p));
  const first = allowed.filter((p) => mine.includes(p));
  return [...first, ...allowed.filter((p) => !first.includes(p))];
}

export const platformName = (type, p) => (type === "text" ? TEXT_PLATFORM_LABELS[p] : platformLabel(p));

/* -------------------------------------------------------------- grounding --
   Checks what Huesy knows for this piece, researches only the gaps, and
   returns the evidence pack with its proof.
----------------------------------------------------------------------------- */

export function useGrounding() {
  const { brand, targets } = useBrandPayload();
  const [steps, setSteps] = useState([]);
  const [pack, setPack] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async ({ type, platform, topic, sourceIds, borrowedFrom }) => {
      setRunning(true);
      setError(null);
      setSteps([]);
      let got = null;
      await streamNdjson("/api/studio/ground", { type, platform, topic, sourceIds, borrowedFrom, brand, targets }, (e) => {
        if (e.t === "step") setSteps((s) => withStep(s, e));
        else if (e.t === "pack") {
          got = e.pack;
          setPack(e.pack);
        } else if (e.t === "error") setError({ code: e.code, message: e.message });
      });
      setRunning(false);
      return got;
    },
    [brand, targets]
  );

  return { steps, pack, setPack, error, running, run };
}

/* -------------------------------------------------------------- the start --
   What it's about, where it goes, and (for some types) its size. "Let me
   pick" leaves the topic to the evidence.
----------------------------------------------------------------------------- */

export function StartPanel({ type, topic, setTopic, platform, setPlatform, platforms, children, sources, onStart, busy, cta, note }) {
  const Icon = TYPE_ICONS[type];
  return (
    <div className="flex flex-col gap-6 rounded-[24px] border border-line bg-surface p-5 sm:p-7">
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
          <Icon size={20} weight="bold" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-[22px] leading-tight">{STUDIO_TYPES[type].label === "Post" ? "A new post" : `A new ${STUDIO_TYPES[type].label.toLowerCase()}`}</h2>
          <p className="mt-1 text-[13.5px] text-muted">{STUDIO_TYPES[type].blurb}</p>
        </div>
      </div>
      {sources?.length ? (
        <div className="rounded-2xl border border-mist bg-mist-soft px-4 py-3">
          <p className="text-[12.5px] font-medium text-mist-deep">Built from what you picked</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {sources.slice(0, 3).map((f) => (
              <li key={f.id} className="line-clamp-2 text-[13px] leading-snug text-mist-deep/90">
                {f.statement}
              </li>
            ))}
          </ul>
          {sources.length > 3 ? <p className="mt-1 text-[12px] text-mist-deep/80">and {sources.length - 3} more</p> : null}
        </div>
      ) : null}
      <Field label="What's it about?" htmlFor="st-topic" hint="Leave it empty and I'll pick the strongest topic from what's working.">
        <Input id="st-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="A product, a question people ask, a moment" maxLength={120} />
      </Field>
      <Field label="Where will it go?">
        <Segmented label="Platform" value={platform} onChange={setPlatform} options={platforms.map((p) => ({ id: p, label: platformName(type, p) }))} size="sm" className="flex-wrap" />
      </Field>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={onStart} loading={busy} disabled={busy}>
          <Sparkle size={16} weight="fill" />
          {cta}
        </Button>
        {note ? <span className="text-[12.5px] text-muted">{note}</span> : null}
      </div>
    </div>
  );
}

// The research step, live, then the evidence card.
export function GroundingView({ steps, running, pack, error, onRetry }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {running ? (
        <motion.div key="run" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING} className="rounded-[20px] border border-accent-line bg-accent-soft/50 p-4 sm:p-5">
          <p className="text-[14px] font-medium text-ink">Finding what works first</p>
          <Steps steps={steps} live className="mt-3" />
        </motion.div>
      ) : error ? (
        <GateNote key="err" error={error} onRetry={onRetry} />
      ) : pack ? (
        <motion.div key="pack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
          <ProofCard pack={pack} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// The findings someone chose to build from (?from=id,id).
export function useSources(ids) {
  const [sources, setSources] = useState([]);
  const key = (ids || []).join(",");
  useEffect(() => {
    if (!key) return;
    getJson(`/api/intel/findings?ids=${key}`).then((r) => !r.error && setSources(r.findings || []));
  }, [key]);
  return sources;
}

// "This uses 1 of your 10 creatives." Said before anything is counted.
export function AllowanceNote({ kind, account, counted, className }) {
  const a = account?.allowances?.[kind];
  if (!a) return null;
  const names = { creative: "creatives", carousel: "carousels", reel: "reels" };
  return (
    <p className={cx("text-[12.5px]", a.left > 0 || counted ? "text-muted" : "text-danger", className)}>
      {counted
        ? `Already counted. Everything else on this one is free.`
        : a.left > 0
          ? `Uses 1 of your ${a.limit} ${names[kind]} (${a.left} left this month).`
          : `You've used this month's ${names[kind]}.`}
    </p>
  );
}

export function StudioLockedTiles() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(STUDIO_TYPES).map(([type, t]) => {
        const Icon = TYPE_ICONS[type];
        return (
          <div key={type} className="flex items-start gap-3 rounded-[20px] border border-line bg-raised p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
              <Icon size={17} aria-hidden="true" />
            </span>
            <span>
              <span className="flex items-center gap-1.5 text-[14.5px] font-medium">
                {t.plural}
                <LockSimple size={12} className="text-faint" aria-hidden="true" />
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t.blurb}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Saves edits a moment after the last change, and says when it has. An edit
// still waiting is saved at once when the page is left (in the app or by
// closing the tab), and the browser asks before closing while one is in
// flight. `save(opts)` receives { keepalive } for the closing case.
export function useAutosave(save, deps, { delay = 700, enabled = true } = {}) {
  const [state, setState] = useState("idle");
  const first = useRef(true);
  const pending = useRef(false);
  const saving = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(async (opts) => {
    pending.current = false;
    saving.current = true;
    setState("saving");
    const r = await saveRef.current(opts || {});
    saving.current = false;
    setState(r?.error ? "error" : "saved");
    return r;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (first.current) {
      first.current = false;
      return undefined;
    }
    pending.current = true;
    setState("pending");
    const t = setTimeout(() => run(), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const onHide = () => {
      if (pending.current) run({ keepalive: true });
    };
    const onBefore = (e) => {
      if (pending.current || saving.current) {
        onHide();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBefore);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBefore);
      // Leaving the page inside the app: save what's waiting now.
      if (pending.current) run({ keepalive: true });
    };
  }, [run]);

  return { state, retry: () => run() };
}

export function SaveState({ state, onRetry }) {
  const text = { pending: "Editing", saving: "Saving", saved: "Saved", error: "Couldn't save" }[state];
  if (!text) return null;
  return (
    <span className={cx("inline-flex items-center gap-2 text-[12px]", state === "error" ? "text-danger" : "text-faint")} aria-live="polite">
      {text}
      {state === "error" && onRetry ? (
        <button type="button" onClick={onRetry} className="rounded-full bg-danger-soft px-2.5 py-0.5 font-medium text-danger pointer-coarse:min-h-11">
          Try again
        </button>
      ) : null}
    </span>
  );
}

// Delete in two taps: the first asks, the second deletes. `note` says what
// happens (a counted piece stays counted).
export function ConfirmDelete({ onConfirm, note }) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return undefined;
    const t = setTimeout(() => setSure(false), 5000);
    return () => clearTimeout(t);
  }, [sure]);
  return sure ? (
    <span className="flex items-center gap-2">
      {note ? <span className="hidden text-[12px] text-muted sm:inline">{note}</span> : null}
      <Button size="sm" variant="danger" onClick={onConfirm}>
        Delete it
      </Button>
    </span>
  ) : (
    <IconButton label="Delete" onClick={() => setSure(true)} variant="quiet">
      <Trash size={16} />
    </IconButton>
  );
}

export function NewLink({ type, from, className, children }) {
  return (
    <Link href={`/studio/${type}${from ? `?from=${from}` : ""}`} className={className}>
      {children}
    </Link>
  );
}
