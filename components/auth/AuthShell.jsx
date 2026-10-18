"use client";

import Link from "next/link";
import { GoogleLogo } from "@phosphor-icons/react";
import { Button, Card } from "../ui";
import Wordmark from "../shell/Wordmark";
import Huesy from "../huesy/Huesy";
import { useTitle } from "../../lib/useTitle";

/**
 * The frame every account page shares: the mark, a short display heading
 * with Huesy beside it, and one card. One column, so the eye has one job.
 */
export function AuthShell({ title, sub, children, footer, mood = "idle", docTitle }) {
  useTitle(docTitle || title);

  return (
    <div className="relative min-h-[100dvh] bg-canvas">
      <div className="aurora aurora-fade pointer-events-none absolute inset-x-0 top-0 h-[460px]" aria-hidden="true" />
      <header className="relative">
        <div className="mx-auto flex h-[64px] max-w-[1080px] items-center justify-between px-4 sm:px-6">
          <Wordmark />
        </div>
      </header>

      <main id="main" className="relative mx-auto w-full max-w-[460px] px-4 pb-24 pt-6 sm:pt-12">
        <Huesy mood={mood} size={52} />
        <h1 className="display-lg mt-4 text-[30px] sm:text-[36px]">{title}</h1>
        {sub ? <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{sub}</p> : null}
        <Card className="mt-7 p-5 sm:p-7">{children}</Card>
        {footer ? <div className="mt-6 flex flex-col items-center gap-2 text-center text-[13.5px] text-muted">{footer}</div> : null}
      </main>
    </div>
  );
}

// Google sign in shows only once it is switched on for the project
// (NEXT_PUBLIC_GOOGLE_AUTH=on), so the first button never fails.
export const googleEnabled = () => process.env.NEXT_PUBLIC_GOOGLE_AUTH === "on";

export function GoogleButton({ onClick, loading, label = "Continue with Google" }) {
  if (!googleEnabled()) return null;
  return (
    <Button variant="quiet" className="w-full" onClick={onClick} loading={loading} disabled={loading}>
      {!loading ? <GoogleLogo size={17} weight="bold" /> : null}
      {label}
    </Button>
  );
}

export function OrDivider() {
  if (!googleEnabled()) return null;
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[12px] text-faint">or with email</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

// Local mode: no Supabase keys on this deployment.
export function NotConnected({ continueHref, continueLabel }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[16px] border border-mist bg-mist-soft px-4 py-3.5 text-[13.5px] leading-relaxed text-mist-deep">
        <p className="font-medium">Accounts aren't connected on this deployment.</p>
        <p className="mt-1">Everything you do here stays in this browser.</p>
      </div>
      <Button as={Link} href={continueHref} className="w-full">
        {continueLabel}
      </Button>
    </div>
  );
}

export function useOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}
