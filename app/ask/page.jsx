"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CircleNotch, ClockCounterClockwise, NotePencil, Trash } from "@phosphor-icons/react";
import AppShell from "../../components/shell/AppShell";
import Huesy from "../../components/huesy/Huesy";
import { Appear, Button, IconButton, SPRING, Sheet, Skeleton, cx, toast } from "../../components/ui";
import { GateNote, Locked } from "../../components/plan/PlanBits";
import { Answer, Composer, Suggestions, UserBubble } from "../../components/ask/AskParts";
import { withStep } from "../../components/intel/IntelBits";
import { useHydrated, useStore } from "../../lib/store";
import { PRICES, setCredits, useAccountData } from "../../lib/account";
import { getJson, sendJson, streamNdjson } from "../../lib/stream";
import { slimBrand } from "../../lib/api";
import { startReport } from "../../lib/reportRunner";
import { ago } from "../../lib/when";

// Hellos and thanks get a friendly answer here, for free, instead of a
// paid question.
const SMALL_TALK = /^(hi+|hey+|hello+|yo|hiya|thanks?|thank you|thx|ok(ay)?|cool|nice|great|test(ing)?|good (morning|afternoon|evening))[\s!.?]*$/i;

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <Ask />
    </Suspense>
  );
}

function Ask() {
  const router = useRouter();
  const params = useSearchParams();
  const threadId = params.get("t");
  const prefill = params.get("q");
  const hydrated = useHydrated();
  const brand = useStore((s) => s.brand);
  const targets = useStore((s) => s.targets);
  const { account, ready } = useAccountData();

  const [threads, setThreads] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState(null); // the answer being written
  const [local, setLocal] = useState([]); // free small-talk replies, not saved
  const [error, setError] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const [runningProposal, setRunningProposal] = useState(null);
  // A question in this conversation still being answered elsewhere (a reload
  // or another tab while it was being written): its answer is on its way.
  const [waiting, setWaiting] = useState(false);
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const bottomRef = useRef(null);
  const liveThread = useRef(null);
  // Set the moment a question is sent, before the screen updates, so a quick
  // second Enter can't send (and charge) it twice.
  const sending = useRef(false);

  const loadThreads = useCallback(async () => {
    const r = await getJson("/api/intel/threads");
    if (!r.error) setThreads(r.threads || []);
    else setThreads([]);
  }, []);

  useEffect(() => {
    if (account?.plan) loadThreads();
  }, [account?.plan, loadThreads]);

  // Opening a conversation loads its messages, unless it's the one being
  // written right now.
  useEffect(() => {
    setLocal([]);
    setError(null);
    if (!threadId) {
      if (!live) setMessages([]);
      return;
    }
    if (liveThread.current === threadId) return;
    let cancelled = false;
    setLoadingThread(true);
    getJson(`/api/intel/threads?id=${threadId}`).then((r) => {
      if (cancelled) return;
      setLoadingThread(false);
      if (r.error) {
        setMessages([]);
        if (r.error.code === "not_found") router.replace("/ask");
        return;
      }
      setMessages(r.messages || []);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // The last question has no answer yet and was asked in the last few
  // minutes: it is still being written. Say so, and show it when it lands,
  // so nobody asks (and pays) twice.
  useEffect(() => {
    const last = messages[messages.length - 1];
    const pending = !live && threadId && last?.role === "user" && last.created_at && Date.now() - new Date(last.created_at).getTime() < 4 * 60 * 1000;
    setWaiting(Boolean(pending));
    if (!pending) return undefined;
    let tries = 0;
    const t = setInterval(async () => {
      tries += 1;
      const r = await getJson(`/api/intel/threads?id=${threadId}`);
      const list = r.messages || [];
      if (!r.error && list[list.length - 1]?.role === "assistant") setMessages(list);
      else if (tries >= 50) setWaiting(false);
    }, 5000);
    return () => clearInterval(t);
  }, [messages, live, threadId]);

  useEffect(() => {
    if (prefill && !draft) setDraft(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const scrollDown = useCallback((smooth = true) => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" }));
  }, []);

  useEffect(() => {
    if (messages.length) scrollDown(false);
  }, [messages.length, scrollDown]);

  const ask = async (text) => {
    const question = String(text ?? draft).trim();
    if (!question || live || waiting || sending.current) return;
    setError(null);
    if (SMALL_TALK.test(question)) {
      setDraft("");
      setLocal((l) => [
        ...l,
        { id: `l${Date.now()}`, role: "user", content: question },
        {
          id: `r${Date.now()}`,
          role: "assistant",
          content: `Hi${brand.brandName ? `, ${brand.brandName}` : ""}. Ask me about your market and I'll read real posts to answer: what's working, what's rising, what your competitors and audience are up to, or which creators fit. Try one of these below.`,
          local: true,
        },
      ]);
      scrollDown();
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    sending.current = true;
    setDraft("");
    const state = { question, steps: [], text: "", evidence: null, proposal: null, findingIds: null, sample: false, note: null, credits: PRICES.ask, threadId };
    setLive({ ...state });
    scrollDown();
    let current = { ...state };
    const update = (fn) => {
      current = fn(current);
      setLive({ ...current });
    };

    const res = await streamNdjson(
      "/api/intel/ask",
      { question, threadId, brand: slimBrand(brand), targets },
      (e) => {
        if (e.t === "start") {
          setCredits(e.credits);
          update((s) => ({ ...s, threadId: e.threadId, started: true }));
          if (!threadId) {
            liveThread.current = e.threadId;
            setThreads((t) => [{ id: e.threadId, title: e.title || question, updated_at: new Date().toISOString() }, ...(t || [])]);
            router.replace(`/ask?t=${e.threadId}`, { scroll: false });
          }
        } else if (e.t === "step") update((s) => ({ ...s, steps: withStep(s.steps, e) }));
        else if (e.t === "text") {
          update((s) => ({ ...s, text: s.text + e.delta }));
        } else if (e.t === "retract") update((s) => ({ ...s, text: "" }));
        else if (e.t === "evidence") update((s) => ({ ...s, evidence: e.posts }));
        else if (e.t === "proposal") update((s) => ({ ...s, proposal: e }));
        else if (e.t === "actions") update((s) => ({ ...s, findingIds: e.findingIds }));
        else if (e.t === "refund") {
          setCredits(e.credits);
          update((s) => ({ ...s, credits: 0, note: e.reason }));
        } else if (e.t === "done") {
          setCredits(e.credits);
          update((s) => ({ ...s, sample: e.sample, messageId: e.messageId }));
        } else if (e.t === "error") {
          if (e.credits != null) setCredits(e.credits);
          // A dropped connection after the answer started: it may still have
          // finished and been saved, so say so and offer to look.
          if (e.code === "network" && current.started) setError({ code: "dropped", message: "The connection dropped while I was answering. If I finished, the answer is saved in this conversation." });
          // Already being answered: nothing was charged; look again shows the answer once it lands.
          else if (e.code === "busy") setError({ code: "dropped", message: e.message });
          else setError({ code: e.code, message: e.message });
        }
      },
      ac.signal
    );
    abortRef.current = null;
    sending.current = false;

    if (res.ok) {
      const done = current;
      setMessages((m) => [
        ...m,
        { id: `q${Date.now()}`, role: "user", content: question },
        {
          id: done.messageId || `a${Date.now()}`,
          role: "assistant",
          content: done.text,
          credits: done.credits,
          data: { steps: done.steps, evidence: done.evidence, findingIds: done.findingIds, proposal: done.proposal, sample: done.sample },
          note: done.note,
        },
      ]);
      setThreads((t) => {
        const list = t || [];
        const hit = list.find((x) => x.id === done.threadId);
        const rest = list.filter((x) => x.id !== done.threadId);
        return [{ ...(hit || { id: done.threadId, title: question }), updated_at: new Date().toISOString() }, ...rest];
      });
      setLive(null);
      liveThread.current = null;
      // The evidence and next steps land under the answer: bring them into view.
      setTimeout(() => scrollDown(), 120);
    } else if (res.aborted && current.text.trim().length >= 80) {
      // Stopped after part of the answer was shown: it's kept, and counted.
      const done = current;
      setMessages((m) => [
        ...m,
        { id: `q${Date.now()}`, role: "user", content: question },
        { id: `a${Date.now()}`, role: "assistant", content: `${done.text.trim()}\n\n_Stopped before the end._`, credits: PRICES.ask, data: { steps: done.steps, stopped: true } },
      ]);
      setLive(null);
      liveThread.current = null;
      toast("Stopped. What was written is kept in this conversation.");
    } else {
      // Nothing was kept: put the question back so it can be sent again.
      setLive(null);
      liveThread.current = null;
      setDraft(question);
      if (res.aborted) toast("Stopped. That one didn't use any credits.");
      if (!res.aborted && current.started && current.threadId) liveThread.current = null;
      // A new conversation that was stopped or failed isn't kept, unless the
      // connection dropped mid-answer: then it may have finished.
      if (!threadId && current.threadId && res.aborted) {
        router.replace("/ask", { scroll: false });
        setThreads((t) => (t || []).filter((x) => x.id !== current.threadId));
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const stop = () => abortRef.current?.abort();

  // A suggestion fills the box, so the price is on the button that sends it.
  const pick = (q) => {
    setDraft(q);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(q.length, q.length);
    });
  };

  // Leaving while an answer is being written loses it (it isn't charged).
  useEffect(() => {
    if (!live) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [live]);

  const newChat = () => {
    if (live) return;
    setListOpen(false);
    setMessages([]);
    setLocal([]);
    setError(null);
    router.push("/ask");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const open = (id) => {
    if (live) return;
    setListOpen(false);
    router.push(`/ask?t=${id}`);
  };

  const remove = async (id) => {
    const r = await sendJson(`/api/intel/threads?id=${id}`, null, "DELETE");
    if (r.error) {
      toast(r.error.message);
      return;
    }
    setThreads((t) => (t || []).filter((x) => x.id !== id));
    if (id === threadId) router.replace("/ask");
    toast("Conversation deleted");
  };

  const runProposal = async (proposal) => {
    setRunningProposal(proposal);
    const r = await startReport({
      kind: proposal.kind,
      params: { platform: proposal.platform, format: proposal.format, topic: proposal.topic || proposal.focus, handles: proposal.handles },
      brand,
      targets,
    });
    setRunningProposal(null);
    if (r.error) {
      toast(r.error.message, { duration: 6000 });
      return;
    }
    router.push(`/insights/reports/${r.reportId}`);
  };

  const title = useMemo(() => threads?.find((t) => t.id === threadId)?.title, [threads, threadId]);
  const afford = (n) => (account?.credits ?? 0) >= n;
  const welcomeFree = (kind) => Boolean(account?.welcomeReport) && kind !== "creators";

  const historyButton = account?.plan ? (
    <IconButton label="Conversations" onClick={() => setListOpen(true)} className="lg:hidden" variant="quiet">
      <ClockCounterClockwise size={17} />
    </IconButton>
  ) : null;

  if (ready && account && !account.plan) {
    return (
      <AppShell title="Ask">
        <Locked
          title="Ask me anything about your market"
          body="What's working in your niche, what's rising this week, how your competitors post, what your audience asks, and which creators fit. Every answer is read from real posts. Asking opens with a plan."
        />
      </AppShell>
    );
  }

  const empty = !threadId && !messages.length && !live && !local.length;
  const list = <ThreadList threads={threads} active={threadId} onOpen={open} onNew={newChat} onDelete={remove} busy={Boolean(live)} />;

  return (
    <AppShell title={title || "Ask"} docTitle="Ask" actions={historyButton}>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-[88px]">{list}</div>
        </aside>

        <div className="flex min-h-[calc(100dvh-220px)] flex-col">
          <div className="flex-1">
            {!hydrated || !ready ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : empty ? (
              <EmptyAsk brand={brand} onPick={pick} disabled={Boolean(live)} />
            ) : (
              <div className="flex flex-col gap-7 pb-6">
                {loadingThread ? (
                  <div className="space-y-4">
                    <Skeleton className="ml-auto h-10 w-2/3" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : null}
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <Appear key={m.id ?? i} layout={false}>
                      <UserBubble>{m.content}</UserBubble>
                    </Appear>
                  ) : (
                    <Appear key={m.id ?? i} layout={false}>
                      <Answer
                        text={m.content}
                        steps={m.data?.steps}
                        evidence={m.data?.evidence}
                        proposal={m.data?.proposal ? { ...m.data.proposal, free: welcomeFree(m.data.proposal.kind) } : null}
                        findingIds={m.data?.findingIds}
                        sample={m.data?.sample}
                        credits={m.credits}
                        note={m.note}
                        studio={account?.studio}
                        afford={afford}
                        onRunProposal={() => runProposal(m.data.proposal)}
                        runningProposal={runningProposal === m.data?.proposal}
                      />
                    </Appear>
                  )
                )}
                {waiting ? (
                  <p className="flex items-center gap-2 text-[13.5px] text-muted sm:pl-[42px]" role="status">
                    <CircleNotch size={14} weight="bold" className="animate-spin" aria-hidden="true" />
                    Still answering this question. The answer will appear here.
                  </p>
                ) : null}
                {live ? (
                  <>
                    <UserBubble>{live.question}</UserBubble>
                    <Answer text={live.text} steps={live.steps} live streaming studio={account?.studio} />
                  </>
                ) : null}
                {local.map((m) =>
                  m.role === "user" ? (
                    <Appear key={m.id} layout={false}>
                      <UserBubble>{m.content}</UserBubble>
                    </Appear>
                  ) : (
                    <Appear key={m.id} layout={false} className="flex flex-col gap-4">
                      <Answer text={m.content} credits={0} />
                      <div className="sm:pl-[42px]">
                        <Suggestions brand={brand} onPick={pick} disabled={Boolean(live)} />
                      </div>
                    </Appear>
                  )
                )}
                {error?.code === "dropped" ? (
                  <GateNote
                    error={error}
                    onRetry={async () => {
                      const id = threadId || liveThread.current;
                      if (!id) return;
                      const r = await getJson(`/api/intel/threads?id=${id}`);
                      if (!r.error) {
                        setMessages(r.messages || []);
                        setError(null);
                      }
                    }}
                  />
                ) : (
                  <GateNote error={error} onRetry={() => ask()} />
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 -mx-1 bg-gradient-to-t from-canvas from-70% to-transparent px-1 pt-6 pb-1 lg:bottom-0 lg:pb-5">
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={() => ask()}
              onStop={stop}
              busy={Boolean(live) || waiting}
              stoppable={Boolean(live?.started)}
              disabled={!ready}
              price={PRICES.ask}
              credits={account?.credits}
              resets={account?.periodEnd ? new Date(account.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null}
              inputRef={inputRef}
            />
          </div>
        </div>
      </div>

      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Conversations" width={380}>
        {list}
      </Sheet>
    </AppShell>
  );
}

function EmptyAsk({ brand, onPick, disabled }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex flex-col gap-6 pt-2 sm:pt-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Huesy mood="idle" size={56} />
        <div>
          <h2 className="display-lg text-[26px] sm:text-[30px]">What do you want to know?</h2>
          <p className="mt-1 max-w-[56ch] text-[14.5px] leading-relaxed text-muted">
            I read real posts to answer, show you the ones behind every claim, and remember what we learn so the next
            answer and everything you make starts from it.
          </p>
        </div>
      </div>
      <Suggestions brand={brand} onPick={onPick} disabled={disabled} />
    </motion.div>
  );
}

function ThreadList({ threads, active, onOpen, onNew, onDelete, busy }) {
  const [confirm, setConfirm] = useState(null);
  return (
    <div className="flex flex-col gap-3">
      <Button variant="quiet" size="sm" onClick={onNew} disabled={busy} className="w-full justify-start">
        <NotePencil size={15} />
        New question
      </Button>
      {threads === null ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : !threads.length ? (
        <p className="px-2 text-[13px] leading-relaxed text-muted">Your conversations will be kept here, and everything we learn in them is remembered.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          <AnimatePresence initial={false}>
            {threads.map((t) => (
              <motion.li key={t.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={SPRING} className="group relative">
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  disabled={busy && t.id !== active}
                  aria-current={t.id === active ? "page" : undefined}
                  className={cx(
                    "flex w-full flex-col rounded-2xl px-3 py-2 pr-9 text-left transition-colors pointer-coarse:min-h-11",
                    t.id === active ? "bg-accent-soft text-accent-deep" : "text-ink hover:bg-sunken"
                  )}
                >
                  <span className="line-clamp-2 text-[13.5px] leading-snug">{t.title}</span>
                  <span className={cx("mt-0.5 text-[11.5px]", t.id === active ? "text-accent-deep/80" : "text-faint")}>{ago(t.updated_at)}</span>
                </button>
                {confirm === t.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirm(null);
                      onDelete(t.id);
                    }}
                    onBlur={() => setConfirm(null)}
                    autoFocus
                    className="absolute right-1.5 top-1.5 rounded-full bg-danger px-3 py-1 text-[12.5px] font-medium text-canvas pointer-coarse:min-h-11"
                  >
                    Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={`Delete "${t.title}"`}
                    onClick={() => setConfirm(t.id)}
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-faint opacity-0 transition-opacity hover:bg-surface hover:text-danger focus:opacity-100 group-hover:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:opacity-100"
                  >
                    <Trash size={13} />
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
