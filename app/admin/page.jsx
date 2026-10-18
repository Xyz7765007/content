"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, FilmSlate, Play, UploadSimple, X } from "@phosphor-icons/react";
import AppShell from "../../components/shell/AppShell";
import { Badge, Button, ErrorNote, Field, Input, Select, Sheet, Skeleton, Textarea, cx, toast } from "../../components/ui";
import { REEL_STATUS } from "../../components/studio/ReelBits";
import { getJson, sendJson } from "../../lib/stream";
import { PLANS, formatCredits } from "../../lib/plans";
import { REEL_STYLES } from "../../lib/studio/options";
import { platformLabel } from "../../lib/intel/taxonomy";
import { ago, countdown, dayLabel } from "../../lib/when";

/**
 * The owner's desk: plan requests to approve, the reel queue to make and
 * deliver, every account with its credits, and what the month is costing.
 * Open only to the addresses in ADMIN_EMAILS; everyone else gets a 404.
 */
const COST_NAMES = {
  ask: "Questions",
  report: "Reports",
  search: "Watchlist checks",
  write: "Signal posts",
  rewrite: "Rewrites",
  text: "Posts",
  studio: "Studio writing",
  data: "Data",
  image: "Pictures",
  voice: "Audience reading",
  tag: "Tagging",
  rank: "Ranking",
  tidy: "Brand tidy",
  "brand-draft": "Setup drafts",
  instruction: "Watchlist help",
};

