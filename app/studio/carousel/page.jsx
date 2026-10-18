"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowsClockwise, Check, Copy, DownloadSimple, FilePdf, MagicWand, Plus, Sparkle, Trash, X } from "@phosphor-icons/react";
import AppShell from "../../../components/shell/AppShell";
import Huesy from "../../../components/huesy/Huesy";
import { Badge, Button, Checkbox, ErrorNote, Field, IconButton, Input, SPRING, Segmented, Select, Sheet, Skeleton, Textarea, cx, toast } from "../../../components/ui";
import { AllowanceTag, GateNote, Locked } from "../../../components/plan/PlanBits";
import { ProofBadge, ProofCard } from "../../../components/intel/IntelBits";
import { AllowanceNote, ConfirmDelete, GroundingView, SaveState, StartPanel, platformsFor, useAutosave, useBrandPayload, useGrounding, useSources } from "../../../components/studio/StudioBits";
import { Scaled, SlideCanvas, sizeOf } from "../../../components/studio/Canvas";
import { refreshAccount, useAccountData } from "../../../lib/account";
import { getJson, sendJson } from "../../../lib/stream";
import { SLIDE_LABELS, SLIDE_LAYOUTS, THEMES } from "../../../lib/studio/options";
import { copyText, exportPdf, exportZip } from "../../../lib/studio/exporter";

export default function CarouselPage() {
  return (
    <Suspense fallback={null}>
      <Carousel />
    </Suspense>
  );
}

const MAX_ROUNDS = 5;
const MAX_REDOS = 3;
const MAX_PHOTOS = 2;
const ASPECT_OPTIONS = [
  { id: "4:5", label: "Portrait 4:5" },
  { id: "1:1", label: "Square 1:1" },
];

function Carousel() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const from = params.get("from");
  const { account, ready } = useAccountData();
  const { brand, targets, rawBrand } = useBrandPayload();
  const sources = useSources(from ? from.split(",") : []);
  const ground = useGrounding();

  const platforms = platformsFor("carousel", rawBrand);
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [platform, setPlatform] = useState(platforms[0]);
  const [count, setCount] = useState("7");
  const [item, setItem] = useState(null);
  const [imagesOn, setImagesOn] = useState(true);
  const [loading, setLoading] = useState(Boolean(id));
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

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
    setBusy("outline");
    const pack = await ground.run({ type: "carousel", platform, topic: topic.trim() || null, sourceIds: from ? from.split(",") : [] });
    if (!pack) {
      setBusy(null);
      return;
    }
    const r = await sendJson("/api/studio/carousel", { action: "outline", pack, topic: topic.trim() || null, slides: Number(count), brand, targets });
    setBusy(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    setItem(r.item);
    setImagesOn(r.imagesConnected !== false);
    router.replace(`/studio/carousel?id=${r.item.id}`, { scroll: false });
  };

  const remove = async () => {
    const r = await sendJson(`/api/studio/items?id=${item.id}`, null, "DELETE");
    if (r.error) toast(r.error.message);
    else {
      toast("Carousel deleted");
      router.push("/studio#library");
    }
  };

  if (ready && account && !account.studio) {
    return (
      <AppShell title="Carousel" back={{ href: "/studio", label: "Studio" }}>
        <Locked need="studio" title="Carousels are part of Studio" body="Swipeable slides shaped like the carousels that get saved in your niche, made in a couple of minutes. Studio includes 10 a month." />
      </AppShell>
    );
  }

  const step = !id && !item ? "start" : loading || !item ? "loading" : item.body?.generated ? "slides" : "outline";

  return (
    <AppShell
      title={step === "start" ? "New carousel" : item?.title || "Carousel"}
      docTitle="Carousel"
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
          I couldn't find that carousel. It may have been deleted.
        </ErrorNote>
      ) : step === "loading" ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : step === "start" ? (
        <div className="mx-auto flex max-w-[720px] flex-col gap-5">
          <StartPanel
            type="carousel"
            topic={topic}
            setTopic={setTopic}
            platform={platform}
            setPlatform={setPlatform}
            platforms={platforms}
            sources={sources}
            onStart={start}
            busy={Boolean(busy)}
            cta="Find what works and outline it"
            note="Outlines are free. A carousel counts when you generate it."
          >
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-medium text-ink">Slides</span>
              <Segmented label="Slides" size="sm" value={count} onChange={setCount} options={["5", "7", "9"].map((n) => ({ id: n, label: `${n} slides` }))} />
            </div>
          </StartPanel>
          <GroundingView steps={ground.steps} running={ground.running} pack={busy ? ground.pack : null} error={ground.error} onRetry={start} />
          {busy === "outline" && ground.pack ? (
            <div className="flex items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3" aria-live="polite">
              <Huesy mood="write" size={30} track={false} />
              <p className="text-[14px]">Outlining the slides on that pattern…</p>
            </div>
          ) : null}
          <GateNote error={error} onRetry={start} />
        </div>
      ) : step === "outline" ? (
        <Outline item={item} setItem={setItem} account={account} imagesOn={imagesOn} brand={brand} targets={targets} />
      ) : (
        <Slides item={item} setItem={setItem} imagesOn={imagesOn} brand={brand} brandName={rawBrand.brandName} />
      )}
    </AppShell>
  );
}

