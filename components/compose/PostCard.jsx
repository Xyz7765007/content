"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowClockwise,
  Check,
  Copy,
  DownloadSimple,
  EnvelopeSimple,
  FolderSimplePlus,
  ImageSquare,
  InstagramLogo,
  LinkedinLogo,
  MagicWand,
  XLogo,
} from "@phosphor-icons/react";
import { Button, IconButton, Input, Progress, SPRING, cx, toast } from "../ui";
import { useStore } from "../../lib/store";
import { genImage, rewrite } from "../../lib/api";
import { replaceSection, sectionList } from "../../lib/parse";

export const PLATFORM_META = {
  instagram: { label: "Instagram", icon: InstagramLogo, writing: "Writing the caption, the brief and the image prompt" },
  linkedin: { label: "LinkedIn", icon: LinkedinLogo, writing: "Writing your LinkedIn post" },
  twitter: { label: "X", icon: XLogo, writing: "Writing your post for X" },
  email: { label: "Newsletter", icon: EnvelopeSimple, writing: "Writing your newsletter" },
};

const SECTION_LABELS = {
  CAPTION: "Caption",
  CREATIVE_DETAILS: "Creative brief",
  IMAGE_PROMPT: "Image prompt",
  POST: "Post",
  TWEET: "Post",
  THREAD: "Thread",
  SUBJECT: "Subject line",
  BODY: "Body",
  PERSONALISATION_EXAMPLE: "Filled in example",
};
const labelFor = (key) => SECTION_LABELS[key] || key.replace(/_/g, " ").toLowerCase();

const REFINES = [
  { id: "shorter", label: "Shorter", note: "Make it shorter and tighter. Keep the hook." },
  { id: "bolder", label: "Bolder", note: "Make it bolder and more opinionated, without hype." },
  { id: "warmer", label: "Warmer", note: "Make it warmer and more personal." },
  { id: "nohash", label: "No hashtags", note: "Remove all hashtags." },
  { id: "question", label: "End on a question", note: "End with one easy question that invites replies." },
  { id: "another", label: "Another take", note: "Write a different take: a new hook and a new angle on the same signal." },
];

function useCopy() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return [
    copied,
    async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      } catch {
        toast("Your browser blocked copying. Select the text and copy it.");
      }
    },
  ];
}

// A text block that reads like the page but edits in place, growing with its
// content. Edits are saved as they are typed.
function EditableText({ value, onChange, label }) {
  const ref = useRef(null);
  const [local, setLocal] = useState(value);
  const timer = useRef(null);

  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [local]);

  return (
    <textarea
      ref={ref}
      value={local}
      aria-label={`${label}, editable`}
      rows={1}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(v), 450);
      }}
      onBlur={() => {
        clearTimeout(timer.current);
        if (local !== value) onChange(local);
      }}
      className="-mx-2 block w-[calc(100%+16px)] resize-none overflow-hidden rounded-lg border border-transparent bg-transparent p-2 text-[14.5px] leading-[1.65] text-ink transition-colors hover:border-line focus:border-accent-deep focus:bg-raised focus:outline-none"
    />
  );
}

