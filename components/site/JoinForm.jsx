"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check } from "@phosphor-icons/react";
import { Button, Input, SPRING, cx } from "../ui";
import Huesy from "../huesy/Huesy";
import { WATCH_CHOICES } from "../../lib/sample-run";
import { campaign, isEmail, readJoined, suggestEmail, track, writeJoined } from "../../lib/site";

/**
 * Email, one button. After joining, the form becomes the confirmation in the
 * same place, with the address echoed back (no confirmation email is sent, so
 * this is where a typo gets caught) and one optional question. The joined
 * state is remembered, so a returning visitor sees it instead of the form.
 */
export default function JoinForm({ source = "site", watch: preset, size = "lg", className, onDone, note }) {
  const id = useId();
  const reduced = useReducedMotion();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | busy | error | done | already
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(null);
  const [token, setToken] = useState(null);
  const focused = useRef(false);
  const inputRef = useRef(null);
  const hint = suggestEmail(email);

  useEffect(() => {
    const sync = () => setJoined(readJoined());
    sync();
    window.addEventListener("huesy:joined", sync);
    return () => window.removeEventListener("huesy:joined", sync);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const value = email.trim();
    if (!isEmail(value)) {
      setState("error");
      setError("That doesn't look like an email address.");
      inputRef.current?.focus();
      return;
    }
    setState("busy");
    setError("");
    const { utm, referrer } = campaign();
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, source, utm, referrer, website: e.target.website?.value || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setError(data.error || "Couldn't save that just now. Try again.");
        return;
      }
      setToken(data.token || null);
      setState(data.already ? "already" : "done");
      track(data.already ? "already" : "join", source);
      writeJoined({ email: value.toLowerCase(), at: Date.now() });
      onDone?.();
    } catch {
      setState("error");
      setError("Couldn't reach Huesy. Check your connection and try again.");
    }
  };

  const changeAddress = () => {
    setEmail(joined?.email || email);
    setState("idle");
    setToken(null);
    writeJoined(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const showSuccess = state === "done" || state === "already" || (joined && state === "idle" && !email);

  return (
    <div className={cx("w-full", className)}>
      <AnimatePresence mode="wait" initial={false}>
        {showSuccess ? (
          <motion.div
            key="joined"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
          >
            <Joined
              email={(state === "idle" ? joined?.email : email.trim()) || joined?.email}
              already={state === "already"}
              returning={state === "idle"}
              token={token}
              preset={preset}
              source={source}
              onChange={changeAddress}
            />
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={submit}
            noValidate
            initial={false}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="relative"
          >
            {/* Bots fill every field. People never see this one. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              inert
              className="absolute -left-[9999px] h-px w-px opacity-0"
            />
            <label htmlFor={`${id}-email`} className="sr-only">
              Email address
            </label>
            <div className={cx("flex flex-col gap-2 sm:flex-row", size === "lg" ? "sm:gap-2.5" : "")}>
              <Input
                ref={inputRef}
                data-autofocus
                id={`${id}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (state === "error") setState("idle");
                }}
                onFocus={() => {
                  if (!focused.current) {
                    focused.current = true;
                    track("focus", source);
                  }
                }}
                placeholder="you@brand.com"
                aria-invalid={state === "error" ? true : undefined}
                aria-describedby={`${id}-note`}
                className={cx(size === "lg" ? "h-12 text-[16px]" : "h-11", "w-full sm:w-auto sm:min-w-0 sm:flex-1")}
              />
              <Button
                type="submit"
                size={size === "lg" ? "lg" : "md"}
                loading={state === "busy"}
                disabled={state === "busy"}
                className="w-full shrink-0 sm:w-auto"
              >
                Join the waitlist
                {state !== "busy" ? <ArrowRight size={15} weight="bold" /> : null}
              </Button>
            </div>
            <div id={`${id}-note`} className="min-h-[20px] pt-2 text-left text-[13px]" aria-live="polite">
              {state === "error" ? (
                <span className="text-danger" role="alert">
                  {error}
                </span>
              ) : hint ? (
                <span className="text-muted">
                  Did you mean{" "}
                  <button
                    type="button"
                    onClick={() => setEmail(hint)}
                    className="font-medium text-accent-deep underline decoration-accent-line underline-offset-2"
                  >
                    {hint}
                  </button>
                  ?
                </span>
              ) : null}
            </div>
            {note ? <p className="text-[13px] text-muted">{note}</p> : null}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function Joined({ email, already, returning, token, preset, source, onChange }) {
  const [answer, setAnswer] = useState(preset || "");
  const [other, setOther] = useState("");
  const [saved, setSaved] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const canAsk = Boolean(token) && !returning && !already;

  const save = async (value) => {
    const watch = String(value || "").trim();
    if (!watch) return;
    setSaved(true);
    track("answer", source);
    try {
      await fetch("/api/waitlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, watch }),
      });
    } catch {
      /* the place on the list is what matters; the answer is a bonus */
    }
  };

  const label = WATCH_CHOICES.find((c) => c.id === answer)?.label;

  return (
    <div className="mb-3 rounded-[20px] border border-line-strong bg-surface p-4 text-left shadow-soft sm:p-5" role="status">
      <div className="flex items-start gap-3.5">
        <Huesy mood={saved ? "idle" : "found"} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[20px] leading-snug text-ink">
            {already ? "You’re already on the list." : "You’re on the list."}
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-muted">
            When your place opens, we'll email <span className="font-medium text-ink">{email}</span>.{" "}
            <button
              type="button"
              onClick={onChange}
              className="whitespace-nowrap text-accent-deep underline decoration-accent-line underline-offset-2"
            >
              {returning ? "Not you?" : "Wrong address? Change it"}
            </button>
          </p>
        </div>
      </div>

      {canAsk && !skipped ? (
        <div className="mt-4 border-t border-line pt-4">
          {saved ? (
            <p className="flex items-center gap-2 text-[14px] text-ink">
              <Check size={15} weight="bold" className="text-accent-deep" />
              Noted. Huesy will start with {label && answer !== "other" ? label.toLowerCase() : "that"} when your place opens.
            </p>
          ) : (
            <>
              <p className="text-[14px] font-medium text-ink">One quick question: what should Huesy watch for you?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {WATCH_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={answer === c.id}
                    onClick={() => {
                      setAnswer(c.id);
                      if (c.id !== "other") save(c.label);
                    }}
                    className={cx(
                      "rounded-full border px-3.5 py-1.5 text-[13px] transition-[transform,background-color,border-color] duration-150 active:scale-[0.97] pointer-coarse:min-h-11",
                      answer === c.id
                        ? "border-ink bg-ink font-medium text-canvas"
                        : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {answer === "other" ? (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save(other);
                  }}
                >
                  <Input
                    autoFocus
                    value={other}
                    onChange={(e) => setOther(e.target.value)}
                    placeholder="A market, or a few brands"
                    aria-label="What should Huesy watch for you"
                    maxLength={160}
                    className="h-10"
                  />
                  <Button type="submit" size="md" variant="quiet" disabled={!other.trim()}>
                    Save
                  </Button>
                </form>
              ) : null}
              <button
                type="button"
                onClick={() => setSkipped(true)}
                className="mt-3 inline-flex min-h-9 items-center text-[13px] text-muted underline decoration-line underline-offset-2 hover:text-ink pointer-coarse:min-h-11"
              >
                Skip
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
