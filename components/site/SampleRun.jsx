"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { ArrowClockwise, ArrowRight, Copy, Check } from "@phosphor-icons/react";
import { Button, SPRING, cx } from "../ui";
import Huesy from "../huesy/Huesy";
import { MARKETS, POST_TABS } from "../../lib/sample-run";
import { track } from "../../lib/site";
import { openJoin } from "./JoinSheet";

/**
 * A sample morning with Huesy, in about seven seconds and with no AI call:
 * pick a market, watch it search, three sample signals land, and the best
 * one becomes a post. Every brand is invented and every card says Sample.
 *
 * phases: ready -> watch -> found -> write -> done
 */

const SPEECH = {
  ready: "Pick a market and I'll show you a sample morning.",
  watch: "Checking Google News, Instagram and X…",
  found: "Three worth posting about. Best fit first.",
  write: "Writing the top one up…",
  done: "That's the loop. Yours would be your brand, in your voice.",
};

const MOOD = { ready: "idle", watch: "watch", found: "found", write: "write", done: "idle" };

export default function SampleRun({ autoplay = false, className, source = "demo" }) {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.4, once: true });
  const [marketId, setMarketId] = useState(null);
  const [phase, setPhase] = useState("ready");
  const [landed, setLanded] = useState(0);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("instagram");
  const [typed, setTyped] = useState(0);
  const [run, setRun] = useState(0);
  const tracked = useRef(new Set());
  const autoplayed = useRef(false);

  const market = MARKETS.find((m) => m.id === marketId) || null;
  const postText = market?.post?.[tab] || "";

  const start = useCallback(
    (id) => {
      setMarketId(id);
      setTab("instagram");
      setRun((r) => r + 1);
      if (!tracked.current.has(id)) {
        tracked.current.add(id);
        track("sample_run", `${source}:${id}`);
      }
    },
    [source]
  );

  // Plays once on its own, the first time it is on screen, where asked to.
  useEffect(() => {
    if (!autoplay || !inView || autoplayed.current || marketId) return undefined;
    autoplayed.current = true;
    if (reduced) {
      start(MARKETS[0].id);
      return undefined;
    }
    const t = setTimeout(() => start(MARKETS[0].id), 900);
    return () => clearTimeout(t);
  }, [autoplay, inView, reduced, marketId, start]);

  // The run itself.
  useEffect(() => {
    if (!market) return undefined;
    if (reduced) {
      setPhase("done");
      setLanded(3);
      setTyped(Infinity);
      return undefined;
    }
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    setPhase("watch");
    setLanded(0);
    setTyped(0);
    market.queries.forEach((q, i) => at(i * 430, () => setQuery(q)));
    at(1350, () => setPhase("found"));
    [0, 1, 2].forEach((i) => at(1400 + i * 330, () => setLanded(i + 1)));
    at(3500, () => setPhase("write"));
    return () => timers.forEach(clearTimeout);
  }, [market, run, reduced]);

  // Types the post out while writing; switching tabs shows it whole.
  useEffect(() => {
    if (phase !== "write" || reduced) return undefined;
    let raf;
    let last = performance.now();
    let shown = 0;
    const step = (now) => {
      shown += ((now - last) / 1000) * 150;
      last = now;
      setTyped(Math.floor(shown));
      if (shown < postText.length) raf = requestAnimationFrame(step);
      else setTimeout(() => setPhase("done"), 350);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, postText, reduced]);

  const pickTab = (id) => {
    setTab(id);
    setTyped(Infinity);
    if (phase === "write") setPhase("done");
  };

  const showPost = phase === "write" || phase === "done";

  return (
    <div
      ref={ref}
      className={cx(
        "relative flex flex-col overflow-hidden rounded-[24px] border border-line bg-surface p-4 shadow-card sm:p-5",
        className
      )}
    >
      {/* Huesy narrates */}
      <div className="flex items-center gap-3">
        <Huesy mood={MOOD[phase]} size={40} />
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={phase}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[14px] leading-snug text-ink"
            >
              {SPEECH[phase]}
            </motion.p>
          </AnimatePresence>
          <p className="meta mt-0.5 h-4 truncate normal-case tracking-normal text-faint" aria-hidden="true">
            {phase === "watch" && query ? `Searching: ${query}` : market ? `Sample run · ${market.label}` : "Sample run"}
          </p>
        </div>
      </div>

      {/* Markets */}
      <div role="radiogroup" aria-label="Pick a market" className="no-scrollbar -mx-1 mt-3.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {MARKETS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={marketId === m.id}
            onClick={() => start(m.id)}
            className={cx(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.97] pointer-coarse:min-h-11",
              marketId === m.id
                ? "border-ink bg-ink font-medium text-canvas"
                : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Stage: signals, then the post. Fixed height, so nothing jumps. */}
      <div className="relative mt-3.5 h-[344px]">
        <AnimatePresence initial={false} mode="wait">
          {!showPost ? (
            <motion.div
              key={`signals-${run}`}
              className="absolute inset-0 flex flex-col gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -16 }}
              transition={{ duration: 0.22 }}
            >
              {[0, 1, 2].map((i) =>
                market && landed > i ? (
                  <motion.article
                    key={`${market.id}-${i}`}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={SPRING}
                    className={cx(
                      "relative rounded-[16px] border bg-raised p-3.5",
                      i === 0 && phase !== "watch" ? "border-line-strong shadow-soft" : "border-line"
                    )}
                  >
                    <SampleTag />
                    <div className="flex flex-wrap items-center gap-1.5 pr-14 text-[11.5px]">
                      <span className="rounded-full border border-line bg-sunken px-2 py-[1px] font-medium text-ink">
                        {market.signals[i].type}
                      </span>
                      <span className="text-muted">
                        {market.signals[i].source} · {market.signals[i].ago}
                      </span>
                    </div>
                    <h3 className="font-display mt-1.5 text-[15.5px] leading-snug text-ink">{market.signals[i].headline}</h3>
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-mist-deep">{market.signals[i].why}</p>
                  </motion.article>
                ) : (
                  <div
                    key={`ghost-${i}`}
                    className={cx(
                      "rounded-[16px] border border-dashed border-line-strong p-3.5",
                      phase === "watch" ? "skeleton border-transparent" : ""
                    )}
                    style={{ height: 106 }}
                    aria-hidden="true"
                  >
                    {phase === "ready" && i === 1 ? (
                      <p className="flex h-full items-center justify-center text-[13px] text-faint">
                        Signals land here, newest first
                      </p>
                    ) : null}
                  </div>
                )
              )}
            </motion.div>
          ) : (
            <motion.div
              key={`post-${run}`}
              className="absolute inset-0 flex flex-col"
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={SPRING}
            >
              <div className="rounded-[14px] border border-mist bg-mist-soft px-3.5 py-2.5">
                <p className="meta text-[10px] text-mist-deep">Writing about</p>
                <p className="mt-0.5 line-clamp-1 text-[13.5px] font-medium text-ink">{market.signals[0].headline}</p>
              </div>

              <div role="tablist" aria-label="Post format" className="no-scrollbar mt-3 flex gap-1 overflow-x-auto">
                {POST_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => pickTab(t.id)}
                    className={cx(
                      "relative shrink-0 rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                      tab === t.id ? "font-medium text-ink" : "text-muted hover:text-ink"
                    )}
                  >
                    {tab === t.id ? (
                      <motion.span layoutId="sample-tab" transition={SPRING} className="absolute inset-0 rounded-full bg-sunken" />
                    ) : null}
                    <span className="relative">{t.label}</span>
                  </button>
                ))}
              </div>

              <div className="relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-line bg-raised">
                <SampleTag />
                <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-3.5 pr-16">
                  <p
                    className={cx(
                      "whitespace-pre-wrap text-[13px] leading-[1.65] text-ink",
                      phase === "write" && typed < postText.length ? "caret" : ""
                    )}
                  >
                    {postText.slice(0, typed === Infinity ? undefined : typed)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-line px-3.5 py-2">
                  <span className="text-[11.5px] text-faint">Sample post for {market.you}, a sample brand</span>
                  <CopyChip text={postText} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The end of the loop is the ask */}
      <div className="mt-3.5 flex min-h-[40px] flex-wrap items-center justify-between gap-2">
        {phase === "done" && market ? (
          <>
            <Button size="md" onClick={() => openJoin({ source: `demo:${market.id}`, watch: market.id })}>
              Get this for my market
              <ArrowRight size={15} weight="bold" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => start(market.id)}>
              <ArrowClockwise size={14} />
              Replay
            </Button>
          </>
        ) : (
          <p className="text-[12.5px] text-faint">Every brand here is invented. No AI is used in this sample.</p>
        )}
      </div>
    </div>
  );
}

function SampleTag() {
  return (
    <span className="absolute right-3 top-3 rounded-full border border-line bg-sunken px-2 py-[1px] text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
      Sample
    </span>
  );
}

function CopyChip({ text }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] text-muted transition-[transform,color] hover:text-ink active:scale-[0.97]"
    >
      {done ? <Check size={12} weight="bold" /> : <Copy size={12} />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}
