"use client";

import { Suspense, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SPRING } from "../ui";
import { SiteFooter, SiteNav } from "./SiteChrome";
import JoinForm from "./JoinForm";
import JoinSheet from "./JoinSheet";
import SampleRun from "./SampleRun";
import { campaign, track } from "../../lib/site";

/**
 * The waitlist site. One goal: a place on the list. The form is in the first
 * screen; the sample run shows the product working in seconds without
 * calling any AI; everything else answers the questions people ask before
 * they leave an email.
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
        <SampleSection />
        <WhyItExists />
        <How />
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

function Reveal({ children, className, delay = 0, as = "div" }) {
  const reduced = useReducedMotion();
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <Tag
      className={className}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------------- hero -- */

function Hero() {
  const reduced = useReducedMotion();
  // The headline and the form paint with the page, so the first thing a
  // visitor sees is never waiting on an animation. Only the sample run eases in.
  return (
    <section className="relative -mt-16 overflow-hidden pt-16">
      <div className="aurora grain absolute inset-0" aria-hidden="true" />
      {/* Top aligned with an offset that centres the sample run on screen, so
          a taller joined state grows downward and the headline never moves. */}
      <div className="relative mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-10 px-4 pb-12 pt-8 sm:px-6 sm:pt-14 lg:min-h-[calc(100dvh-64px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:gap-14 lg:px-8 lg:py-10">
        <div className="max-w-[600px] lg:mt-[max(0px,calc((100dvh-64px-546px)/2-40px))] lg:pt-14">
          <h1 className="display-xl text-[40px] sm:text-[54px] lg:text-[62px]">Stop finding out from other people’s posts.</h1>
          <p className="mt-5 max-w-[50ch] text-[17px] leading-relaxed text-muted sm:text-[18px]">
            Huesy checks Google News, Instagram and X for brand launches, collabs and campaigns, ranks them for your
            brand, then drafts the post in your voice.
          </p>
          <div className="mt-8 max-w-[520px]" data-hero-join>
            <JoinForm source="hero" note="We're opening Huesy a few people at a time. Your email is only used to invite you." />
          </div>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...SPRING, delay: 0.15 }}
          className="hidden lg:mt-[max(0px,calc((100dvh-64px-546px)/2-40px))] lg:block"
        >
          <SampleRun autoplay source="hero" />
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ sample (sm) -- */

