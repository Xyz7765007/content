"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, SPRING, cx } from "../ui";
import Wordmark from "../shell/Wordmark";
import ThemeSwitch from "../ThemeSwitch";
import { openJoin } from "./JoinSheet";
import { readJoined } from "../../lib/site";

const LINKS = [
  { href: "/#sample", label: "Sample run" },
  { href: "/#how", label: "How it works" },
  { href: "/#faq", label: "Questions" },
];

/**
 * Translucent bar over the page. Its Join button stays out of the way while
 * the hero's own form is on screen, and appears once it has scrolled off.
 */
export function SiteNav({ joinButton = true }) {
  const [scrolled, setScrolled] = useState(false);
  const [heroFormVisible, setHeroFormVisible] = useState(true);
  const [joined, setJoined] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    // Someone with an account gets a way back into the app instead of the
    // waitlist button. The session cookie is enough to know; no auth code loads.
    setSignedIn(/(^|;\s*)sb-[^=]+-auth-token(\.0)?=/.test(document.cookie));
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const form = document.querySelector("[data-hero-join]");
    let io;
    if (form) {
      io = new IntersectionObserver(([e]) => setHeroFormVisible(e.isIntersecting), { rootMargin: "-64px 0px 0px 0px" });
      io.observe(form);
    } else setHeroFormVisible(false);
    const sync = () => setJoined(Boolean(readJoined()));
    sync();
    window.addEventListener("huesy:joined", sync);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("huesy:joined", sync);
      io?.disconnect();
    };
  }, []);

  const showJoin = joinButton && (signedIn || !heroFormVisible);

  return (
    <header className={cx("sticky top-0 z-40 transition-[border-color,background-color] duration-300", scrolled ? "glass border-b border-line/70" : "border-b border-transparent")}>
      <div className="mx-auto flex h-[64px] max-w-[1200px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Wordmark />
        <nav aria-label="Site" className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center text-[14px] text-muted transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex min-w-[150px] justify-end">
          <AnimatePresence initial={false}>
            {showJoin ? (
              <motion.div key="join" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={SPRING}>
                {signedIn ? (
                  <Button as={Link} href="/home" size="sm" variant="quiet">
                    Open Huesy
                  </Button>
                ) : joined ? (
                  <span className="inline-flex h-8 items-center rounded-full border border-accent-line bg-accent-soft px-3.5 text-[13px] text-accent-deep">
                    You're on the list
                  </span>
                ) : (
                  <Button size="sm" onClick={() => openJoin({ source: "nav" })}>
                    Join the waitlist
                  </Button>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-10">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <Wordmark />
          <p className="text-[13px] text-muted">Hear about the launch the day it breaks.</p>
          <ThemeSwitch className="mt-2 self-start" />
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center">
          <Link href="/privacy" className="text-muted transition-colors hover:text-ink">
            Privacy
          </Link>
          <Link href="/contact" className="text-muted transition-colors hover:text-ink">
            Contact
          </Link>
          <Link href="/login" className="text-muted transition-colors hover:text-ink">
            Have an invite? Log in
          </Link>
          <span className="text-faint">© {new Date().getFullYear()} Huesy</span>
        </nav>
      </div>
    </footer>
  );
}
