"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { ChatCircleDots, PencilSimpleLine, Plus, RocketLaunch, TrendUp } from "@phosphor-icons/react";
import { SPRING, Segmented, cx } from "../ui";
import Huesy from "../huesy/Huesy";
import { SiteFooter, SiteNav } from "./SiteChrome";
import JoinForm from "./JoinForm";
import JoinSheet from "./JoinSheet";
import SampleRun from "./SampleRun";
import { campaign, track } from "../../lib/site";

/**
 * The waitlist site. One goal: a place on the list. Huesy itself carries the
 * page: it hears things in the opening screen, runs the sample, and reacts in
 * the sections below, so the page says what the product does with very few
 * words. Built for a phone first; every section is a few words and a thing to
 * look at or tap.
 */
export default function Landing() {
  useEffect(() => {
    campaign();
    track("view", "landing");
  }, []);

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <SiteNav />
      <main id="main">
        <Hero />
        <TrySection />
        <Jobs />
        <TwoMornings />
        <Faq />
        <Finale />
      </main>
      <SiteFooter />
      <Suspense fallback={null}>
        <JoinSheet />
      </Suspense>
    </div>
  );
}

function Reveal({ children, className, delay = 0 }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------- hero --
   Huesy listening, and the things it hears popping up around it one by one:
   a launch, a rising trend, a question buyers keep asking, a post ready.
----------------------------------------------------------------------------- */

const HEARD = [
  { icon: RocketLaunch, text: "A rival just launched a refill", at: "left-0 top-[4%]" },
  { icon: TrendUp, text: "#skincareroutine is rising", at: "right-0 top-[30%]" },
  { icon: ChatCircleDots, text: "“Is it worth it?” keeps coming up", at: "left-0 bottom-[22%]" },
  { icon: PencilSimpleLine, text: "Your post is ready", at: "right-[4%] bottom-0", ready: true },
];

function HueStage({ className }) {
  const reduced = useReducedMotion();
  const [heard, setHeard] = useState(0);
  useEffect(() => {
    if (reduced) {
      setHeard(HEARD.length);
      return undefined;
    }
    const timers = HEARD.map((_, i) => setTimeout(() => setHeard(i + 1), 600 + i * 700));
    return () => timers.forEach(clearTimeout);
  }, [reduced]);
  // Scanning while it listens, a happy hop once the post is ready.
  const mood = heard >= HEARD.length ? "found" : heard ? "watch" : "idle";

  return (
    <div className={cx("relative mx-auto w-full max-w-[440px]", className)} aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="scale-[0.82] sm:scale-100">
          <Huesy mood={mood} size={168} />
        </div>
      </div>
      {HEARD.map((h, i) => {
        const Icon = h.icon;
        return heard > i ? (
          <motion.div
            key={h.text}
            className={cx("absolute max-w-[78%]", h.at)}
            initial={reduced ? false : { opacity: 0, scale: 0.6, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 18 }}
          >
            <motion.span
              animate={reduced ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 3.2 + i * 0.45, repeat: Infinity, ease: "easeInOut" }}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium shadow-soft sm:text-[13.5px]",
                h.ready ? "border-accent-line bg-accent-soft text-accent-deep" : "border-line bg-raised text-ink"
              )}
            >
              <Icon size={14} weight="bold" className={h.ready ? "" : "text-accent-deep"} />
              <span className="truncate">{h.text}</span>
            </motion.span>
          </motion.div>
        ) : null;
      })}
    </div>
  );
}

