"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowsClockwise, Check, CheckCircle, Clock, Copy, DownloadSimple, FilmSlate, Paperclip, PaperPlaneRight, TrendUp, X } from "@phosphor-icons/react";
import AppShell from "../../../components/shell/AppShell";
import Huesy from "../../../components/huesy/Huesy";
import { Badge, Button, Chip, ErrorNote, Field, Input, SPRING, Segmented, Select, Skeleton, Textarea, cx, toast } from "../../../components/ui";
import { AllowanceTag, GateNote, Locked } from "../../../components/plan/PlanBits";
import { ProofCard, Steps, withStep } from "../../../components/intel/IntelBits";
import { AllowanceNote, platformsFor, useBrandPayload, useSources } from "../../../components/studio/StudioBits";
import { REEL_STATUS } from "../../../components/studio/ReelBits";
import { refreshAccount, useAccountData } from "../../../lib/account";
import { getJson, sendJson, streamNdjson } from "../../../lib/stream";
import { REEL_GOALS, REEL_STYLES } from "../../../lib/studio/options";
import { REELS } from "../../../lib/plans";
import { platformLabel } from "../../../lib/intel/taxonomy";
import { uploadFile } from "../../../lib/studio/upload";
import { copyText } from "../../../lib/studio/exporter";
import { countdown, dayLabel } from "../../../lib/when";

export default function ReelPage() {
  return (
    <Suspense fallback={null}>
      <Reel />
    </Suspense>
  );
}

const LENGTHS = ["", "7 to 15 seconds", "15 to 30 seconds", "30 to 60 seconds"];

