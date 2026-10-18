"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowCounterClockwise, Copy, Trash } from "@phosphor-icons/react";
import AppShell from "../../../components/shell/AppShell";
import Huesy from "../../../components/huesy/Huesy";
import { Badge, Button, ErrorNote, IconButton, SPRING, Skeleton, cx, toast } from "../../../components/ui";
import { GateNote, Locked } from "../../../components/plan/PlanBits";
import { ProofCard } from "../../../components/intel/IntelBits";
import { ConfirmDelete, GroundingView, SaveState, StartPanel, platformName, platformsFor, useAutosave, useBrandPayload, useGrounding, useSources } from "../../../components/studio/StudioBits";
import { refreshAccount, useAccountData } from "../../../lib/account";
import { getJson, sendJson } from "../../../lib/stream";
import { TEXT_EVIDENCE_PLATFORM } from "../../../lib/studio/options";
import { replaceSection, sectionList } from "../../../lib/parse";
import { copyText } from "../../../lib/studio/exporter";

export default function TextPage() {
  return (
    <Suspense fallback={null}>
      <TextPost />
    </Suspense>
  );
}

const LABELS = { CAPTION: "Caption", POST: "Post", TWEET: "Post", THREAD: "Thread", SUBJECT: "Subject line", BODY: "Email" };
const CHANGES = [
  { id: "shorter", label: "Shorter", note: "Make it shorter and tighter." },
  { id: "bolder", label: "Bolder", note: "Make it bolder and more opinionated, without hype." },
  { id: "warmer", label: "Warmer", note: "Make it warmer and more personal." },
  { id: "question", label: "End on a question", note: "End with one easy question that invites replies." },
  { id: "another", label: "Another take", note: "Write a different take: a new opening and a new angle on the same idea." },
];

