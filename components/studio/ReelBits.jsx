"use client";

import Link from "next/link";
import { ArrowRight, Clock, FilmSlate } from "@phosphor-icons/react";
import { Badge, cx } from "../ui";
import { countdown } from "../../lib/when";

export const REEL_STATUS = {
  requested: { label: "Requested", tone: "mist" },
  in_production: { label: "Being made", tone: "accent" },
  revision_requested: { label: "Change requested", tone: "accent" },
  delivered: { label: "Delivered", tone: "solid" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function ReelRow({ reel }) {
  const s = REEL_STATUS[reel.status] || REEL_STATUS.requested;
  const due = ["requested", "in_production", "revision_requested"].includes(reel.status) ? countdown(reel.due_at) : null;
  return (
    <Link href={`/studio/reel?id=${reel.id}`} className="group flex items-center gap-4 rounded-[20px] border border-line bg-surface px-4 py-3.5 transition-[transform,border-color] hover:border-line-strong active:scale-[0.99]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
        <FilmSlate size={18} weight="bold" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{reel.brief?.hooks?.[reel.request?.chosenHook ?? 0]?.line || reel.request?.topic || "Reel"}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          <Badge tone={s.tone}>{s.label}</Badge>
          {due ? (
            <span className={cx("inline-flex items-center gap-1", due.late && "text-accent-deep")}>
              <Clock size={12} aria-hidden="true" />
              {due.late ? `Running ${due.text} late, it's being finished` : `Due in ${due.text}`}
            </span>
          ) : reel.status === "delivered" && reel.results?.worked ? (
            <span className="font-medium text-good">Passed {Number(reel.results.best).toLocaleString("en-US")} views</span>
          ) : null}
        </span>
      </span>
      <ArrowRight size={14} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
