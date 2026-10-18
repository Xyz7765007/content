"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { Button, ErrorNote, Field, Input } from "../../components/ui";
import { AuthShell, GoogleButton, NotConnected, OrDivider } from "../../components/auth/AuthShell";
import { getSupabaseBrowser } from "../../lib/supabase/client";
import { isSupabaseConfigured } from "../../lib/supabase/env";
import { siteIsWaitlist } from "../../lib/access-rules";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <Signup />
    </Suspense>
  );
}

function Signup() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/onboarding";
  const fromSetup = next === "/home";
  const waitlist = siteIsWaitlist();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [resent, setResent] = useState("");

  const configured = isSupabaseConfigured();
  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const withGoogle = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setBusy("google");
    setError("");
    const { error: e } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (e) {
      setError("Google sign up didn't work just now. Use your email instead.");
      setBusy("");
    }
  };

  const withEmail = async (e) => {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    if (password.length < 8) {
      setError("Use at least eight characters.");
      return;
    }
    setBusy("email");
    setError("");
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirectTo() },
    });
    if (err) {
      setError(/already registered/i.test(err.message) ? "There's already an account with that email. Log in instead." : "Couldn't create the account just now. Try again.");
      setBusy("");
      return;
    }
    // With email confirmation on there is no session yet: the link finishes it.
    if (data.session) {
      await supabase.auth.getSession();
      router.push(next);
      router.refresh();
      return;
    }
    setSentTo(email.trim());
    setBusy("");
  };

  const resend = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase || !sentTo) return;
    setResent("sending");
    const { error: err } = await supabase.auth.resend({ type: "signup", email: sentTo, options: { emailRedirectTo: redirectTo() } });
    setResent(err ? "failed" : "sent");
  };

  return (
    <AuthShell
      title={sentTo ? "Check your inbox" : fromSetup ? "Save your setup" : "Create your account"}
      docTitle="Create your account"
      mood={sentTo ? "found" : "idle"}
      sub={
        sentTo
          ? null
          : waitlist
            ? "Huesy is invite only for now. Use the email your invite was sent to. Anyone else is added to the waitlist."
            : fromSetup
              ? "Your brand is ready. An account keeps it, and everything you find, on every device."
              : "Then a minute of brand setup, and I start watching."
      }
      footer={
        sentTo ? null : (
          <span>
            Already have an account?{" "}
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-accent-deep underline decoration-accent-line underline-offset-2">
              Log in
            </Link>
          </span>
        )
      }
    >
      {!configured ? (
        <NotConnected continueHref="/onboarding" continueLabel="Continue without an account" />
      ) : sentTo ? (
        <div className="flex flex-col gap-4">
          <p className="text-[14.5px] leading-relaxed text-muted">
            I sent a confirmation link to <span className="font-medium text-ink">{sentTo}</span>. Open it on this device and
            you'll land straight {fromSetup ? "in Huesy" : "in brand setup"}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" size="sm" onClick={resend} loading={resent === "sending"} disabled={resent === "sending" || resent === "sent"}>
              {resent === "sent" ? "Sent again" : "Resend the link"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSentTo("");
                setResent("");
              }}
            >
              Use a different email
            </Button>
          </div>
          {resent === "failed" ? <ErrorNote>Couldn't resend just now. Wait a minute and try again.</ErrorNote> : null}
          <p className="text-[12.5px] text-faint">Nothing after a few minutes? Check spam, or resend.</p>
        </div>
      ) : (
        <>
          <GoogleButton onClick={withGoogle} loading={busy === "google"} label="Sign up with Google" />
          <OrDivider />
          <form onSubmit={withEmail} className="flex flex-col gap-4">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@brand.com"
              />
            </Field>
            <Field label="Password" htmlFor="password" hint="At least eight characters.">
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a password"
              />
            </Field>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button type="submit" className="w-full" size="lg" loading={busy === "email"} disabled={Boolean(busy)}>
              Create account
              {!busy ? <ArrowRight size={15} weight="bold" /> : null}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