function SampleSection() {
  return (
    <section id="sample" className="scroll-mt-20 border-y border-line bg-surface py-14 lg:py-20">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:gap-14 lg:px-8">
        <Reveal>
          <h2 className="display-lg max-w-[18ch] text-[30px] sm:text-[40px]">A morning with Huesy, in seven seconds.</h2>
          <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-muted">
            Pick a market. Huesy checks the news, ranks what it finds for your brand, and turns the best one into a post
            for each place you publish. This one is a sample; yours would be your market, in your voice.
          </p>
          <ul className="mt-6 flex flex-col gap-2.5 text-[14.5px] text-ink">
            {[
              "Ranked for your brand, best fit first",
              "Every signal links to where it came from",
              "Drafts for Instagram, LinkedIn, X and your newsletter",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-deep" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.08}>
          <SampleRun autoplay source="section" className="lg:hidden" />
          <div className="hidden rounded-[24px] border border-dashed border-line-strong p-6 text-[14px] leading-relaxed text-muted lg:block">
            The sample run is up at the top of the page. Pick another market there to see it again, or change the tab to
            see the same news written for LinkedIn, X and a newsletter.
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- why -- */

const WITHOUT = [
  { time: "9:02", text: "A launch goes live in a brand's Stories." },
  { time: "11:40", text: "People are arguing about it on X." },
  { time: "Friday", text: "You read about it in someone else's recap." },
];
const WITH = [
  { time: "9:15", text: "You open Huesy with your coffee and press Check." },
  { time: "9:17", text: "The launch is at the top, ranked for your brand, with its source." },
  { time: "9:25", text: "The post is drafted in your voice. You tweak a line and post." },
];

function WhyItExists() {
  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="display-lg max-w-[22ch] text-[30px] sm:text-[40px]">
            Huesy started with a marketer who kept hearing the news last.
          </h2>
          <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-muted">
            There was no single place that said a launch, a collab or a campaign had just happened. By the time it
            reached a newsletter or a recap, the moment to say something had passed. Here's the difference, on an
            ordinary morning.
          </p>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Reveal>
            <Timeline title="Without Huesy" items={WITHOUT} tone="muted" />
          </Reveal>
          <Reveal delay={0.08}>
            <Timeline title="With Huesy" items={WITH} tone="accent" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Timeline({ title, items, tone }) {
  const accent = tone === "accent";
  return (
    <div className={accent ? "h-full rounded-[22px] border border-mist bg-mist-soft p-6" : "h-full rounded-[22px] border border-line bg-surface p-6"}>
      <p className={accent ? "meta text-mist-deep" : "meta"}>{title}</p>
      <ol className="mt-5 flex flex-col gap-4">
        {items.map((it) => (
          <li key={it.time} className="flex gap-4">
            <span className={accent ? "font-display tabular w-[64px] shrink-0 text-[17px] text-mist-deep" : "font-display tabular w-[64px] shrink-0 text-[17px] text-muted"}>
              {it.time}
            </span>
            <span className="text-[15px] leading-relaxed text-ink">{it.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* --------------------------------------------------------------------- how -- */

const STEPS = [
  {
    title: "Tell Huesy your brand in a sentence",
    body: "It drafts your voice, your audience and the market worth watching. You change anything that's off.",
  },
  {
    title: "Check whenever you like",
    body: "One tap and it reads Google News, Instagram and X for launches, collabs, campaigns and market moves, ranked for your brand, each linked to its source.",
  },
  {
    title: "Pick a signal and get the post",
    body: "A caption and creative brief, a LinkedIn post, a post for X or a newsletter, in your voice. You review it and post it yourself.",
  },
];

function How() {
  return (
    <section id="how" className="scroll-mt-20 border-y border-line bg-surface py-16 lg:py-24">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-20 lg:px-8">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <p className="meta mb-4">When your place opens</p>
          <h2 className="display-lg text-[30px] sm:text-[40px]">A minute to set up. Then one tap a morning.</h2>
        </Reveal>
        <ol className="flex flex-col">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.05} as="li" className={i > 0 ? "flex gap-5 border-t border-line py-7" : "flex gap-5 pb-7 lg:pt-2"}>
              <span className="font-display tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised text-[16px] text-ink">
                {i + 1}
              </span>
              <div>
                <h3 className="font-display text-[22px] leading-snug">{s.title}</h3>
                <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-muted">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- faq -- */

const FAQ = [
  {
    q: "Does Huesy post for me?",
    a: "No. It finds the news and drafts the post. You read it, change what you like, and post it yourself.",
  },
  {
    q: "Where does it look?",
    a: "Google News, Instagram and X, in the regions you choose. Every signal links to where it came from, so you can check it before you write.",
  },
  {
    q: "Will it sound like us?",
    a: "You set your voice once, with example posts if you have them, and a tone for each platform. Drafts follow it, and you can refine any draft in a click.",
  },
  {
    q: "Who is it for?",
    a: "Social media managers, founders who run their own accounts, and brand or agency teams who need to react while a story is still moving.",
  },
  {
    q: "When can I start?",
    a: "We're letting people in a few at a time. Join the list and we'll email you when your place opens.",
  },
  {
    q: "What happens to my email?",
    a: "It's only used to invite you. Ask us through the contact page and we'll delete it.",
  },
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-16 lg:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="display-lg text-[30px] sm:text-[40px]">Questions</h2>
        </Reveal>
        <dl className="mt-10 grid grid-cols-1 gap-x-12 gap-y-9 md:grid-cols-2">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={(i % 2) * 0.05}>
              <dt className="font-display text-[20px] leading-snug text-ink">{f.q}</dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">{f.a}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ finale -- */

function Finale() {
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
      <Reveal className="aurora grain relative mx-auto max-w-[1200px] overflow-hidden rounded-[24px] border border-line px-5 py-14 text-center sm:px-10 lg:py-20">
        <h2 className="display-lg mx-auto max-w-[17ch] text-[32px] sm:text-[44px]">Built for the people who have to post today.</h2>
        <p className="mx-auto mt-4 max-w-[52ch] text-[16px] leading-relaxed text-muted">
          Join the waitlist and we'll email you when your place opens.
        </p>
        <div className="mx-auto mt-8 max-w-[520px] text-left">
          <JoinForm source="finale" />
        </div>
      </Reveal>
    </section>
  );
}