export default function PostCard({ signal, platform, brand, state = "done", error, errorCode, onRetry, onSave, className }) {
  const reduced = useReducedMotion();
  const draft = useStore((s) => s.drafts?.[signal?.id]?.[platform]);
  const setDraftPost = useStore((s) => s.setDraftPost);
  const meta = PLATFORM_META[platform] || { label: platform, icon: MagicWand, writing: "Writing" };
  const Icon = meta.icon;
  const text = draft?.text || "";
  const sections = sectionList(text);
  const [refining, setRefining] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [copiedAll, copyAll] = useCopy();
  const [previous, setPrevious] = useState(null);

  const refine = async (note) => {
    if (!note?.trim() || refining) return;
    setRefining(true);
    setRefineOpen(false);
    const before = text;
    const r = await rewrite({ platform, signal, brand, value: before, feedback: note, whole: true });
    setRefining(false);
    if (r.error) {
      toast(r.error.message, { duration: 5000 });
      return;
    }
    const next = r.text?.includes("===") ? r.text : before;
    setDraftPost(signal.id, platform, next);
    setPrevious(before);
    setCustom("");
    toast("Rewritten", {
      tone: "good",
      action: {
        label: "Undo",
        onClick: () => {
          setDraftPost(signal.id, platform, before);
          setPrevious(null);
        },
      },
    });
  };

  const edit = (value) => {
    setDraftPost(signal.id, platform, value);
    setPrevious(null);
  };

  const plain = sections.length
    ? sections.map((s) => (sections.length > 1 ? `${labelFor(s.key)}\n${s.value}` : s.value)).join("\n\n")
    : text;

  return (
    <motion.article
      layout={reduced ? false : "position"}
      transition={SPRING}
      className={cx("rounded-[20px] border border-line bg-surface", className)}
    >
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunken text-ink">
            <Icon size={16} weight="regular" />
          </span>
          <h3 className="font-display text-[18px] leading-none">{meta.label}</h3>
          {state === "done" && text ? (
            <span className="rounded-full border border-line px-2 py-[2px] text-[11px] text-muted">AI draft</span>
          ) : null}
        </div>
        {state === "done" && text ? (
          <div className="flex items-center gap-1">
            {previous ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraftPost(signal.id, platform, previous);
                  setPrevious(null);
                }}
              >
                Undo rewrite
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setRefineOpen((v) => !v)} aria-expanded={refineOpen} disabled={refining}>
              {refining ? <ArrowClockwise size={14} className="animate-spin" /> : <MagicWand size={14} />}
              {refining ? "Rewriting" : "Refine"}
            </Button>
            <IconButton label={copiedAll ? "Copied" : "Copy all"} onClick={() => copyAll(plain)} size={34}>
              {copiedAll ? <Check size={15} weight="bold" /> : <Copy size={15} />}
            </IconButton>
            {onSave ? (
              <IconButton label="Save this post" onClick={() => onSave({ platform, text })} size={34}>
                <FolderSimplePlus size={16} />
              </IconButton>
            ) : null}
          </div>
        ) : null}
      </header>

      <AnimatePresence initial={false}>
        {refineOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden border-b border-line bg-sunken/60"
          >
            <div className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap gap-1.5">
                {REFINES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => refine(r.note)}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink transition-[transform,border-color] hover:border-line-strong active:scale-[0.97]"
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <form
                className="mt-2.5 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  refine(custom);
                }}
              >
                <Input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Or say what to change: mention the price, cut the last line…"
                  aria-label="What should change"
                  className="h-10 bg-surface"
                />
                <Button type="submit" size="md" variant="quiet" disabled={!custom.trim()}>
                  Rewrite
                </Button>
              </form>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="px-4 py-4 sm:px-5">
        {state === "writing" || (state === "queued" && !text) ? (
          <div aria-live="polite">
            <p className="text-[13.5px] text-muted">{state === "queued" ? "Waiting its turn" : `${meta.writing}…`}</p>
            <div className="mt-3 space-y-2">
              <div className="skeleton h-3 w-11/12 rounded-full" />
              <div className="skeleton h-3 w-4/5 rounded-full" />
              <div className="skeleton h-3 w-2/3 rounded-full" />
            </div>
          </div>
        ) : state === "error" ? (
          <div className="flex flex-wrap items-center gap-3" role="alert">
            <p className="min-w-0 flex-1 text-[14px] text-danger">{error || "I couldn't write this one."}</p>
            {errorCode === "studio_only" || errorCode === "no_plan" ? (
              <Button as={Link} href="/plans" size="sm" variant="quiet">
                See Studio
              </Button>
            ) : onRetry && errorCode !== "text_fair_use" ? (
              <Button size="sm" variant="quiet" onClick={onRetry}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : sections.length ? (
          <div className={cx("flex flex-col gap-4", refining && "opacity-50")}>
            {sections.map((s) => (
              <Section
                key={s.key}
                sectionKey={s.key}
                value={s.value}
                platform={platform}
                signal={signal}
                onChange={(v) => edit(replaceSection(text, s.key, v))}
              />
            ))}
          </div>
        ) : text ? (
          <EditableText value={text} label="Post" onChange={edit} />
        ) : null}
      </div>

      {state === "done" && text ? (
        <p className="border-t border-line px-4 py-2.5 text-[12px] text-faint sm:px-5">
          AI draft. Edit any line in place, and check the facts before you post.
        </p>
      ) : null}
    </motion.article>
  );
}

function Section({ sectionKey, value, onChange, platform, signal }) {
  const [copied, copy] = useCopy();
  const label = labelFor(sectionKey);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="meta">{label}</span>
        <button
          type="button"
          onClick={() => copy(value)}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-muted transition-colors hover:bg-sunken hover:text-ink"
        >
          {copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <EditableText value={value} label={label} onChange={onChange} />
      {platform === "instagram" && sectionKey === "IMAGE_PROMPT" ? <CreativeRender prompt={value} signal={signal} /> : null}
    </div>
  );
}

// Renders the image from the prompt with the image key in Brand settings.
// Without one, the prompt is still there to copy into any image tool.
function CreativeRender({ prompt, signal }) {
  const googleKey = useStore((s) => s.settings?.googleKey);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearInterval(timer.current), []);

  if (!googleKey) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted">
        <ImageSquare size={14} />
        Copy this into your image tool, or make it as a creative in Studio.
      </p>
    );
  }

  const run = async () => {
    setBusy(true);
    setResult(null);
    setElapsed(0);
    timer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    const r = await genImage(prompt, googleKey);
    clearInterval(timer.current);
    setResult(r);
    setBusy(false);
  };

  return (
    <div className="mt-3">
      <Button variant="quiet" size="sm" onClick={run} disabled={busy}>
        <ImageSquare size={15} />
        {busy ? `Rendering, ${elapsed}s` : result?.image ? "Render another" : "Render the creative"}
      </Button>
      {busy ? (
        <div className="mt-3 max-w-[340px]">
          <Progress indeterminate label="Rendering" detail="Usually under a minute, sometimes longer." />
        </div>
      ) : null}
      {result?.error ? <p className="mt-2 text-[13px] text-danger">{result.error}</p> : null}
      {result?.image ? (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.image} alt={`Creative for ${signal?.headline || "this post"}`} className="w-full rounded-xl border border-line" />
          <a
            href={result.image}
            download="huesy-creative.png"
            className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-accent-deep underline decoration-accent-line underline-offset-2"
          >
            <DownloadSimple size={14} />
            Download
          </a>
        </div>
      ) : null}
    </div>
  );
}