function Hero() {
  return (
    <section className="relative -mt-16 overflow-hidden pt-16">
      <div className="aurora grain absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-2 px-4 pb-12 pt-4 sm:px-6 lg:min-h-[min(calc(100dvh-64px),720px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-14 lg:px-8 lg:py-10">
        <HueStage className="h-[clamp(230px,34dvh,300px)] lg:order-2 lg:h-[420px]" />
        <div className="max-w-[560px] lg:order-1">
          <h1 className="display-xl text-[44px] sm:text-[58px] lg:text-[68px]">Hear it first. Post it first.</h1>
          <p className="mt-3 max-w-[34ch] text-[17px] leading-relaxed text-muted sm:text-[19px]">
            Huesy watches your market and writes the posts. You just pick.
          </p>
          <div className="mt-6 max-w-[520px]" data-hero-join>
            <JoinForm source="hero" note="We let people in a few at a time. Your email is only for your invite." />
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- try --
   The product, running. A title and the sample, nothing to read first.
----------------------------------------------------------------------------- */

function TrySection() {
  return (
    <section id="sample" className="scroll-mt-20 border-y border-line bg-surface py-12 lg:py-20">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:gap-14 lg:px-8">
        <Reveal>
          <h2 className="display-lg text-[34px] sm:text-[44px]">Try it. Pick a market.</h2>
          <p className="mt-2 text-[16px] text-muted">Seven seconds, start to post.</p>
        </Reveal>
        <Reveal delay={0.06}>
          <SampleRun autoplay source="section" />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- jobs --
   What it does, as three moods of Huesy. Swipe on a phone; wider, watching
   runs across the top with finding and writing under it.
----------------------------------------------------------------------------- */

const WATCHES = ["News", "Instagram", "TikTok", "X", "LinkedIn", "Reddit", "YouTube", "Reviews"];
const FINDS = [
  { tag: "Launch", text: "A rival's new range" },
  { tag: "Trend", text: "A topic taking off" },
  { tag: "Question", text: "What buyers keep asking" },
];
const WRITES = ["Posts", "Carousels", "Creatives", "Reels"];

function Chip({ children, tone = "plain" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[12.5px]",
        tone === "accent" ? "border-accent-line bg-surface text-accent-deep" : "border-line bg-surface text-ink"
      )}
    >
      {children}
    </span>
  );
}

function JobCard({ mood, title, line, className, children }) {
  return (
    <article className={cx("flex w-[84%] shrink-0 snap-start flex-col gap-4 rounded-[24px] border p-5 sm:w-[60%] md:w-auto", className)}>
      <div className="flex items-center gap-3">
        <Huesy mood={mood} size={48} track={false} />
        <h3 className="display-lg text-[24px] leading-tight">{title}</h3>
      </div>
      <p className="text-[15px] leading-snug text-ink/80">{line}</p>
      <div className="mt-auto">{children}</div>
    </article>
  );
}

function Jobs() {
  return (
    <section id="how" className="scroll-mt-20 py-14 lg:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="display-lg text-[34px] sm:text-[44px]">One nosy blob. Three jobs.</h2>
        </Reveal>
        {/* A phone swipes through the three; wider screens see them together. */}
        <Reveal delay={0.06}>
          <div className="no-scrollbar -mx-4 mt-6 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
            <JobCard mood="watch" title="It watches" line="Your market, every day, wherever your buyers talk." className="aurora border-line md:col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {WATCHES.map((w) => (
                  <Chip key={w}>{w}</Chip>
                ))}
              </div>
            </JobCard>
            <JobCard mood="found" title="It finds" line="What's worth a post, ranked for your brand." className="border-mist bg-mist-soft">
              <ul className="flex flex-col gap-1.5">
                {FINDS.map((f) => (
                  <li key={f.tag} className="flex items-center gap-2 text-[13.5px] text-ink">
                    <Chip tone="accent">{f.tag}</Chip>
                    {f.text}
                  </li>
                ))}
              </ul>
            </JobCard>
            <JobCard mood="write" title="It writes" line="In your voice. You read it, you post it." className="border-accent-line bg-accent-soft">
              <div className="flex flex-wrap gap-1.5">
                {WRITES.map((w) => (
                  <Chip key={w}>{w}</Chip>
                ))}
              </div>
            </JobCard>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- mornings --
   The same morning without and with Huesy, one tap apart. It flips to "with"
   by itself once, the first time it is on screen, so a scroller sees both.
----------------------------------------------------------------------------- */

const MORNINGS = {
  without: [
    { time: "9:02", text: "A rival's launch goes up in Stories." },
    { time: "11:40", text: "Everyone's talking about it on X." },
    { time: "Friday", text: "You read about it in a recap. Too late." },
  ],
  with: [
    { time: "9:15", text: "Huesy shows you the launch, with its source." },
    { time: "9:17", text: "Your post is already drafted." },
    { time: "9:25", text: "You change a line and post. First." },
  ],
};

function TwoMornings() {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const inView = useInView(ref, { amount: 0.5, once: true });
  const [side, setSide] = useState("without");
  const touched = useRef(false);
  useEffect(() => {
    if (!inView || touched.current || reduced) return undefined;
    const t = setTimeout(() => {
      if (!touched.current) setSide("with");
    }, 2600);
    return () => clearTimeout(t);
  }, [inView, reduced]);
  const withIt = side === "with";

  return (
    <section ref={ref} className="border-y border-line bg-surface py-14 lg:py-24">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 sm:px-6 lg:max-w-[600px] lg:gap-10 lg:px-0">
        <Reveal className="lg:text-center">
          <h2 className="display-lg text-[34px] sm:text-[44px]">Your morning, two ways.</h2>
          <Segmented
            label="Your morning"
            className="mt-5"
            value={side}
            onChange={(v) => {
              touched.current = true;
              setSide(v);
            }}
            options={[
              { id: "without", label: "Without Huesy" },
              { id: "with", label: "With Huesy" },
            ]}
          />
        </Reveal>
        <Reveal delay={0.06}>
          <div className={cx("rounded-[24px] border p-5 transition-colors duration-300 sm:p-6", withIt ? "border-mist bg-mist-soft" : "border-line bg-canvas")}>
            <div className="mb-4 flex items-center gap-3">
              <Huesy mood={withIt ? "found" : "sleepy"} size={44} track={false} />
              <p className="text-[14px] font-medium text-ink">{withIt ? "You hear it first." : "You hear it last."}</p>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.ol
                key={side}
                className="flex flex-col gap-3"
                initial={reduced ? { opacity: 0 } : { opacity: 0, x: withIt ? 16 : -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                {MORNINGS[side].map((m) => (
                  <li key={m.time} className="flex items-baseline gap-4">
                    <span className={cx("font-display tabular w-[60px] shrink-0 text-[17px]", withIt ? "text-mist-deep" : "text-muted")}>{m.time}</span>
                    <span className="text-[15.5px] leading-snug text-ink">{m.text}</span>
                  </li>
                ))}
              </motion.ol>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- faq --
   Four questions, closed until tapped.
----------------------------------------------------------------------------- */

const FAQ = [
  { q: "Does Huesy post for me?", a: "No. It finds the moment and drafts the post. You check it and post it yourself." },
  { q: "Where does it look?", a: "The news, Instagram, TikTok, X, LinkedIn, Reddit, YouTube and reviews. Everything links to its source." },
  { q: "Will it sound like us?", a: "Yes. You set your voice once, and every draft follows it. Change anything in a tap." },
  { q: "When can I start?", a: "We let people in a few at a time. Join the list and we'll email you when it's your turn." },
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-14 lg:py-24">
      <div className="mx-auto max-w-[760px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="display-lg text-[34px] sm:text-[44px]">Questions</h2>
        </Reveal>
        <div className="mt-6 flex flex-col gap-2.5">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 0.04}>
              <details className="group rounded-[20px] border border-line bg-surface px-5 open:bg-raised">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[17px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <Plus size={16} weight="bold" className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-45" aria-hidden="true" />
                </summary>
                <p className="pb-4 text-[15px] leading-relaxed text-muted">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ finale -- */

function Finale() {
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
      <Reveal className="aurora grain relative mx-auto max-w-[1200px] overflow-hidden rounded-[24px] border border-line px-5 pb-8 pt-10 text-center sm:px-10 lg:py-20">
        <div className="flex justify-center">
          <Huesy mood="idle" size={72} />
        </div>
        <h2 className="display-lg mx-auto mt-4 max-w-[16ch] text-[36px] sm:text-[48px]">Get in early.</h2>
        <p className="mx-auto mt-2 max-w-[36ch] text-[16px] text-muted">We'll email you when it's your turn.</p>
        <div className="mx-auto mt-7 max-w-[520px] text-left">
          <JoinForm source="finale" />
        </div>
      </Reveal>
    </section>
  );
}