export default function AdminPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    const r = await getJson("/api/admin");
    if (r.error) setError(r.error);
    else {
      setError(null);
      setData(r);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const emails = useMemo(() => Object.fromEntries((data?.accounts || []).map((a) => [a.user_id, a.email])), [data]);

  if (error) {
    return (
      <AppShell title="Admin">
        <ErrorNote>{error.code === "not_found" ? "This page isn't available." : error.message}</ErrorNote>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell title="Admin">
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      </AppShell>
    );
  }

  const spend = Object.values(data.spend30d || {}).reduce((a, b) => a + b, 0);
  const plans = data.accounts.reduce((m, a) => ({ ...m, [a.plan || "none"]: (m[a.plan || "none"] || 0) + 1 }), {});

  return (
    <AppShell title="Admin" wide>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Studio seats" value={`${data.seats.taken} of ${data.seats.limit}`} />
          <Stat label="Intelligence" value={plans.tier1 || 0} />
          <Stat label="No plan" value={plans.none || 0} />
          <Stat
            label="Reels that worked"
            value={data.reelHitRate.tracked ? `${data.reelHitRate.worked} of ${data.reelHitRate.tracked}` : "None tracked"}
            note={`${data.reelHitRate.bar.toLocaleString("en-US")}+ views in week one${Object.keys(data.reelHitRate.byProof || {}).length ? `. ${Object.entries(data.reelHitRate.byProof).map(([k, v]) => `${k} proof ${v.worked}/${v.tracked}`).join(", ")}` : ""}`}
          />
          <Stat label="Cost, 30 days" value={`$${spend.toFixed(2)}`} note={Object.entries(data.spend30d || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${COST_NAMES[k] || k} $${v.toFixed(2)}`).join(", ")} />
        </dl>

        <section aria-labelledby="queue">
          <h2 id="queue" className="font-display mb-3 text-[22px]">
            Reel queue
          </h2>
          {!data.queue.length ? (
            <p className="text-[14px] text-muted">Nothing waiting.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {data.queue.map((r) => {
                const due = countdown(r.due_at);
                const hook = r.brief?.hooks?.[r.request?.chosenHook ?? 0]?.line;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5">
                    <FilmSlate size={18} className="shrink-0 text-accent-deep" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{hook || r.request?.topic || "Reel"}</span>
                      <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                        <Badge tone={REEL_STATUS[r.status]?.tone}>{REEL_STATUS[r.status]?.label}</Badge>
                        {emails[r.user_id] || r.user_id.slice(0, 8)}
                        {due ? (
                          <span className={cx("inline-flex items-center gap-1", due.late && "font-medium text-danger")}>
                            <Clock size={12} aria-hidden="true" />
                            {due.late ? `${due.text} late` : `due in ${due.text}`}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <Button size="sm" variant="quiet" onClick={() => setOpen(r.id)}>
                      Open
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Requests requests={data.requests} onDone={load} />
        <Accounts accounts={data.accounts} onDone={load} />
        <SetPlan onDone={load} />

        {data.delivered?.length ? (
          <section aria-labelledby="delivered">
            <h2 id="delivered" className="font-display mb-3 text-[22px]">
              Delivered
            </h2>
            <ul className="flex flex-col gap-1.5 text-[13.5px]">
              {data.delivered.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-3 border-b border-line py-2">
                  <span className="min-w-0 truncate">{r.request?.topic || "Reel"}</span>
                  <span className="text-muted">
                    {emails[r.user_id] || ""} {dayLabel(r.delivered_at)}{" "}
                    {r.results?.checks?.length ? (r.results.worked ? `worked (${(r.results.weekBest || r.results.best).toLocaleString("en-US")} in week one)` : `${(r.results.best || 0).toLocaleString("en-US")} views${r.results.settled ? ", week one over" : " so far"}`) : "not tracked"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <ReelDesk id={open} onClose={() => setOpen(null)} onDone={load} email={open ? emails[data.queue.find((q) => q.id === open)?.user_id] : null} />
    </AppShell>
  );
}

function Stat({ label, value, note }) {
  return (
    <div className="rounded-[20px] border border-line bg-surface p-4">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="font-display tabular mt-1 text-[24px] leading-none">{value}</dd>
      {note ? <dd className="mt-1.5 line-clamp-2 text-[11.5px] text-faint">{note}</dd> : null}
    </div>
  );
}

function Requests({ requests, onDone }) {
  const [busy, setBusy] = useState(null);
  const decide = async (id, approve) => {
    setBusy(id);
    const r = await sendJson("/api/admin", { action: "decide_request", id, approve });
    setBusy(null);
    if (r.error) toast(r.error.message);
    else {
      toast(approve ? "Approved. Their plan starts now." : "Declined.");
      onDone();
    }
  };
  return (
    <section aria-labelledby="requests">
      <h2 id="requests" className="font-display mb-3 text-[22px]">
        Plan requests
      </h2>
      {!requests.length ? (
        <p className="text-[14px] text-muted">None waiting.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-medium">{r.email}</span>
                <span className="text-[12.5px] text-muted">
                  {PLANS[r.plan]?.name}, asked {ago(r.created_at)}
                  {r.note ? `: "${r.note}"` : ""}
                </span>
              </span>
              <Button size="sm" onClick={() => decide(r.id, true)} loading={busy === r.id} disabled={Boolean(busy)}>
                <Check size={14} weight="bold" />
                Approve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => decide(r.id, false)} disabled={Boolean(busy)}>
                Decline
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Accounts({ accounts, onDone }) {
  const [grant, setGrant] = useState({});
  const act = async (payload, done) => {
    const r = await sendJson("/api/admin", payload);
    if (r.error) toast(r.error.message, { duration: 6000 });
    else {
      toast(done, { tone: "good" });
      onDone();
    }
  };
  return (
    <section aria-labelledby="accounts">
      <h2 id="accounts" className="font-display mb-3 text-[22px]">
        Accounts
      </h2>
      <div className="overflow-x-auto rounded-[20px] border border-line bg-surface">
        <table className="w-full min-w-[760px] text-left text-[13.5px]">
          <thead className="border-b border-line text-[12px] text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Plan</th>
              <th className="px-4 py-2.5 font-medium">Credits</th>
              <th className="px-4 py-2.5 font-medium">Cost, 30 days</th>
              <th className="px-4 py-2.5 font-medium">Add credits</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.user_id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">
                  <span className="block max-w-[260px] truncate">{a.email}</span>
                  <span className="text-[11.5px] text-faint">since {dayLabel(a.created_at)}</span>
                </td>
                <td className="px-4 py-2.5">
                  <Select
                    aria-label={`Plan for ${a.email}`}
                    value={a.plan || ""}
                    onChange={(e) => {
                      const next = e.target.value || null;
                      const name = next ? PLANS[next].name : "no plan";
                      if (window.confirm(`Put ${a.email} on ${name}?`)) act({ action: "set_plan", userId: a.user_id, plan: next }, "Plan changed");
                    }}
                    className="h-9 w-auto text-[13px]"
                  >
                    <option value="">No plan</option>
                    <option value="tier1">Intelligence</option>
                    <option value="tier2">Studio</option>
                  </Select>
                </td>
                <td className="tabular px-4 py-2.5">{a.plan ? formatCredits(a.credits) : "-"}</td>
                <td className={cx("tabular px-4 py-2.5", a.spend30d > 10 && "font-medium text-danger")}>${a.spend30d.toFixed(2)}</td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5">
                    <Input aria-label={`Credits to add for ${a.email}`} value={grant[a.user_id] || ""} onChange={(e) => setGrant((g) => ({ ...g, [a.user_id]: e.target.value.replace(/[^\d]/g, "") }))} placeholder="Amount" className="h-9 w-24 text-[13px]" inputMode="numeric" />
                    <Button size="sm" variant="quiet" disabled={!grant[a.user_id] || !a.plan} onClick={() => act({ action: "grant", userId: a.user_id, amount: Number(grant[a.user_id]) }, "Credits added")}>
                      Add
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SetPlan({ onDone }) {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("tier2");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await sendJson("/api/admin", { action: "set_plan", email, plan });
    setBusy(false);
    if (r.error) toast(r.error.message, { duration: 6000 });
    else {
      toast(`${email} is on ${PLANS[plan].name}`, { tone: "good" });
      setEmail("");
      onDone();
    }
  };
  return (
    <section aria-labelledby="give" className="rounded-[20px] border border-line bg-surface p-5">
      <h2 id="give" className="font-display text-[19px]">
        Give someone a plan
      </h2>
      <p className="mt-1 text-[13px] text-muted">They need an account first. A new plan starts a fresh month the next time they open Huesy.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Email" htmlFor="adm-email" className="min-w-[240px] flex-1">
          <Input id="adm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Plan" htmlFor="adm-plan">
          <Select id="adm-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="tier1">Intelligence</option>
            <option value="tier2">Studio</option>
          </Select>
        </Field>
        <Button onClick={go} loading={busy} disabled={busy || !email.includes("@")}>
          Set plan
        </Button>
      </div>
    </section>
  );
}

function ReelDesk({ id, onClose, onDone, email }) {
  const [reel, setReel] = useState(null);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(null);
  const input = useRef(null);

  useEffect(() => {
    setReel(null);
    setFile(null);
    if (!id) return;
    sendJson("/api/admin", { action: "reel_get", id }).then((r) => {
      if (r.error) toast(r.error.message);
      else {
        setReel(r.reel);
        setCaption(r.reel.brief?.caption || "");
      }
    });
  }, [id]);

  const start = async () => {
    setBusy("start");
    const r = await sendJson("/api/admin", { action: "reel_start", id });
    setBusy(null);
    if (r.error || !r.reel) toast(r.error?.message || "Couldn't start it.");
    else {
      setReel((x) => ({ ...x, status: r.reel.status }));
      onDone();
    }
  };

  const deliver = async () => {
    if (!file) return;
    setBusy("deliver");
    const link = await sendJson("/api/admin", { action: "reel_upload_url", id });
    if (link.error) {
      setBusy(null);
      toast(link.error.message);
      return;
    }
    const put = await fetch(link.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "video/mp4" }, body: file }).catch(() => null);
    if (!put?.ok) {
      setBusy(null);
      toast("The upload didn't go through. Try again.");
      return;
    }
    const r = await sendJson("/api/admin", { action: "reel_deliver", id, path: link.path, caption });
    setBusy(null);
    if (r.error) toast(r.error.message);
    else {
      toast("Delivered. They can watch it now.", { tone: "good" });
      onDone();
      onClose();
    }
  };

  const b = reel?.brief || {};
  const req = reel?.request || {};
  const hook = b.hooks?.[req.chosenHook ?? 0];
  return (
    <Sheet open={Boolean(id)} onClose={onClose} title="Reel brief" width={620}>
      {!reel ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="flex flex-col gap-5 text-[14px] leading-relaxed">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={REEL_STATUS[reel.status]?.tone}>{REEL_STATUS[reel.status]?.label}</Badge>
            <span className="text-muted">{email}</span>
            <span className="text-muted">{platformLabel(req.platform)}</span>
            <span className="text-muted">{REEL_STYLES[req.style]?.label}</span>
            {reel.due_at ? <span className="text-muted">due {new Date(reel.due_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span> : null}
          </div>
          {reel.revision_note ? <p className="rounded-2xl bg-accent-soft px-4 py-3">Change asked for: {reel.revision_note}</p> : null}
          {hook ? (
            <div>
              <p className="text-[12.5px] font-medium text-muted">Opening they picked</p>
              <p className="font-display text-[19px]">"{hook.line}"</p>
              {hook.onScreen ? <p className="text-muted">On screen: {hook.onScreen}</p> : null}
            </div>
          ) : null}
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              ["Goal", req.goal],
              ["Topic", req.topic],
              ["Length", b.length],
              ["Call to action", req.cta],
              ["Must include", req.mustInclude],
              ["Voice", req.voice],
              ["Language", req.language],
              ["Notes", req.notes],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
          {b.structure?.length ? (
            <ol className="flex flex-col gap-2">
              {b.structure.map((s, i) => (
                <li key={i} className="rounded-2xl bg-sunken p-3">
                  <span className="font-medium">
                    {s.beat} ({s.seconds}s)
                  </span>
                  {s.voiceover ? <span className="block">"{s.voiceover}"</span> : null}
                  {s.onScreen ? <span className="block text-muted">On screen: {s.onScreen}</span> : null}
                  {s.visual ? <span className="block text-muted">Shot: {s.visual}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
          {b.sound ? <p>Sound: {b.sound.pick}. Fallback: {b.sound.fallback}.</p> : null}
          {req.references?.length ? (
            <div>
              <p className="text-[12.5px] font-medium text-muted">Reels they like</p>
              {req.references.map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block truncate text-accent-deep underline">
                  {u}
                </a>
              ))}
            </div>
          ) : null}
          {reel.uploads?.length ? (
            <div>
              <p className="text-[12.5px] font-medium text-muted">Their files</p>
              {reel.uploads.map((u, i) => (
                <a key={u.path} href={u.url} target="_blank" rel="noopener noreferrer" className="block truncate text-accent-deep underline">
                  File {i + 1}
                </a>
              ))}
            </div>
          ) : null}
          <p className="text-[12.5px] text-muted">The full brief, the grounding and their conversation history are in the reel's record for the OS.</p>

          <div className="flex flex-col gap-3 border-t border-line pt-5">
            {reel.status === "requested" || reel.status === "revision_requested" ? (
              <Button onClick={start} loading={busy === "start"} variant="quiet" className="self-start">
                <Play size={14} weight="fill" />
                Start making it
              </Button>
            ) : null}
            <Field label="Caption to deliver with it" htmlFor="adm-cap">
              <Textarea id="adm-cap" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} />
            </Field>
            <input ref={input} type="file" accept="video/mp4,video/quicktime" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="quiet" onClick={() => input.current?.click()}>
                <UploadSimple size={15} />
                {file ? file.name : "Choose the video"}
              </Button>
              <Button onClick={deliver} loading={busy === "deliver"} disabled={!file || Boolean(busy)}>
                Deliver
              </Button>
              {file ? (
                <button type="button" aria-label="Clear" onClick={() => setFile(null)} className="text-muted">
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
