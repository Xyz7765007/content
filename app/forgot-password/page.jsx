"use client";

import Link from "next/link";
import { useState } from "react";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { Button, ErrorNote, Field, Input } from "../../components/ui";
import { AuthShell, NotConnected } from "../../components/auth/AuthShell";
import { getSupabaseBrowser } from "../../lib/supabase/client";
import { isSupabaseConfigured } from "../../lib/supabase/env";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const configured = isSupabaseConfigured();

  const submit = async (e) => {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthShell
      title="Reset your password"
      sub="Enter the email on your account and we will send a link to choose a new one."
      footer={
        <Link href="/login" className="text-accent-deep underline decoration-accent-line underline-offset-2">
          Back to log in
        </Link>
      }
    >
      {!configured ? (
        <NotConnected continueHref="/login" continueLabel="Back to log in" />
      ) : sent ? (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
            <EnvelopeSimple size={22} />
          </span>
          <h2 className="font-display mt-4 text-[22px]">Link sent</h2>
          <p className="mt-2 max-w-[36ch] text-sm text-muted">
            If <span className="text-ink">{email}</span> has an account, a reset link is on its
            way. It is good for an hour.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </Field>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button type="submit" className="w-full" loading={busy} disabled={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
