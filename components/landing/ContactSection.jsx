"use client";

import { useState } from "react";
import { Check, EnvelopeSimple, Timer } from "@phosphor-icons/react";
import { Button, Card, ErrorNote, Field, Input, Textarea } from "../ui";

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

/**
 * Split contact block: what to expect on the left, the form on the right.
 * Used as a section on the opening page and as the body of /contact.
 */
export default function ContactSection({ standalone = false }) {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setState("busy");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setError(data.error || "Could not send that just now.");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setError("Could not reach the server. Try again.");
    }
  };

  const Heading = standalone ? "h1" : "h2";

  return (
    <div className="mx-auto grid max-w-[1240px] gap-10 px-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-20 lg:px-8">
      <div>
        <Heading className="display-lg text-[30px] sm:text-[38px]">Talk to us</Heading>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted">
          A question about the product, a brand you want set up, or something you wish it did.
          Write it here and a person reads it.
        </p>

        <dl className="mt-8 flex flex-col gap-5">
          {CONTACT_EMAIL ? (
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-deep">
                <EnvelopeSimple size={16} />
              </span>
              <div>
                <dt className="text-[13px] text-muted">Email</dt>
                <dd className="text-[15px] text-ink">
                  <a href={`mailto:${CONTACT_EMAIL}`} className="underline decoration-line underline-offset-2 hover:decoration-accent-line">
                    {CONTACT_EMAIL}
                  </a>
                </dd>
              </div>
            </div>
          ) : null}
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mist-soft text-mist-deep">
              <Timer size={16} />
            </span>
            <div>
              <dt className="text-[13px] text-muted">Reply time</dt>
              <dd className="text-[15px] text-ink">Usually within one working day.</dd>
            </div>
          </div>
        </dl>
      </div>

      <Card className="p-6 sm:p-8">
        {state === "done" ? (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-[#141414]">
              <Check size={22} weight="bold" />
            </span>
            <h3 className="font-display mt-4 text-[22px]">Sent</h3>
            <p className="mt-2 max-w-[36ch] text-sm text-muted">
              Thanks, {form.name.split(" ")[0] || "there"}. It is in front of a person now, and
              the reply goes to {form.email}.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" required htmlFor="c-name">
                <Input id="c-name" required value={form.name} onChange={update("name")} placeholder="Your name" />
              </Field>
              <Field label="Email" required htmlFor="c-email">
                <Input
                  id="c-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={update("email")}
                  placeholder="you@company.com"
                />
              </Field>
            </div>
            <Field label="Company" htmlFor="c-company" hint="Optional.">
              <Input id="c-company" value={form.company} onChange={update("company")} placeholder="Where you work" />
            </Field>
            <Field label="Message" required htmlFor="c-message">
              <Textarea
                id="c-message"
                required
                rows={5}
                value={form.message}
                onChange={update("message")}
                placeholder="What is on your mind"
              />
            </Field>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <div>
              <Button type="submit" loading={state === "busy"} disabled={state === "busy"}>
                Send message
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
