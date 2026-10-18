"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { getJson, sendJson } from "./stream";
import { PLANS, PRICES, formatCredits } from "./plans";

/**
 * The person's plan, credits and allowances, read once and shared by every
 * screen. Paid actions report the new balance in their responses, so the
 * meter moves the moment credits are spent or refunded without a refetch.
 */
export const useAccount = create((set, get) => ({
  account: null,
  error: null,
  loadedAt: 0,
  loading: false,

  load: async (force = false) => {
    const { loadedAt, loading } = get();
    if (loading || (!force && Date.now() - loadedAt < 20000)) return get().account;
    set({ loading: true });
    const r = await getJson("/api/account");
    if (r.error) {
      set({ loading: false, error: r.error, loadedAt: Date.now() });
      return null;
    }
    set({ account: r, error: null, loading: false, loadedAt: Date.now() });
    return r;
  },

  // A paid action told us the new balance.
  setCredits: (credits) => {
    if (credits == null || !Number.isFinite(Number(credits))) return;
    set((s) => (s.account ? { account: { ...s.account, credits: Number(credits) } } : {}));
  },

  requestPlan: async (plan, note) => {
    const r = await sendJson("/api/account", { action: "request_plan", plan, note });
    if (!r.error && r.account) set({ account: r.account, loadedAt: Date.now() });
    return r;
  },
}));

export const loadAccount = (force) => useAccount.getState().load(force);
export const refreshAccount = () => useAccount.getState().load(true);
export const setCredits = (n) => useAccount.getState().setCredits(n);

// Loads the account on mount (and when the tab comes back into view).
export function useAccountData() {
  const account = useAccount((s) => s.account);
  const error = useAccount((s) => s.error);
  const loadedAt = useAccount((s) => s.loadedAt);
  useEffect(() => {
    loadAccount();
    const onShow = () => document.visibilityState === "visible" && loadAccount();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);
  return { account, error, ready: loadedAt > 0 };
}

// What the person can do, in one place.
export const can = (account) => ({
  intel: Boolean(account?.plan),
  studio: Boolean(account?.studio),
  credits: account?.credits ?? 0,
  afford: (action, amount) => (account?.credits ?? 0) >= (amount ?? PRICES[action] ?? 0),
});

export const priceOf = (action) => PRICES[action] ?? 0;
export const creditsLabel = (n) => `${formatCredits(n)} credit${Number(n) === 1 ? "" : "s"}`;

export const resetDate = (account) =>
  account?.periodEnd ? new Date(account.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;

export { PLANS, PRICES, formatCredits };
