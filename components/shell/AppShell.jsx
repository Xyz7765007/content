"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretLeft, ChartLineUp, ChatCircleDots, PaintBrushBroad, Storefront, Sun } from "@phosphor-icons/react";
import { SPRING, ToastHost, cx } from "../ui";
import Wordmark from "./Wordmark";
import Huesy from "../huesy/Huesy";
import LogoutButton from "../auth/LogoutButton";
import ThemeSwitch from "../ThemeSwitch";
import StateSync from "../auth/StateSync";
import { useSession } from "../auth/useSession";
import { useRuns } from "../../lib/runner";
import { useTitle } from "../../lib/useTitle";
import { PlanMeter } from "../plan/PlanBits";
import { useAccount } from "../../lib/account";

// Five places, the same on every width. Insights also holds the watchlists
// and saved signals, so those pages light it up too.
const NAV = [
  { href: "/home", label: "Today", icon: Sun },
  { href: "/ask", label: "Ask", icon: ChatCircleDots },
  { href: "/insights", label: "Insights", icon: ChartLineUp, also: ["/search", "/saved"] },
  { href: "/studio", label: "Studio", icon: PaintBrushBroad, also: ["/compose"] },
  { href: "/profile", label: "Brand", icon: Storefront },
];

export { useTitle };

/**
 * Sidebar on desktop, tab bar on phones: the same four places in the same
 * order, so the map never changes with the width. While a search runs, a
 * small Huesy in the chrome says so from every screen.
 */
export default function AppShell({ children, title, docTitle, actions, wide = false, back }) {
  const pathname = usePathname();
  const router = useRouter();
  const under = (href) => pathname === href || pathname.startsWith(`${href}/`);
  const isActive = (href) => {
    const item = NAV.find((n) => n.href === href);
    return under(href) || Boolean(item?.also?.some(under));
  };
  useTitle(docTitle || (typeof title === "string" ? title : null));

  // The runner and toasts ask for navigation through this event.
  useEffect(() => {
    const go = (e) => e.detail && router.push(e.detail);
    window.addEventListener("huesy:navigate", go);
    return () => window.removeEventListener("huesy:navigate", go);
  }, [router]);

  return (
    <div className="min-h-[100dvh] bg-canvas lg:flex">
      <StateSync />
      <aside className="sticky top-0 hidden h-[100dvh] w-[232px] shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
        <div className="px-2">
          <Wordmark href="/home" />
        </div>

        <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex items-center gap-3 rounded-full px-4 py-2.5 text-sm transition-colors duration-150",
                  active ? "font-medium text-accent-deep" : "text-muted hover:bg-sunken hover:text-ink"
                )}
              >
                {active ? (
                  <motion.span layoutId="nav-active" transition={SPRING} className="absolute inset-0 rounded-full bg-accent-soft" />
                ) : null}
                <Icon size={18} weight={active ? "fill" : "regular"} className="relative" />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <RunPill className="mt-6" />

        <div className="mt-auto flex flex-col gap-2 px-2">
          <PlanMeter className="mb-1" />
          <Account />
          <ThemeSwitch className="mb-1 self-start" />
          <Link href="/" className="text-[13px] text-faint transition-colors hover:text-ink">
            Huesy website
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-28 lg:pb-0">
        <header className="glass sticky top-0 z-30 border-b border-line/70">
          <div
            className={cx(
              "mx-auto flex min-h-[64px] items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5 lg:px-8",
              wide ? "max-w-none" : "max-w-[1120px]"
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              {back ? (
                <Link
                  href={back.href}
                  aria-label={`Back to ${back.label}`}
                  className="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-sunken hover:text-ink sm:hidden"
                >
                  <CaretLeft size={18} weight="bold" />
                </Link>
              ) : null}
              <span className={cx("lg:hidden", back && "max-sm:hidden")}>
                <Wordmark href="/home" compact />
              </span>
              {back ? (
                <Link
                  href={back.href}
                  className="hidden shrink-0 text-[13px] text-muted transition-colors hover:text-ink sm:inline"
                >
                  {back.label}
                  <span aria-hidden="true" className="mx-2 text-faint">/</span>
                </Link>
              ) : null}
              <h1 className="font-display truncate text-[20px] text-ink sm:text-[21px]">{title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PlanMeter compact className="lg:hidden" />
              {actions}
            </div>
          </div>
          <RunPill className="mx-4 mb-2.5 lg:hidden" />
        </header>

        <main
          id="main"
          className={cx("mx-auto px-4 py-6 sm:px-5 lg:px-8 lg:py-9", wide ? "max-w-none" : "max-w-[1120px]")}
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Main"
        className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line/70 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1.5 pb-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-[11px] transition-colors active:scale-[0.96]",
                  active ? "font-medium text-accent-deep" : "text-muted"
                )}
              >
                <Icon size={22} weight={active ? "fill" : "regular"} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <ToastHost offset={96} />
    </div>
  );
}

function Account() {
  const { user, configured } = useSession();
  const admin = useAccount((s) => s.account?.admin);
  if (!configured) return null;
  return (
    <div className="mb-2 rounded-2xl border border-line bg-surface p-3">
      {user?.email ? <p className="truncate text-[12.5px] text-muted">{user.email}</p> : null}
      <div className="-ml-2 mt-1 flex items-center gap-1">
        <LogoutButton />
        {admin ? (
          <Link href="/admin" className="rounded-full px-2.5 py-1.5 text-[12.5px] text-muted transition-colors hover:bg-sunken hover:text-ink">
            Admin
          </Link>
        ) : null}
      </div>
    </div>
  );
}

// A small, live "Huesy is checking" marker that follows the person around.
function RunPill({ className }) {
  const runs = useRuns((s) => s.runs);
  const pathname = usePathname();
  const active = Object.values(runs).find((r) => r.phase === "running");
  // Where the run's own panel is on screen, the pill would only repeat it.
  const panelHere = active && (pathname === "/home" || pathname === `/search/${active.searchId}`);
  if (panelHere) return null;
  return (
    <AnimatePresence initial={false}>
      {active ? (
        <motion.div
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          transition={SPRING}
          className={className}
        >
          <Link
            href={`/search/${active.searchId}`}
            className="flex items-center gap-2.5 rounded-full border border-accent-line bg-accent-soft py-1.5 pl-1.5 pr-3.5 text-[12.5px] text-accent-deep transition-transform active:scale-[0.98]"
          >
            <Huesy mood="watch" size={22} track={false} />
            <span className="min-w-0 flex-1 truncate">
              Checking {active.name || "your watchlist"}
              {active.signals?.length ? ` · ${active.signals.length} found` : "…"}
            </span>
          </Link>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
