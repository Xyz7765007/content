import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter, SiteNav } from "../../components/site/SiteChrome";
import JoinSheet from "../../components/site/JoinSheet";

export const metadata = {
  title: "Privacy",
  description: "What Huesy keeps, why, and how to have it deleted.",
};

// Written from what the code actually stores (supabase/schema.sql and the
// API routes). If either changes, change this page and its date.
const SECTIONS = [
  {
    title: "If you join the waitlist",
    items: [
      "Your email address, and the answer to the optional question about what Huesy should watch for you.",
      "Where you joined from: the part of the page, the site that sent you, and any campaign tags in the link.",
      "We use it only to invite you when your place opens.",
    ],
  },
  {
    title: "When you visit the site",
    items: [
      "Anonymous counts of page views, form focus, joins and sample runs, with the part of the page they happened on.",
      "No IP address, no browser fingerprint, no advertising cookies.",
    ],
  },
  {
    title: "If you have an account",
    items: [
      "Your email and password (handled by our sign in provider, Supabase; we never see the password).",
      "Your brand setup, watchlists, the signals they found, your drafts and what you save, so they follow you to any device.",
      "Reference images and an image rendering key, if you add them, stay in your browser and are never uploaded.",
      "A record of each AI request: what kind it was, the model, its size and its cost, so we can keep usage fair.",
    ],
  },
  {
    title: "Who else sees it",
    items: [
      "To find signals and write posts, your brand details and the signal are sent to Anthropic's Claude models. Instagram reference images are sent when an Instagram post is written.",
      "If you render an image, the image prompt goes from your browser to Google with your own key.",
      "Data is stored with Supabase and the site runs on Vercel. We don't sell your data or share it with anyone else.",
    ],
  },
  {
    title: "Deleting it",
    items: [
      "Ask through the contact page and we'll delete your waitlist entry or your account and everything in it.",
      "Signing out also clears Huesy's copy from that browser.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-[100dvh] bg-canvas">
      <SiteNav />
      <main id="main" className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 lg:py-20">
        <p className="meta">Updated 18 October 2026</p>
        <h1 className="display-lg mt-3 text-[34px] sm:text-[44px]">Privacy</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">
          What Huesy keeps, why it keeps it, and how to have it deleted. In plain words.
        </p>
        <div className="mt-10 flex flex-col gap-10">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="font-display text-[22px]">{s.title}</h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {s.items.map((t) => (
                  <li key={t} className="flex gap-3 text-[15px] leading-relaxed text-ink">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-deep" aria-hidden="true" />
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-12 text-[15px] text-muted">
          Questions about any of this?{" "}
          <Link href="/contact" className="text-accent-deep underline decoration-accent-line underline-offset-2">
            Write to us
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
      <Suspense fallback={null}>
        <JoinSheet />
      </Suspense>
    </div>
  );
}
