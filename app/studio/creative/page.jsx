"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowsClockwise, Check, Copy, DownloadSimple, ImageSquare, Plus, Sparkle, Trash } from "@phosphor-icons/react";
import AppShell from "../../../components/shell/AppShell";
import Huesy from "../../../components/huesy/Huesy";
import { Badge, Button, ErrorNote, Field, IconButton, Input, SPRING, Segmented, Skeleton, Textarea, cx, toast } from "../../../components/ui";
import { GateNote, Locked } from "../../../components/plan/PlanBits";
import { ProofBadge, ProofCard } from "../../../components/intel/IntelBits";
import { ConfirmDelete, GroundingView, SaveState, StartPanel, platformsFor, useAutosave, useBrandPayload, useGrounding, useSources } from "../../../components/studio/StudioBits";
import { CreativeCanvas, Scaled, sizeOf } from "../../../components/studio/Canvas";
import VisualSheet from "../../../components/studio/VisualSheet";
import { refreshAccount, useAccountData } from "../../../lib/account";
import { getJson, sendJson } from "../../../lib/stream";
import { ASPECTS, CREATIVE_LAYOUTS, LAYOUT_LABELS, THEMES } from "../../../lib/studio/options";
import { copyText, exportPng } from "../../../lib/studio/exporter";

export default function CreativePage() {
  return (
    <Suspense fallback={null}>
      <Creative />
    </Suspense>
  );
}

const MAX_ROUNDS = 5;
const MAX_VISUALS = 4;