function TextPost() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const from = params.get("from");
  const { account, ready } = useAccountData();
  const { brand, targets, rawBrand } = useBrandPayload();
  const sources = useSources(from ? from.split(",") : []);
  const ground = useGrounding();
  const platforms = platformsFor("text", rawBrand);
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [platform, setPlatform] = useState(platforms[0]);
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [alsoFor, setAlsoFor] = useState(null);

  useEffect(() => {
    if (!id || item?.id === id) return;
    setLoading(true);
    getJson(`/api/studio/items?id=${id}`).then((r) => {
      setLoading(false);
      if (r.error) setMissing(true);
      else setItem(r.item);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const write = async ({ forPlatform = platform, pack: given, newItem = true } = {}) => {
    setError(null);
    setBusy("write");
    // A newsletter has no platform of its own to measure, so it's grounded on
    // LinkedIn posts and says so.
    const evidence = TEXT_EVIDENCE_PLATFORM[forPlatform];
    const pack =
      given ||
      (await ground.run({
        type: "text",
        platform: evidence,
        topic: (topic.trim() || item?.body?.topic || "").trim() || null,
        sourceIds: from ? from.split(",") : [],
        borrowedFrom: forPlatform === "email" ? evidence : null,
      }));
    if (!pack) {
      setBusy(null);
      return;
    }
    const r = await sendJson("/api/studio/text", { platform: forPlatform, pack, topic: topic.trim() || item?.body?.topic || null, brand, targets });
    setBusy(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    refreshAccount();
    if (newItem) {
      setItem(r.item);
      router.replace(`/studio/text?id=${r.item.id}`, { scroll: false });
    }
    return r.item;
  };

  const remove = async () => {
    const r = await sendJson(`/api/studio/items?id=${item.id}`, null, "DELETE");
    if (r.error) toast(r.error.message);
    else {
      toast("Post deleted");
      router.push("/studio#library");
    }
  };

  if (ready && account && !account.studio) {
    return (
      <AppShell title="Post" back={{ href: "/studio", label: "Studio" }}>
        <Locked need="studio" title="Writing is part of Studio" body="Captions, LinkedIn posts, threads and newsletters, opening the way your niche responds to, up to 30 a day." />
      </AppShell>
    );
  }

  const step = !id && !item ? "start" : loading || !item ? "loading" : "editor";
  const text = account?.text;

  return (
    <AppShell
      title={step === "start" ? "New post" : item?.title || "Post"}
      docTitle="Post"
      back={{ href: "/studio", label: "Studio" }}
      actions={item ? <ConfirmDelete onConfirm={remove} /> : null}
    >
      {missing ? (
        <ErrorNote
          action={
            <Button as={Link} href="/studio" size="sm" variant="quiet">
              Back to Studio
            </Button>
          }
        >
          I couldn't find that post. It may have been deleted.
        </ErrorNote>
      ) : step === "loading" ? (
        <Skeleton className="h-80 w-full" />
      ) : step === "start" ? (
        <div className="mx-auto flex max-w-[720px] flex-col gap-5">
          <StartPanel
            type="text"
            topic={topic}
            setTopic={setTopic}
            platform={platform}
            setPlatform={setPlatform}
            platforms={platforms}
            sources={sources}
            onStart={() => write()}
            busy={Boolean(busy)}
            cta="Find what works and write it"
            note={text ? `Up to ${text.perDay} a day. ${text.usedToday} written today.` : null}
          />
          <GroundingView steps={ground.steps} running={ground.running} pack={busy ? ground.pack : null} error={ground.error} onRetry={() => write()} />
          {busy && ground.pack ? (
            <div className="flex items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3" aria-live="polite">
              <Huesy mood="write" size={30} track={false} />
              <p className="text-[14px]">Writing it on that pattern…</p>
            </div>
          ) : null}
          <GateNote error={error} onRetry={() => write()} />
        </div>
      ) : (
        <Editor item={item} setItem={setItem} brand={brand} targets={targets} onAlso={async (p) => {
          // Written for another platform, it's grounded again on that platform's evidence.
          setAlsoFor(p);
          const made = await write({ forPlatform: p, newItem: false });
          setAlsoFor(null);
          if (made) router.push(`/studio/text?id=${made.id}`);
        }} alsoBusy={busy === "write" ? alsoFor : null} alsoError={error} />
      )}
    </AppShell>
  );
}

function Editor({ item, setItem, brand, targets, onAlso, alsoBusy, alsoError }) {
  const b = item.body || {};
  const [text, setText] = useState(b.text || "");
  const [changing, setChanging] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => setText(item.body?.text || ""), [item.body?.text]);
  const sections = sectionList(text);

  const autosave = useAutosave((o) => sendJson("/api/studio/items", { id: item.id, body: { text } }, "PATCH", o), [text]);

  const change = async (c) => {
    setChanging(c.id);
    setError(null);
    const r = await sendJson("/api/studio/text", { itemId: item.id, platform: b.platform, pack: item.grounding, feedback: c.note, brand, targets });
    setChanging(null);
    if (r.error) setError(r.error);
    else {
      setItem(r.item);
      refreshAccount();
    }
  };

  const restore = (v) => setText(v);
  const others = ["instagram", "linkedin", "twitter", "email"].filter((p) => p !== b.platform);
  const all = sections.map((s) => s.value).join("\n\n");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone="neutral">{platformName("text", b.platform)}</Badge>
          <div className="flex items-center gap-3">
            <SaveState state={autosave.state} onRetry={autosave.retry} />
            <Button
              size="sm"
              onClick={async () => {
                if (await copyText(all)) {
                  toast("Copied", { tone: "good" });
                  if (item.status !== "ready") sendJson("/api/studio/items", { id: item.id, status: "ready" }, "PATCH").then((r) => !r.error && setItem((it) => ({ ...it, status: "ready" })));
                }
              }}
            >
              <Copy size={14} />
              Copy all
            </Button>
          </div>
        </div>
        {sections.map((s, i) => (
          <motion.section key={s.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.05 }} className="rounded-[20px] border border-line bg-surface p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium text-muted">{LABELS[s.key] || s.key.toLowerCase()}</h2>
              <button
                type="button"
                onClick={async () => (await copyText(s.value)) && toast("Copied", { tone: "good" })}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:bg-sunken hover:text-ink pointer-coarse:min-h-11"
              >
                <Copy size={13} />
                Copy
              </button>
            </div>
            <label className="sr-only" htmlFor={`sec-${s.key}`}>
              {LABELS[s.key] || s.key}
            </label>
            <AutoText id={`sec-${s.key}`} value={s.value} onChange={(v) => setText((t) => replaceSection(t, s.key, v))} />
          </motion.section>
        ))}
        {b.versions?.length ? (
          <details className="rounded-[20px] border border-line bg-surface px-4 py-3 sm:px-5">
            <summary className="cursor-pointer text-[13px] font-medium text-muted">Earlier versions ({b.versions.length})</summary>
            <ul className="mt-3 flex flex-col gap-3">
              {[...b.versions].reverse().map((v, i) => (
                <li key={i} className="rounded-2xl bg-sunken p-3">
                  <p className="line-clamp-4 whitespace-pre-wrap text-[13px] text-ink/80">{sectionList(v).map((x) => x.value).join("\n\n")}</p>
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => restore(v)}>
                    <ArrowCounterClockwise size={13} />
                    Use this one
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-[88px]">
        <div className="rounded-[20px] border border-line bg-surface p-4">
          <p className="text-[13px] font-medium">Change it</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {CHANGES.map((c) => (
              <Button key={c.id} size="sm" variant="quiet" onClick={() => change(c)} loading={changing === c.id} disabled={Boolean(changing)}>
                {c.label}
              </Button>
            ))}
          </div>
          <GateNote error={error} className="mt-3" />
        </div>
        <div className="rounded-[20px] border border-line bg-surface p-4">
          <p className="text-[13px] font-medium">Write it for somewhere else</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {others.map((p) => (
              <Button key={p} size="sm" variant="quiet" onClick={() => onAlso(p)} disabled={Boolean(alsoBusy)} loading={alsoBusy === p}>
                {platformName("text", p)}
              </Button>
            ))}
          </div>
          <GateNote error={alsoError} className="mt-3" />
        </div>
        {item.grounding ? <ProofCard pack={item.grounding} /> : null}
      </aside>
    </div>
  );
}

function AutoText({ id, value, onChange }) {
  const [local, setLocal] = useState(value);
  // Take new text from outside (a rewrite, an older version), but never while
  // the person is typing in this box: the saved copy is trimmed, and syncing
  // mid-edit would eat a new line as it's typed.
  useEffect(() => {
    if (typeof document === "undefined" || document.activeElement?.id !== id) setLocal(value);
  }, [value, id]);
  return (
    <textarea
      id={id}
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
      rows={Math.min(18, Math.max(3, String(local).split("\n").length + 1))}
      className={cx("w-full resize-y rounded-xl border border-transparent bg-transparent px-0 text-[15px] leading-relaxed text-ink outline-none transition-[border-color,padding] focus:border-line focus:bg-raised focus:px-3 focus:py-2")}
    />
  );
}