function Reel() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const from = params.get("from");
  const { account, ready } = useAccountData();
  const { brand, targets, rawBrand } = useBrandPayload();
  const sources = useSources(from ? from.split(",") : []);
  const [reel, setReel] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [missing, setMissing] = useState(false);
  const [building, setBuilding] = useState(null);

  const load = async (rid = id) => {
    const r = await getJson(`/api/studio/reels?id=${rid}`);
    setLoading(false);
    if (r.error) setMissing(true);
    else setReel(r.reel);
  };

  useEffect(() => {
    if (!id || reel?.id === id) return;
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // A reel in the queue checks for news every minute while the page is open.
  useEffect(() => {
    if (!reel || !["requested", "in_production", "revision_requested"].includes(reel.status)) return undefined;
    const t = setInterval(() => document.visibilityState === "visible" && load(reel.id), 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel?.id, reel?.status]);

  const build = async (request, platform, reelId) => {
    setBuilding({ steps: [], error: null });
    let made = null;
    await streamNdjson("/api/studio/reels", { action: "brief", request, platform, reelId, sourceIds: from ? from.split(",") : [], brand, targets }, (e) => {
      if (e.t === "step") setBuilding((b) => ({ ...b, steps: withStep(b.steps, e) }));
      else if (e.t === "reel") made = e.reel;
      else if (e.t === "error") setBuilding((b) => ({ ...b, error: { code: e.code, message: e.message } }));
    });
    if (made) {
      setReel(made);
      setBuilding(null);
      try {
        sessionStorage.removeItem("huesy:reel-request");
      } catch {
        /* fine */
      }
      if (!reelId) router.replace(`/studio/reel?id=${made.id}`, { scroll: false });
    } else setBuilding((b) => ({ ...b, done: true }));
  };

  if (ready && account && !account.studio) {
    return (
      <AppShell title="Reel" back={{ href: "/studio", label: "Studio" }}>
        <Locked need="studio" title="Reels are part of Studio" body="Tell me what it's for. I brief it from proven reels and everything we've learned together, and it's made for you within 24 hours. Studio includes 3 a month." />
      </AppShell>
    );
  }

  const step = !id && !reel ? "request" : loading || !reel ? "loading" : reel.status;
  const title = step === "request" ? "Request a reel" : reel?.brief?.hooks?.[reel.request?.chosenHook ?? 0]?.line || reel?.request?.topic || "Reel";

  return (
    <AppShell title={title} docTitle="Reel" back={{ href: "/studio", label: "Studio" }}>
      {missing ? (
<ErrorNote
          action={
            <Button as={Link} href="/studio" size="sm" variant="quiet">
              Back to Studio
            </Button>
          }
        >
          I couldn't find that reel.
        </ErrorNote>
      ) : step === "loading" ? (
        <Skeleton className="h-96 w-full" />
      ) : step === "request" ? (
        <RequestForm brand={rawBrand} account={account} sources={sources} building={building} onBuild={(req, p) => build(req, p)} />
      ) : step === "draft" ? (
        <Draft reel={reel} setReel={setReel} account={account} building={building} onRebuild={() => build(reel.request, reel.request?.platform, reel.id)} />
      ) : step === "delivered" ? (
        <Delivered reel={reel} setReel={setReel} />
      ) : (
        <Status reel={reel} setReel={setReel} />
      )}
    </AppShell>
  );
}

/* ---------------------------------------------------------------- request -- */

// What's been typed into the request survives a reload until it's sent.
const DRAFT_KEY = "huesy:reel-request";
const readDraft = () => {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null") || {};
  } catch {
    return {};
  }
};

function RequestForm({ brand, account, sources, building, onBuild }) {
  const platforms = platformsFor("reel", brand);
  const [platform, setPlatform] = useState(platforms[0]);
  const [goal, setGoal] = useState(REEL_GOALS[0]);
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("faceless");
  const [length, setLength] = useState("");
  const [cta, setCta] = useState("");
  const [mustInclude, setMustInclude] = useState("");
  const [refs, setRefs] = useState("");
  const [voice, setVoice] = useState("");
  const [language, setLanguage] = useState("English");
  const [uploads, setUploads] = useState([]);
  // Read once the page is in the browser (never during the server render).
  const loaded = useRef(false);
  useEffect(() => {
    const d = readDraft();
    if (platforms.includes(d.platform)) setPlatform(d.platform);
    if (d.goal) setGoal(d.goal);
    if (d.topic) setTopic(d.topic);
    if (d.style) setStyle(d.style);
    if (d.length) setLength(d.length);
    if (d.cta) setCta(d.cta);
    if (d.mustInclude) setMustInclude(d.mustInclude);
    if (d.refs) setRefs(d.refs);
    if (d.voice) setVoice(d.voice);
    if (d.language) setLanguage(d.language);
    if (Array.isArray(d.uploads)) setUploads(d.uploads);
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ platform, goal, topic, style, length, cta, mustInclude, refs, voice, language, uploads }));
    } catch {
      /* fine without */
    }
  }, [platform, goal, topic, style, length, cta, mustInclude, refs, voice, language, uploads]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const file = useRef(null);
  const a = account?.allowances?.reel;
  const busy = Boolean(building && !building.done && !building.error);

  const add = async (files) => {
    setUploading(true);
    setUploadError(null);
    for (const f of [...files].slice(0, 8 - uploads.length)) {
      const r = await uploadFile(f, "reel");
      if (r.error) {
        setUploadError(r.error);
        break;
      }
      setUploads((u) => [...u, { path: r.path, name: f.name }]);
    }
    setUploading(false);
  };

  const submit = () =>
    onBuild(
      {
        goal,
        topic: topic.trim(),
        style,
        length,
        cta: cta.trim(),
        mustInclude: mustInclude.trim(),
        references: refs.split(/\s+/).filter((x) => /^https?:\/\//.test(x)),
        uploads: uploads.map((u) => u.path),
        voice: voice.trim(),
        language: language.trim() || "English",
      },
      platform
    );

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5">
      <div className="flex items-start gap-4 rounded-[24px] border border-line bg-surface p-5 sm:p-7">
        <Huesy mood="idle" size={52} />
        <div>
          <h2 className="font-display text-[22px] leading-tight">Tell me what it's for</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
            I'll brief it from reels that are working in your niche right now and from everything we've learned together. You check the brief, then
            it's made for you within {REELS.dueHours} hours.
          </p>
          {a ? <p className="mt-2 text-[12.5px] text-muted">{a.left} of {a.limit} reels left this month.</p> : null}
        </div>
      </div>
      {sources.length ? (
        <div className="rounded-2xl border border-mist bg-mist-soft px-4 py-3 text-[13px] text-mist-deep">
          <span className="font-medium">Built from what you picked:</span> {sources[0].statement}
        </div>
      ) : null}

      <div className="flex flex-col gap-6 rounded-[24px] border border-line bg-surface p-5 sm:p-7">
        <Field label="What's it for?">
          <div className="flex flex-wrap gap-1.5">
            {REEL_GOALS.map((g) => (
              <Chip key={g} selected={goal === g} onClick={() => setGoal(g)}>
                {g}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="What's it about?" htmlFor="rl-topic" hint="Leave it empty and I'll pick the strongest topic from what's working.">
          <Input id="rl-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Our new barrier cream, a question customers ask, a launch" maxLength={160} />
        </Field>
        <Field label="Where will it go?">
          <Segmented label="Platform" size="sm" value={platform} onChange={setPlatform} options={platforms.map((p) => ({ id: p, label: platformLabel(p) }))} />
        </Field>
        <Field label="Style">
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(REEL_STYLES).map(([k, st]) => (
              <button
                key={k}
                type="button"
                aria-pressed={style === k}
                onClick={() => setStyle(k)}
                className={cx("rounded-[18px] border p-3.5 text-left transition-[transform,border-color,background-color] active:scale-[0.99]", style === k ? "border-ink bg-raised" : "border-line bg-surface hover:border-line-strong")}
              >
                <span className="flex items-center justify-between gap-2 text-[14px] font-medium">
                  {st.label}
                  {style === k ? <Check size={14} weight="bold" aria-hidden="true" /> : null}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted">{st.desc}</span>
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Length" htmlFor="rl-len">
            <Select id="rl-len" value={length} onChange={(e) => setLength(e.target.value)}>
              {LENGTHS.map((l) => (
                <option key={l} value={l}>
                  {l || "Let the data decide"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Call to action" htmlFor="rl-cta" hint="Optional.">
            <Input id="rl-cta" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Shop the barrier cream" maxLength={160} />
          </Field>
        </div>
        <Field label="Must include" htmlFor="rl-must" hint="Optional. Product names, claims you're allowed to make, a price, a date.">
          <Textarea id="rl-must" rows={2} value={mustInclude} onChange={(e) => setMustInclude(e.target.value)} maxLength={600} />
        </Field>
        <Field label="Reels you like" htmlFor="rl-refs" hint="Optional. Links, one per line.">
          <Textarea id="rl-refs" rows={2} value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="https://www.instagram.com/reel/…" />
        </Field>
        <Field label="Your footage" hint="Optional. Product shots, clips or photos to use. Up to 8.">
          <input ref={file} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => e.target.files?.length && add(e.target.files)} />
          <div className="flex flex-wrap items-center gap-2">
            {uploads.map((u, i) => (
              <span key={u.path} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised py-1 pl-3 pr-1 text-[12.5px]">
                <span className="max-w-[160px] truncate">{u.name}</span>
                <button type="button" aria-label={`Remove ${u.name}`} onClick={() => setUploads((l) => l.filter((_, k) => k !== i))} className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink">
                  <X size={11} weight="bold" />
                </button>
              </span>
            ))}
            {uploads.length < 8 ? (
              <Button size="sm" variant="quiet" onClick={() => file.current?.click()} loading={uploading} disabled={uploading}>
                <Paperclip size={14} />
                Add files
              </Button>
            ) : null}
          </div>
          <GateNote error={uploadError} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Voice" htmlFor="rl-voice" hint="Optional. Who should it sound like?">
            <Input id="rl-voice" value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Warm female voice" maxLength={40} />
          </Field>
          <Field label="Language" htmlFor="rl-lang">
            <Input id="rl-lang" value={language} onChange={(e) => setLanguage(e.target.value)} maxLength={40} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button size="lg" onClick={submit} loading={busy} disabled={busy || (a && a.left <= 0)}>
            <FilmSlate size={16} weight="bold" />
            Build the brief
          </Button>
          <span className="text-[12.5px] text-muted">{a && a.left <= 0 ? "You've used this month's reels." : "The brief is free. The reel counts when you send it to be made."}</span>
        </div>
      </div>

      <AnimatePresence>
        {building ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING} className="rounded-[20px] border border-accent-line bg-accent-soft/50 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Huesy mood={building.error ? "oops" : "watch"} size={34} track={false} />
              <p className="text-[15px] font-medium">{building.error ? "The brief didn't finish" : "Building your brief"}</p>
            </div>
            <Steps steps={building.steps} live={!building.error} className="mt-3" />
            <GateNote error={building.error} onRetry={submit} className="mt-3" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ draft -- */

function Draft({ reel, setReel, account, building, onRebuild }) {
  const brief = reel.brief || {};
  const [hook, setHook] = useState(reel.request?.chosenHook ?? 0);
  const [notes, setNotes] = useState(reel.request?.notes || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const a = account?.allowances?.reel;

  const send = async () => {
    setSending(true);
    setError(null);
    const r = await sendJson("/api/studio/reels", { action: "submit", reelId: reel.id, hookIndex: hook, notes });
    setSending(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setReel(r.reel);
    refreshAccount();
    toast(`Sent. It'll be ready within ${REELS.dueHours} hours.`, { tone: "good" });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="flex flex-col gap-5">
        {reel.grounding ? <ProofCard pack={reel.grounding} /> : null}
        <section className="rounded-[24px] border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-[21px]">Pick the opening</h2>
          <p className="mt-1 text-[13px] text-muted">The first seconds decide whether people stay. Each of these follows an opening that works in your niche.</p>
          <div className="mt-4 flex flex-col gap-2.5" role="radiogroup" aria-label="Opening">
            {(brief.hooks || []).map((h, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={hook === i}
                onClick={() => setHook(i)}
                className={cx("rounded-[18px] border p-4 text-left transition-[transform,border-color,background-color] active:scale-[0.99]", hook === i ? "border-ink bg-raised" : "border-line hover:border-line-strong")}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-display text-[18px] leading-snug">"{h.line}"</span>
                  <span className={cx("mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", hook === i ? "border-ink bg-ink text-canvas" : "border-line-strong")}>{hook === i ? <Check size={11} weight="bold" /> : null}</span>
                </span>
                {h.onScreen ? <span className="mt-1.5 block text-[12.5px] text-muted">On screen: {h.onScreen}</span> : null}
                <span className="mt-1 block text-[12.5px] text-accent-deep">{h.why}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[21px]">The plan</h2>
            {brief.length ? <span className="text-[13px] text-muted">About {brief.length}</span> : null}
          </div>
          <ol className="mt-4 flex flex-col gap-3">
            {(brief.structure || []).map((beat, i) => (
              <li key={i} className="grid gap-1 rounded-2xl bg-sunken p-3.5 sm:grid-cols-[96px_1fr] sm:gap-4">
                <span className="text-[12.5px] font-medium text-ink">
                  {beat.beat}
                  <span className="block font-normal text-muted">{beat.seconds}s</span>
                </span>
                <span className="text-[13.5px] leading-relaxed">
                  {beat.voiceover ? <span className="block">"{beat.voiceover}"</span> : null}
                  {beat.onScreen ? <span className="block text-muted">On screen: {beat.onScreen}</span> : null}
                  {beat.visual ? <span className="block text-muted">Shot: {beat.visual}</span> : null}
                </span>
              </li>
            ))}
          </ol>
          {brief.sound ? (
            <p className="mt-4 text-[13.5px]">
              <span className="font-medium">Sound:</span> {brief.sound.pick}. <span className="text-muted">{brief.sound.why} Fallback: {brief.sound.fallback}.</span>
            </p>
          ) : null}
          {brief.whyItWorks ? <p className="mt-3 rounded-2xl bg-accent-soft/60 px-4 py-3 text-[13.5px] text-ink">{brief.whyItWorks}</p> : null}
        </section>

        <details className="rounded-[24px] border border-line bg-surface p-5 sm:p-6">
          <summary className="cursor-pointer font-display text-[19px]">Script, shots and caption</summary>
          <div className="mt-4 flex flex-col gap-4 text-[14px] leading-relaxed">
            {brief.script ? <p className="whitespace-pre-wrap">{brief.script}</p> : null}
            {brief.shots?.length ? (
              <ul className="list-disc pl-5 text-muted">
                {brief.shots.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            ) : null}
            {brief.caption ? <p className="whitespace-pre-wrap rounded-2xl bg-sunken p-3.5">{brief.caption}{brief.hashtags?.length ? `\n\n${brief.hashtags.map((h) => `#${h}`).join(" ")}` : ""}</p> : null}
            {brief.postingTip ? <p className="text-muted">{brief.postingTip}</p> : null}
          </div>
        </details>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-[88px]">
        <div className="flex flex-col gap-4 rounded-[24px] border border-line-strong bg-surface p-5 shadow-card">
          <Field label="Notes for the maker" htmlFor="rl-notes" hint="Optional. Anything to change or keep in mind.">
            <Textarea id="rl-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </Field>
          <AllowanceNote kind="reel" account={account} />
          <Button size="lg" onClick={send} loading={sending} disabled={sending || (a && a.left <= 0)}>
            <PaperPlaneRight size={16} weight="fill" />
            Send it to be made
            <AllowanceTag kind="reel" />
          </Button>
          <p className="text-[12.5px] leading-relaxed text-muted">
            Ready within {REELS.dueHours} hours. You can cancel until work starts, and you get one free change once it's delivered.
          </p>
          <GateNote error={error} onRetry={send} />
        </div>
        <Button variant="ghost" size="sm" onClick={onRebuild} loading={Boolean(building && !building.done && !building.error)} className="self-start">
          <ArrowsClockwise size={14} />
          Build the brief again
        </Button>
        {building?.error ? <GateNote error={building.error} /> : null}
      </aside>
    </div>
  );
}

/* ----------------------------------------------------------------- status -- */

function Timeline({ reel }) {
  const order = ["requested", "in_production", "delivered"];
  const revising = reel.status === "revision_requested";
  const at = revising ? 1 : order.indexOf(reel.status);
  const labels = ["Requested", revising ? "Change" : "Being made", "Delivered"];
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {labels.map((l, i) => (
        <li key={l} className="flex flex-1 items-center gap-2">
          <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium", i < at ? "border-ink bg-ink text-canvas" : i === at ? "border-accent-deep bg-accent-soft text-accent-deep" : "border-line text-faint")} aria-current={i === at ? "step" : undefined}>
            {i < at ? <Check size={12} weight="bold" /> : i + 1}
          </span>
          <span className={cx("text-[13px]", i === at ? "font-medium text-ink" : "text-muted")}>{l}</span>
          {i < labels.length - 1 ? <span className={cx("h-px flex-1", i < at ? "bg-ink" : "bg-line")} aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );
}

function Status({ reel, setReel }) {
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const due = countdown(reel.due_at, now);
  const hook = reel.brief?.hooks?.[reel.request?.chosenHook ?? 0];

  const cancel = async () => {
    setCancelling(true);
    const r = await sendJson("/api/studio/reels", { action: "cancel", reelId: reel.id });
    setCancelling(false);
    if (r.error) setError(r.error);
    else {
      setReel(r.reel);
      refreshAccount();
      toast("Cancelled. It's back in this month's reels.");
    }
  };

  if (reel.status === "cancelled") {
    return (
      <div className="mx-auto max-w-[680px] rounded-[24px] border border-line bg-surface p-6">
        <Badge>Cancelled</Badge>
        <p className="mt-3 text-[15px]">This reel was cancelled, and it went back into this month's reels.</p>
        <Button as={Link} href="/studio/reel" size="sm" className="mt-4">
          Request another reel
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-5">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex flex-col gap-5 rounded-[24px] border border-line bg-surface p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <Huesy mood="watch" size={52} track={false} />
          <div className="min-w-0">
            <Badge tone={REEL_STATUS[reel.status]?.tone}>{REEL_STATUS[reel.status]?.label}</Badge>
            <h2 className="font-display mt-2 text-[22px] leading-snug">
              {reel.status === "revision_requested" ? "Your change is being made" : reel.status === "in_production" ? "Your reel is being made" : "Your reel is in the queue"}
            </h2>
            {due ? (
              <p className={cx("mt-1.5 flex items-center gap-1.5 text-[14px]", due.late ? "text-accent-deep" : "text-muted")}>
                <Clock size={15} aria-hidden="true" />
                {due.late ? `Running ${due.text} late. It's being finished.` : `Ready within ${due.text}.`}
              </p>
            ) : null}
          </div>
        </div>
        <Timeline reel={reel} />
        {reel.request?.lateRefunded ? <p className="rounded-2xl bg-mist-soft px-4 py-3 text-[13px] text-mist-deep">This one is very late, so it's been given back to this month's reels. It's still being made for you.</p> : null}
        {reel.status === "requested" ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button size="sm" variant="quiet" onClick={cancel} loading={cancelling}>
              Cancel and get it back
            </Button>
            <span className="text-[12.5px] text-muted">You can cancel until work starts.</span>
          </div>
        ) : null}
        <GateNote error={error} />
      </motion.section>
      <section className="rounded-[24px] border border-line bg-surface p-5 sm:p-6">
        <h3 className="text-[13px] font-medium text-muted">What you asked for</h3>
        {hook ? <p className="font-display mt-2 text-[19px] leading-snug">"{hook.line}"</p> : null}
        <p className="mt-2 text-[13.5px] text-muted">
          {[REEL_STYLES[reel.request?.style]?.label, reel.request?.goal, reel.brief?.length].filter(Boolean).join(", ")}
        </p>
        {reel.request?.notes ? <p className="mt-2 text-[13.5px]">Notes: {reel.request.notes}</p> : null}
        {reel.revision_note ? <p className="mt-2 text-[13.5px]">Change asked for: {reel.revision_note}</p> : null}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- delivered -- */

function Delivered({ reel, setReel }) {
  const [changeOpen, setChangeOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [url, setUrl] = useState(reel.results?.url || "");
  const [views, setViews] = useState("");
  const [askViews, setAskViews] = useState(false);
  const [askDate, setAskDate] = useState(false);
  const [postedOn, setPostedOn] = useState(new Date().toISOString().slice(0, 10));
  const caption = reel.caption || reel.brief?.caption || "";
  const tags = reel.brief?.hashtags?.length ? `\n\n${reel.brief.hashtags.map((h) => `#${h}`).join(" ")}` : "";
  const results = reel.results || {};
  const best = results.best || 0;
  const revisionLeft = (reel.revisions_used || 0) < REELS.revisions;

  const revise = async () => {
    setBusy("revise");
    setError(null);
    const r = await sendJson("/api/studio/reels", { action: "revise", reelId: reel.id, note });
    setBusy(null);
    if (r.error) setError(r.error);
    else {
      setReel(r.reel);
      toast("Change requested. It's back in the queue.", { tone: "good" });
    }
  };

  const track = async () => {
    setBusy("track");
    setError(null);
    const r = await sendJson("/api/studio/reels", { action: "results", reelId: reel.id, url: url.trim(), views: views === "" ? undefined : Number(views), postedAt: results.postedAt ? undefined : postedOn });
    setBusy(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    setReel(r.reel);
    setViews("");
    setAskViews(Boolean(r.needsViews));
    setAskDate(Boolean(r.needsDate));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-3 lg:sticky lg:top-[88px]">
        <div className="overflow-hidden rounded-[22px] border border-line bg-[#141414] shadow-card">
          {reel.videoUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={reel.videoUrl} controls playsInline preload="metadata" className="aspect-[9/16] w-full bg-black object-contain" />
          ) : (
            <div className="flex aspect-[9/16] items-center justify-center text-[14px] text-white/70">The video link has expired. Reload the page.</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {reel.videoUrl ? (
            <Button as="a" href={`${reel.videoUrl}${reel.videoUrl.includes("?") ? "&" : "?"}download=reel.mp4`} download>
              <DownloadSimple size={15} />
              Download
            </Button>
          ) : null}
          <Button variant="quiet" onClick={async () => (await copyText(caption + tags)) && toast("Caption copied", { tone: "good" })}>
            <Copy size={15} />
            Copy caption
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <section className="rounded-[24px] border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <Huesy mood="found" size={40} />
            <div>
              <h2 className="font-display text-[21px] leading-tight">It's ready</h2>
              <p className="text-[13px] text-muted">Delivered {dayLabel(reel.delivered_at)}</p>
            </div>
          </div>
          {caption ? <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-sunken p-3.5 text-[14px] leading-relaxed">{caption + tags}</p> : null}
          {reel.brief?.postingTip ? <p className="mt-3 text-[13.5px] text-muted">{reel.brief.postingTip}</p> : null}
        </section>

        <section className="rounded-[24px] border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display flex items-center gap-2 text-[19px]">
              <TrendUp size={18} className="text-accent-deep" aria-hidden="true" />
              How it's doing
            </h3>
            {results.worked ? (
              <Badge tone="accent">
                <CheckCircle size={12} weight="fill" />
                Passed {REELS.successViews.toLocaleString("en-US")} views
              </Badge>
            ) : null}
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Once it's posted, paste the link. Check back at day 1, 3 and 7. We count a reel as working when it passes {REELS.successViews.toLocaleString("en-US")} views in its first week.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <Field label="Link to the posted reel" htmlFor="rl-url">
              <Input id="rl-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" inputMode="url" />
            </Field>
            {!results.postedAt ? (
              <Field label="When was it posted?" htmlFor="rl-posted" hint={askDate ? "I couldn't read the date from that link. Week one counts from this day." : "Week one counts from this day."}>
                <Input id="rl-posted" type="date" value={postedOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPostedOn(e.target.value)} className="w-auto" />
              </Field>
            ) : null}
            {askViews || results.checks?.length ? (
              <Field label="Views right now" htmlFor="rl-views" hint={askViews ? "I couldn't read the views from that link. Type them in." : "Optional. Leave it empty and I'll read them from the link."}>
                <Input id="rl-views" value={views} onChange={(e) => setViews(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="1820" />
              </Field>
            ) : null}
            <Button size="sm" variant="quiet" onClick={track} loading={busy === "track"} disabled={!url.trim() || Boolean(busy)} className="self-start">
              {results.checks?.length ? "Check again" : "Start tracking"}
            </Button>
          </div>
          {results.checks?.length ? (
            <ul className="mt-4 flex flex-col gap-1.5 text-[13px]">
              {results.checks.map((c, i) => (
                <li key={i} className="flex justify-between gap-3 border-t border-line pt-1.5">
                  <span className="text-muted">{dayLabel(c.at)}</span>
                  <span className="tabular font-medium">{Number(c.views).toLocaleString("en-US")} views</span>
                </li>
              ))}
            </ul>
          ) : null}
          {results.checks?.length && !results.worked ? (
            <p className="mt-2 text-[12.5px] text-muted">
              {results.settled
                ? `Its first week is over, with ${(results.weekBest || 0).toLocaleString("en-US")} views by day seven.`
                : `Best so far: ${best.toLocaleString("en-US")} views. ${results.postedAt ? `Week one ends ${new Date(new Date(results.postedAt).getTime() + 7 * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : ""}`}
            </p>
          ) : null}
        </section>

        <section className="rounded-[24px] border border-line bg-surface p-5 sm:p-6">
          <h3 className="font-display text-[19px]">Want a change?</h3>
          {revisionLeft ? (
            changeOpen ? (
              <div className="mt-3 flex flex-col gap-3">
                <Field label="What should change?" htmlFor="rl-change">
                  <Textarea id="rl-change" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Make the first line bigger and cut the last shot." maxLength={1200} />
                </Field>
                <div className="flex gap-2">
                  <Button size="sm" onClick={revise} loading={busy === "revise"} disabled={note.trim().length < 4}>
                    Send the change
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setChangeOpen(false)}>
                    Not now
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-[13.5px] text-muted">One change is included, back within {REELS.dueHours} hours.</p>
                <Button size="sm" variant="quiet" onClick={() => setChangeOpen(true)}>
                  Ask for a change
                </Button>
              </div>
            )
          ) : (
            <p className="mt-2 text-[13.5px] text-muted">This reel's free change has been used.</p>
          )}
        </section>
        <GateNote error={error} />
      </div>
    </div>
  );
}
