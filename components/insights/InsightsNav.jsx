"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { SPRING, cx } from "../ui";

// Everything Huesy has learned for the brand, in one place: deep reports,
// the facts it knows, creators, the watchlists it checks, and saved signals.
const TABS = [
  { href: "/insights", label: "Reports", match: (p) => p === "/insights" || p.startsWith("/insights/reports") },
  { href: "/insights/knowledge", label: "What I know", match: (p) => p.startsWith("/insights/knowledge") },
  { href: "/insights/creators", label: "Creators", match: (p) => p.startsWith("/insights/creators") },
  { href: "/search", label: "Watchlists", match: (p) => p === "/search" || p.startsWith("/search/") },
  { href: "/saved", label: "Saved", match: (p) => p.startsWith("/saved") },
];

export default function InsightsNav({ className }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Insights" className={cx("no-scrollbar -mx-1 mb-6 overflow-x-auto px-1 pb-1", className)}>
      <div className="inline-flex items-center gap-1 rounded-full border border-line bg-sunken p-1">
        {TABS.map((t) => {
          const on = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "relative whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] transition-colors duration-150 pointer-coarse:min-h-11 pointer-coarse:py-2.5",
                on ? "font-medium text-ink" : "text-muted hover:text-ink"
              )}
            >
              {on ? <motion.span layoutId="insights-tab" transition={SPRING} className="absolute inset-0 rounded-full bg-surface shadow-soft" /> : null}
              <span className="relative">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
