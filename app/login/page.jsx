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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/home";
  const linkError = params.get("error") === "link";
  const waitlist = siteIsWaitlist();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const configured = isSupabaseConfigured();

  const withGoogle = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setBusy("google");
    setError("");
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (e) {
      setError("Google sign in didn't work just now. Use your email instead.");
      setBusy("");
    }
  };

  const withEmail = async (e) => {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setBusy("email");
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setError(
        /invalid login/i.test(err.message)
          ? "That email and password don't match."
          : /not confirmed/i.test(err.message)
            ? "Confirm your email first. The link is in your inbox."
            : "Couldn't sign you in just now. Try again."
      );
      setBusy("");
      return;
    }
    // The session cookie has to exist before the app route is requested,
    // or the middleware sees the request first.
    await supabase.auth.getSession();
    router.push(next);
    router.refresh();
  };

  return (
    <AuthShell
      title="Welcome back"
      docTitle="Log in"
      sub={waitlist ? "Huesy is invite only for now. Log in with the account you were invited with." : "Log in to pick up your watchlists, drafts and brand."}
      footer={
        waitlist ? (
          <>
            <span>
              Not invited yet?{" "}
              <Link href="/?join=1" className="text-accent-deep underline decoration-accent-line underline-offset-2">
                Join the waitlist
              </Link>
            </span>
            <span>
              Have an invite but no account?{" "}
              <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-accent-deep underline decoration-accent-line underline-offset-2">
                Create it
              </Link>
            </span>
          </>
        ) : (
          <span>
            New here?{" "}
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-accent-deep underline decoration-accent-line underline-offset-2">
              Create an account
            </Link>
          </span>
        )
      }
    >
      {!configured ? (
        <NotConnected continueHref="/home" continueLabel="Continue without an account" />
      ) : (
        <>
          {linkError ? (
            <ErrorNote className="mb-5">
              That link didn't open a session on this device. If you just confirmed your email, log in below to continue.
            </ErrorNote>
          ) : null}
          <GoogleButton onClick={withGoogle} loading={busy === "google"} />
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
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
            </Field>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button type="submit" className="w-full" size="lg" loading={busy === "email"} disabled={Boolean(busy)}>
              Log in
              {!busy ? <ArrowRight size={15} weight="bold" /> : null}
            </Button>
            <div className="text-center">
              <Link href="/forgot-password" className="text-[13px] text-muted underline decoration-line underline-offset-2 hover:text-ink">
                Forgot your password?
              </Link>
            </div>
          </form>
        </>
      )}
    </AuthShell>
  );
}