const newSlide = () => ({ layout: "tip", headline: "A new point", body: "", points: [], imagePrompt: "", image: null, key: Math.random().toString(36).slice(2) });
const withKeys = (slides) => (slides || []).map((s) => ({ ...s, key: s.key || Math.random().toString(36).slice(2) }));
const strip = (slides) => slides.map(({ key, ...s }) => s);
const tagText = (tags) => (tags || []).map((h) => `#${h}`).join(" ");
const tagList = (text) =>
  String(text || "")
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 12);

/* ---------------------------------------------------------------- outline -- */

function Outline({ item, setItem, account, imagesOn, brand, targets }) {
  const b = item.body || {};
  const [slides, setSlides] = useState(() => withKeys(b.slides));
  const [caption, setCaption] = useState(b.caption || "");
  const [tags, setTags] = useState(tagText(b.hashtags));
  const [photos, setPhotos] = useState(imagesOn);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [previous, setPrevious] = useState(null);
  const rounds = b.ideaRounds || 1;
  const withPhotos = slides.filter((s) => s.imagePrompt).length;

  const autosave = useAutosave(
    (o) => sendJson("/api/studio/carousel", { action: "save", itemId: item.id, patch: { slides: strip(slides), caption, hashtags: tagList(tags) } }, "POST", o),
    [slides, caption, tags]
  );

  const set = (i, patch) => setSlides((list) => list.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i, d) =>
    setSlides((list) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const rewrite = async () => {
    setBusy("rewrite");
    setError(null);
    const before = { slides, caption, tags };
    const r = await sendJson("/api/studio/carousel", { action: "outline", itemId: item.id, pack: item.grounding, slides: slides.length, brand, targets });
    setBusy(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    setItem(r.item);
    setSlides(withKeys(r.item.body.slides));
    setCaption(r.item.body.caption || "");
    setTags(tagText(r.item.body.hashtags));
    setPrevious(before);
  };

  const undoRewrite = () => {
    if (!previous) return;
    setSlides(previous.slides);
    setCaption(previous.caption);
    setTags(previous.tags);
    setPrevious(null);
  };

  const generate = async () => {
    setBusy("generate");
    setError(null);
    const r = await sendJson("/api/studio/carousel", { action: "generate", itemId: item.id, slides: strip(slides), withImages: photos, brand });
    setBusy(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    refreshAccount();
    setItem(r.item);
    toast(r.failedImages ? `Made. ${r.failedImages} photo${r.failedImages > 1 ? "s" : ""} didn't come through; you can try again on the slide.` : "Made. Counted as one of this month's carousels.", { tone: "good" });
  };

  return (
    <div className="flex flex-col gap-6">
      {item.grounding ? <ProofCard pack={item.grounding} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[22px]">The outline</h2>
          <p className="mt-1 text-[13.5px] text-muted">Change anything, move slides around, add or remove them. All free until you generate.</p>
        </div>
        <div className="flex items-center gap-3">
          <SaveState state={autosave.state} onRetry={autosave.retry} />
          {previous ? (
            <Button variant="ghost" size="sm" onClick={undoRewrite}>
              Bring back the last outline
            </Button>
          ) : null}
          <Button variant="quiet" size="sm" onClick={rewrite} loading={busy === "rewrite"} disabled={Boolean(busy) || rounds >= MAX_ROUNDS}>
            <ArrowsClockwise size={14} />
            {rounds >= MAX_ROUNDS ? "That's 5 outlines" : "Write a new outline"}
          </Button>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {slides.map((s, i) => (
            <motion.li key={s.key} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={SPRING} className="rounded-[20px] border border-line bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display tabular flex h-8 w-8 items-center justify-center rounded-full bg-sunken text-[14px]">{i + 1}</span>
                <label className="sr-only" htmlFor={`layout-${s.key}`}>
                  Slide {i + 1} layout
                </label>
                <Select id={`layout-${s.key}`} value={s.layout} onChange={(e) => set(i, { layout: e.target.value })} className="h-9 w-auto min-w-[150px] text-[13px]">
                  {SLIDE_LAYOUTS.map((l) => (
                    <option key={l} value={l}>
                      {SLIDE_LABELS[l]}
                    </option>
                  ))}
                </Select>
                <span className="ml-auto flex items-center">
                  <IconButton label={`Move slide ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0} size={32}>
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton label={`Move slide ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === slides.length - 1} size={32}>
                    <ArrowDown size={14} />
                  </IconButton>
                  <IconButton label={`Remove slide ${i + 1}`} onClick={() => setSlides((l) => l.filter((_, k) => k !== i))} disabled={slides.length <= 3} size={32}>
                    <X size={14} />
                  </IconButton>
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Headline" htmlFor={`h-${s.key}`}>
                  <Input id={`h-${s.key}`} value={s.headline} onChange={(e) => set(i, { headline: e.target.value })} maxLength={120} />
                </Field>
                {s.layout === "list" || s.layout === "compare" ? (
                  <Field label={s.layout === "compare" ? "Before, then after (one per line)" : "Points (one per line)"} htmlFor={`p-${s.key}`}>
                    <Textarea id={`p-${s.key}`} rows={3} value={(s.points || []).join("\n")} onChange={(e) => set(i, { points: e.target.value.split("\n").slice(0, 4) })} />
                  </Field>
                ) : (
                  <Field label="Text" htmlFor={`b-${s.key}`}>
                    <Textarea id={`b-${s.key}`} rows={2} value={s.body} onChange={(e) => set(i, { body: e.target.value })} maxLength={400} />
                  </Field>
                )}
              </div>
              {imagesOn ? (
                <div className="mt-3">
                  {s.imagePrompt ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-sunken px-3 py-2 text-[12.5px] text-muted">
                      <MagicWand size={13} className="text-accent-deep" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">Photo: {s.imagePrompt}</span>
                      <button type="button" onClick={() => set(i, { imagePrompt: "" })} className="font-medium text-ink underline underline-offset-2">
                        No photo
                      </button>
                    </div>
                  ) : withPhotos < MAX_PHOTOS ? (
                    <button type="button" onClick={() => set(i, { imagePrompt: s.headline, layout: s.layout === "tip" ? "image" : s.layout })} className="text-[12.5px] font-medium text-accent-deep underline decoration-accent-line underline-offset-2">
                      Add a photo to this slide
                    </button>
                  ) : null}
                </div>
              ) : null}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      <Button variant="quiet" onClick={() => setSlides((l) => [...l.slice(0, -1), newSlide(), ...l.slice(-1)])} disabled={slides.length >= 10} className="self-start">
        <Plus size={15} weight="bold" />
        Add a slide
      </Button>

      <div className="grid gap-4 rounded-[20px] border border-line bg-surface p-5 sm:grid-cols-2">
        <Field label="Caption" htmlFor="ca-cap">
          <Textarea id="ca-cap" rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </Field>
        <Field label="Hashtags" htmlFor="ca-tags" hint="Separated by spaces.">
          <Input id="ca-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
      </div>

      <div className="sticky bottom-[calc(80px+env(safe-area-inset-bottom))] z-20 lg:bottom-4">
        <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-line-strong bg-surface p-3 pl-4 shadow-float">
          <div className="min-w-0 flex-1">
            <AllowanceNote kind="carousel" account={account} />
            {imagesOn && withPhotos ? <Checkbox checked={photos} onChange={setPhotos} label={`Make the ${withPhotos} slide photo${withPhotos > 1 ? "s" : ""} with AI`} className="mt-1.5" /> : null}
          </div>
          <Button onClick={generate} loading={busy === "generate"} disabled={Boolean(busy) || slides.length < 3 || (account?.allowances?.carousel?.left ?? 1) <= 0}>
            <Sparkle size={15} weight="fill" />
            Generate carousel
            <AllowanceTag kind="carousel" />
          </Button>
        </div>
        <GateNote error={error} className="mt-3" onRetry={generate} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- slides -- */

function Slides({ item, setItem, imagesOn, brand, brandName }) {
  const b = item.body || {};
  const [slides, setSlides] = useState(() => withKeys(b.slides));
  const [theme, setTheme] = useState(b.theme === "brand" || !b.theme ? "blush" : b.theme);
  const [aspect, setAspect] = useState(b.aspect || "4:5");
  const [caption, setCaption] = useState(b.caption || "");
  const [tags, setTags] = useState(tagText(b.hashtags));
  const [editing, setEditing] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [redoing, setRedoing] = useState(null);
  const refs = useRef([]);
  const redos = b.imageRedos || 0;

  // A new photo arrives from the server: take its slides, keep each slide's key.
  useEffect(() => setSlides((prev) => withKeys(item.body?.slides).map((x, i) => ({ ...x, key: prev[i]?.key || x.key }))), [item.body?.slides]);

  const autosave = useAutosave(
    (o) => sendJson("/api/studio/carousel", { action: "save", itemId: item.id, patch: { slides: strip(slides), theme, aspect, caption, hashtags: tagList(tags) } }, "POST", o),
    [slides, theme, aspect, caption, tags]
  );

  const done = async (kind) => {
    const r = await sendJson("/api/studio/carousel", { action: "save", itemId: item.id, patch: { exported: true } });
    if (!r.error) setItem((it) => ({ ...it, status: "ready" }));
    toast(`${kind} downloaded. It's marked ready in your Library.`, { tone: "good" });
  };

  const pdf = async () => {
    setExporting("pdf");
    try {
      await exportPdf(refs.current.slice(0, slides.length), sizeOf(aspect), item.title);
      await done("PDF");
    } catch {
      toast("I couldn't make the PDF. Try again.");
    }
    setExporting(null);
  };
  const zip = async () => {
    setExporting("zip");
    try {
      await exportZip(refs.current.slice(0, slides.length), sizeOf(aspect), item.title);
      await done("Slides");
    } catch {
      toast("I couldn't make the files. Try again.");
    }
    setExporting(null);
  };

  const redoPhoto = async (i, prompt) => {
    setRedoing(i);
    const r = await sendJson("/api/studio/carousel", { action: "image", itemId: item.id, slideIndex: i, prompt, brand });
    setRedoing(null);
    if (r.error) {
      toast(r.error.message, { duration: 6000 });
      return;
    }
    setItem(r.item);
  };

  const fullCaption = `${caption}${tagList(tags).length ? `\n\n${tagList(tags).map((h) => `#${h}`).join(" ")}` : ""}`;
  const edit = editing != null ? slides[editing] : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {b.proof ? <ProofBadge proof={b.proof} /> : null}
          {item.status === "ready" ? <Badge tone="accent">Ready</Badge> : null}
          <SaveState state={autosave.state} onRetry={autosave.retry} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={pdf} loading={exporting === "pdf"} disabled={Boolean(exporting)}>
            <FilePdf size={15} />
            Download PDF
          </Button>
          <Button variant="quiet" onClick={zip} loading={exporting === "zip"} disabled={Boolean(exporting)}>
            <DownloadSimple size={15} />
            Slides as PNGs
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
        </div>
      </div>

      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-5 sm:scroll-pl-5 sm:px-5 lg:-mx-8 lg:scroll-pl-8 lg:px-8" role="list" aria-label="Slides">
        {slides.map((s, i) => (
          <motion.div key={s.key} role="listitem" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: Math.min(i, 6) * 0.04 }} className="w-[260px] shrink-0 snap-start sm:w-[300px]">
            <button type="button" onClick={() => setEditing(i)} className="group relative block w-full overflow-hidden rounded-[18px] border border-line text-left shadow-soft transition-[transform,box-shadow] hover:shadow-card active:scale-[0.98]" aria-label={`Edit slide ${i + 1}`}>
              <Scaled aspect={aspect} label={`Slide ${i + 1}: ${s.headline}`}>
                <SlideCanvas ref={(el) => (refs.current[i] = el)} slide={s} index={i} total={slides.length} aspect={aspect} theme={theme} brandName={brandName} />
              </Scaled>
              <span className="absolute right-2 top-2 rounded-full bg-[#141414]/70 px-2.5 py-1 text-[11.5px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100">Edit</span>
              {redoing === i ? <span className="absolute inset-0 flex items-center justify-center bg-surface/60 text-[13px] font-medium">Making a new photo…</span> : null}
            </button>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 rounded-[24px] border border-line bg-surface p-5 sm:p-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
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
          <span className="mt-2 text-[13px] font-medium">Size</span>
          <Segmented label="Size" size="sm" value={aspect} onChange={setAspect} options={ASPECT_OPTIONS} />
          {b.why ? <p className="mt-2 rounded-2xl bg-sunken px-4 py-3 text-[13px] leading-relaxed text-muted">{b.why}</p> : null}
        </section>
        <section className="flex flex-col gap-3">
          <Field label="Caption" htmlFor="sl-cap">
            <Textarea id="sl-cap" rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </Field>
          <Field label="Hashtags" htmlFor="sl-tags" hint="Separated by spaces.">
            <Input id="sl-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
        </section>
      </div>

      <Sheet open={edit != null} onClose={() => setEditing(null)} title={edit ? `Slide ${editing + 1}` : ""} width={460}>
        {edit ? (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-[16px] border border-line">
              <Scaled aspect={aspect} label="Preview">
                <SlideCanvas slide={edit} index={editing} total={slides.length} aspect={aspect} theme={theme} brandName={brandName} />
              </Scaled>
            </div>
            <Field label="Layout" htmlFor="ed-layout">
              <Select id="ed-layout" value={edit.layout} onChange={(e) => setSlides((l) => l.map((s, k) => (k === editing ? { ...s, layout: e.target.value } : s)))}>
                {SLIDE_LAYOUTS.map((l) => (
                  <option key={l} value={l}>
                    {SLIDE_LABELS[l]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Headline" htmlFor="ed-h">
              <Input id="ed-h" value={edit.headline} onChange={(e) => setSlides((l) => l.map((s, k) => (k === editing ? { ...s, headline: e.target.value } : s)))} />
            </Field>
            {edit.layout === "list" || edit.layout === "compare" ? (
              <Field label="Points (one per line)" htmlFor="ed-p">
                <Textarea id="ed-p" rows={4} value={(edit.points || []).join("\n")} onChange={(e) => setSlides((l) => l.map((s, k) => (k === editing ? { ...s, points: e.target.value.split("\n").slice(0, 4) } : s)))} />
              </Field>
            ) : (
              <Field label="Text" htmlFor="ed-b">
                <Textarea id="ed-b" rows={3} value={edit.body} onChange={(e) => setSlides((l) => l.map((s, k) => (k === editing ? { ...s, body: e.target.value } : s)))} />
              </Field>
            )}
            {edit.layout === "image" && imagesOn ? (
              <div className="rounded-2xl bg-sunken p-3.5">
                <p className="text-[13px] font-medium">Photo</p>
                <p className="mt-0.5 text-[12.5px] text-muted">{MAX_REDOS - redos > 0 ? `${MAX_REDOS - redos} new photos left on this carousel.` : "This carousel has used its 3 new photos."}</p>
                <Button size="sm" variant="quiet" className="mt-2.5" onClick={() => redoPhoto(editing, edit.imagePrompt || edit.headline)} disabled={redos >= MAX_REDOS || redoing != null} loading={redoing === editing}>
                  <MagicWand size={14} />
                  {edit.image ? "Make a new photo" : "Make a photo"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