function Creative() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const from = params.get("from");
  const { account, ready } = useAccountData();
  const { brand, targets, rawBrand } = useBrandPayload();
  const sources = useSources(from ? from.split(",") : []);
  const ground = useGrounding();

  const platforms = platformsFor("creative", rawBrand);
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [platform, setPlatform] = useState(platforms[0]);
  const [aspect, setAspect] = useState("4:5");
  const [item, setItem] = useState(null);
  const [imagesOn, setImagesOn] = useState(true);
  const [loading, setLoading] = useState(Boolean(id));
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [choosing, setChoosing] = useState(null);
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    if (!id || item?.id === id) return;
    setLoading(true);
    getJson(`/api/studio/items?id=${id}`).then((r) => {
      setLoading(false);
      if (r.error) {
        setMissing(true);
        return;
      }
      setItem(r.item);
      setImagesOn(r.imagesConnected !== false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const start = async () => {
    setError(null);
    setBusy("ideas");
    const pack = await ground.run({ type: "creative", platform, topic: topic.trim() || null, sourceIds: from ? from.split(",") : [] });
    if (!pack) {
      setBusy(null);
      return;
    }
    const r = await sendJson("/api/studio/creative", { action: "concepts", pack, topic: topic.trim() || null, aspect, brand, targets });
    setBusy(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    setItem(r.item);
    setImagesOn(r.imagesConnected !== false);
    router.replace(`/studio/creative?id=${r.item.id}`, { scroll: false });
  };

  const moreIdeas = async () => {
    setError(null);
    setBusy("more");
    const r = await sendJson("/api/studio/creative", { action: "concepts", itemId: item.id, pack: item.grounding, brand, targets });
    setBusy(null);
    if (r.error) setError(r.error);
    else setItem(r.item);
  };

  const chooseVisual = async ({ source, uploadPath }) => {
    setError(null);
    setBusy(source);
    const r = await sendJson("/api/studio/creative", { action: "visual", itemId: item.id, conceptIndex: choosing.index, concept: choosing.concept, source, uploadPath, brand });
    setBusy(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    const firstTime = !item.counted;
    setItem(r.item);
    setChoosing(null);
    setBrowsing(false);
    refreshAccount();
    if (firstTime) toast("Counted as one of this month's creatives. Edits from here are free.", { tone: "good" });
  };

  const remove = async () => {
    const r = await sendJson(`/api/studio/items?id=${item.id}`, null, "DELETE");
    if (r.error) toast(r.error.message);
    else {
      toast("Creative deleted");
      router.push("/studio#library");
    }
  };

  if (ready && account && !account.studio) {
    return (
      <AppShell title="Creative" back={{ href: "/studio", label: "Studio" }}>
        <Locked need="studio" title="Creatives are part of Studio" body="One image post with words on it, built on an opening that's measured to work in your niche. Studio includes 10 a month." />
      </AppShell>
    );
  }

  const visuals = item?.body?.visuals || [];
  const step = !id && !item ? "start" : loading || !item ? "loading" : visuals.length && !browsing ? "editor" : "ideas";

  return (
    <AppShell
      title={step === "start" ? "New creative" : item?.title || "Creative"}
      docTitle="Creative"
      back={{ href: "/studio", label: "Studio" }}
      actions={item ? <ConfirmDelete onConfirm={remove} note={item.counted ? "It stays counted this month" : null} /> : null}
    >
      {missing ? (
        <ErrorNote
          action={
            <Button as={Link} href="/studio" size="sm" variant="quiet">
              Back to Studio
            </Button>
          }
        >
          I couldn't find that creative. It may have been deleted.
        </ErrorNote>
      ) : step === "loading" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_1fr]">
          <Skeleton className="aspect-[4/5] rounded-[20px]" />
          <Skeleton className="h-80 rounded-[20px]" />
        </div>
      ) : step === "start" ? (
        <div className="mx-auto flex max-w-[720px] flex-col gap-5">
          <StartPanel
            type="creative"
            topic={topic}
            setTopic={setTopic}
            platform={platform}
            setPlatform={setPlatform}
            platforms={platforms}
            sources={sources}
            onStart={start}
            busy={Boolean(busy)}
            cta="Find what works and write 3 ideas"
            note="Ideas are free. A creative counts once you pick its picture."
          >
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-ink">Size</span>
              <Segmented label="Size" size="sm" value={aspect} onChange={setAspect} options={Object.entries(ASPECTS).map(([k, a]) => ({ id: k, label: a.label }))} className="flex-wrap" />
            </div>
          </StartPanel>
          <GroundingView steps={ground.steps} running={ground.running} pack={busy ? ground.pack : null} error={ground.error} onRetry={start} />
          {busy === "ideas" && ground.pack ? <WritingNote text="Writing 3 ideas on that pattern" /> : null}
          <GateNote error={error} onRetry={start} />
        </div>
      ) : step === "ideas" ? (
        <Ideas
          item={item}
          busy={busy}
          error={error}
          onMore={moreIdeas}
          onPick={(concept, index) => setChoosing({ concept, index })}
          onBack={visuals.length ? () => setBrowsing(false) : null}
          brandName={rawBrand.brandName}
        />
      ) : (
        <Editor
          item={item}
          setItem={setItem}
          brandName={rawBrand.brandName}
          onIdeas={() => setBrowsing(true)}
          onNewVisual={() => setChoosing({ concept: item.body.chosen, index: (item.body.concepts || []).findIndex((c) => c.headline === item.body.chosen?.headline) })}
        />
      )}

      <VisualSheet
        open={Boolean(choosing)}
        onClose={() => setChoosing(null)}
        concept={choosing?.concept}
        account={account}
        counted={item?.counted}
        imagesOn={imagesOn}
        used={visuals.length}
        max={MAX_VISUALS}
        onChoose={chooseVisual}
        busy={busy}
        error={choosing ? error : null}
      />
    </AppShell>
  );
}

function WritingNote({ text }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3" aria-live="polite">
      <Huesy mood="write" size={30} track={false} />
      <p className="text-[14px] text-ink">{text}…</p>
    </motion.div>
  );
}

function Ideas({ item, busy, error, onMore, onPick, onBack, brandName }) {
  const concepts = item.body?.concepts || [];
  const rounds = item.body?.ideaRounds || 1;
  const aspect = item.body?.aspect || "4:5";
  // Newest round first, so "more ideas" shows its results at the top; each
  // round keeps the order it was written in.
  const ordered = useMemo(() => concepts.map((c, i) => ({ c, i, round: Math.floor(i / 3) })).sort((a, b) => b.round - a.round || a.i - b.i), [concepts]);
  return (
    <div className="flex flex-col gap-6">
      {item.grounding ? <ProofCard pack={item.grounding} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[22px]">Pick an idea</h2>
          <p className="mt-1 text-[13.5px] text-muted">Each one follows the pattern above. You can change every word after.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onBack ? (
            <Button variant="ghost" size="sm" onClick={onBack}>
              Back to the design
            </Button>
          ) : null}
          <Button variant="quiet" size="sm" onClick={onMore} loading={busy === "more"} disabled={Boolean(busy) || rounds >= MAX_ROUNDS}>
            <ArrowsClockwise size={14} />
            {rounds >= MAX_ROUNDS ? "That's 5 rounds" : "3 more ideas"}
          </Button>
        </div>
      </div>
      <GateNote error={!busy ? error : null} onRetry={onMore} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ordered.map(({ c, i }, k) => (
          <motion.article
            key={`${i}-${c.headline}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: Math.min(k, 5) * 0.05 }}
            className="flex flex-col overflow-hidden rounded-[22px] border border-line bg-surface"
          >
            <div className="pointer-events-none border-b border-line">
              <Scaled aspect={aspect} label={`Preview: ${c.headline}`}>
                <CreativeCanvas aspect={aspect} layout={c.layout} theme="blush" headline={c.headline} subline={c.subline} brandName={brandName} />
              </Scaled>
            </div>
            <div className="flex flex-1 flex-col gap-2.5 p-4">
              <h3 className="text-[15.5px] font-medium leading-snug">{c.headline}</h3>
              {c.subline ? <p className="text-[13.5px] text-muted">{c.subline}</p> : null}
              <p className="text-[12.5px] leading-relaxed text-muted">
                <span className="font-medium text-ink">Picture:</span> {c.visual}
              </p>
              <p className="text-[12.5px] leading-relaxed text-accent-deep">{c.why}</p>
              <div className="mt-auto pt-2">
                <Button size="sm" onClick={() => onPick(c, i)} disabled={Boolean(busy)}>
                  <Sparkle size={14} weight="fill" />
                  Use this idea
                </Button>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </div>
  );
}

function Editor({ item, setItem, brandName, onNewVisual, onIdeas }) {
  const b = item.body || {};
  const [headline, setHeadline] = useState(b.headline || "");
  const [subline, setSubline] = useState(b.subline || "");
  const [layout, setLayout] = useState(b.layout || "statement");
  const [theme, setTheme] = useState(b.theme || "blush");
  const [aspect, setAspect] = useState(b.aspect || "4:5");
  const [caption, setCaption] = useState(b.caption || "");
  const [tags, setTags] = useState((b.hashtags || []).map((h) => `#${h}`).join(" "));
  const [active, setActive] = useState(b.active ?? (b.visuals?.length ? b.visuals.length - 1 : 0));
  const [exporting, setExporting] = useState(false);
  const canvas = useRef(null);
  const visuals = b.visuals || [];
  const visual = visuals[active];

  // A new visual arrives: show it.
  useEffect(() => {
    setActive(b.active ?? visuals.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visuals.length]);

  const hashtags = tags
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 12);

  const autosave = useAutosave(
    async (o) => {
      const r = await sendJson("/api/studio/creative", { action: "save", itemId: item.id, patch: { headline, subline, layout, theme, aspect, caption, hashtags, active } }, "POST", o);
      if (!r.error) setItem((it) => ({ ...it, title: r.item.title, status: r.item.status, body: { ...it.body, ...r.item.body } }));
      return r;
    },
    [headline, subline, layout, theme, aspect, caption, tags, active]
  );

  const download = async () => {
    setExporting(true);
    try {
      await exportPng(canvas.current, sizeOf(aspect), headline || "creative");
      const r = await sendJson("/api/studio/creative", { action: "save", itemId: item.id, patch: { exported: true } });
      if (!r.error) setItem((it) => ({ ...it, status: "ready" }));
      toast("Downloaded. It's marked ready in your Library.", { tone: "good" });
    } catch {
      toast("I couldn't make the file. Try again, or try another browser.");
    }
    setExporting(false);
  };

  const fullCaption = `${caption}${hashtags.length ? `\n\n${hashtags.map((h) => `#${h}`).join(" ")}` : ""}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-3 lg:sticky lg:top-[88px]">
        <motion.div layout className="overflow-hidden rounded-[20px] border border-line shadow-card">
          <Scaled aspect={aspect} label={`Your creative: ${headline}`}>
            <CreativeCanvas ref={canvas} aspect={aspect} layout={layout} theme={theme} headline={headline} subline={subline} image={visual?.url} brandName={brandName} />
          </Scaled>
        </motion.div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={download} loading={exporting} disabled={exporting}>
            <DownloadSimple size={15} />
            Download PNG
          </Button>
          <Button
            variant="quiet"
            onClick={async () => {
              if (await copyText(fullCaption)) toast("Caption copied", { tone: "good" });
            }}
          >
            <Copy size={15} />
            Copy caption
          </Button>
          <span className="ml-auto flex items-center gap-2">
            {item.status === "ready" ? <Badge tone="accent">Ready</Badge> : null}
            <SaveState state={autosave.state} onRetry={autosave.retry} />
          </span>
        </div>
        {visual?.sample ? <p className="text-[12px] text-faint">The picture is a stand-in while AI photos are in practice mode.</p> : null}
      </div>

      <div className="flex flex-col gap-6 rounded-[24px] border border-line bg-surface p-5 sm:p-6">
        <section className="flex flex-col gap-4">
          <Field label="Headline" htmlFor="cr-head" hint="The words on the picture. Eight or fewer read best.">
            <Input id="cr-head" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={90} />
          </Field>
          <Field label="Second line" htmlFor="cr-sub" hint="Optional.">
            <Input id="cr-sub" value={subline} onChange={(e) => setSubline(e.target.value)} maxLength={120} />
          </Field>
        </section>

        <section className="flex flex-col gap-2.5">
          <span className="text-[13px] font-medium">Layout</span>
          <div className="flex flex-wrap gap-1.5">
            {CREATIVE_LAYOUTS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={layout === l}
                onClick={() => setLayout(l)}
                className={cx(
                  "rounded-full border px-3.5 py-1.5 text-[13px] transition-[transform,border-color,background-color] active:scale-[0.97] pointer-coarse:min-h-11",
                  layout === l ? "border-ink bg-ink text-canvas" : "border-line bg-raised text-muted hover:text-ink"
                )}
              >
                {LAYOUT_LABELS[l]}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <span className="text-[13px] font-medium">Colours</span>
          <div className="flex flex-wrap gap-2.5">
            {Object.entries(THEMES).map(([k, t]) => (
              <button
                key={k}
                type="button"
                aria-label={t.label}
                aria-pressed={theme === k}
                title={t.label}
                onClick={() => setTheme(k)}
                className={cx("relative h-10 w-10 rounded-full border-2 transition-transform active:scale-[0.94] pointer-coarse:h-11 pointer-coarse:w-11", theme === k ? "border-ink" : "border-transparent")}
                style={{ background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)` }}
              >
                {theme === k ? <Check size={14} weight="bold" className="absolute inset-0 m-auto" style={{ color: t.ink }} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <span className="text-[13px] font-medium">Size</span>
          <Segmented label="Size" size="sm" value={aspect} onChange={setAspect} options={Object.entries(ASPECTS).map(([k, a]) => ({ id: k, label: a.label }))} className="flex-wrap" />
        </section>

        <section className="flex flex-col gap-2.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-medium">Picture</span>
            <span className="text-[12px] text-muted">
              {visuals.length} of {MAX_VISUALS} used
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            {visuals.map((v, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={active === i}
                aria-label={`Picture ${i + 1}${v.source === "design" ? ", words and colour only" : ""}`}
                onClick={() => setActive(i)}
                className={cx("relative h-16 w-14 overflow-hidden rounded-xl border-2 bg-sunken transition-transform active:scale-[0.95]", active === i ? "border-ink" : "border-transparent")}
              >
                {v.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted">
                    <ImageSquare size={18} aria-hidden="true" />
                  </span>
                )}
              </button>
            ))}
            {visuals.length < MAX_VISUALS ? (
              <button
                type="button"
                onClick={onNewVisual}
                className="flex h-16 w-14 items-center justify-center rounded-xl border-2 border-dashed border-line-strong text-muted transition-[transform,color] hover:text-ink active:scale-[0.95]"
                aria-label="Another picture"
                title="Another picture"
              >
                <Plus size={18} weight="bold" />
              </button>
            ) : null}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <Field label="Caption" htmlFor="cr-cap">
            <Textarea id="cr-cap" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </Field>
          <Field label="Hashtags" htmlFor="cr-tags" hint="Separated by spaces.">
            <Input id="cr-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
        </section>

        {b.chosen?.why || b.proof ? (
          <section className="rounded-2xl bg-sunken px-4 py-3.5">
            <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
              Why it should work
              <ProofBadge proof={b.proof} />
            </p>
            {b.chosen?.why ? <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{b.chosen.why}</p> : null}
            <button type="button" onClick={onIdeas} className="mt-2 text-[12.5px] font-medium text-accent-deep underline decoration-accent-line underline-offset-2">
              See the other ideas
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}
