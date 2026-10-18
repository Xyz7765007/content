"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote, Field, Input } from "../../components/ui";
import { AuthShell, NotConnected } from "../../components/auth/AuthShell";
import { getSupabaseBrowser } from "../../lib/supabase/client";
import { isSupabaseConfigured } from "../../lib/supabase/env";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const configured = isSupabaseConfigured();

  // The recovery link lands through /auth/callback, which leaves a session
  // behind. Without one there is nothing to update.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setError("This reset link is missing or has expired. Request a new one.");
      setReady(true);
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    if (password.length < 8) {
      setError("Use at least eight characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/home");
    router.refresh();
  };

  return (
    <AuthShell title="Choose a new password" sub="Then you are straight back into the feed.">
      {!configured ? (
        <NotConnected continueHref="/login" continueLabel="Back to log in" />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="New password" htmlFor="password" hint="At least eight characters.">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm it" htmlFor="confirm">
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button type="submit" className="w-full" loading={busy} disabled={busy || !ready}>
            Save password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
