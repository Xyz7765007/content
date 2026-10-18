"use client";

import { useEffect, useRef } from "react";
import { STATE_VERSION, migrateState, useStore } from "../../lib/store";
import { getSupabaseBrowser } from "../../lib/supabase/client";
import { useSession } from "./useSession";

/**
 * Keeps a signed in user's app state on Supabase.
 *
 * The Zustand store stays the working copy so every screen is instant. This
 * component loads the user's saved state once on sign in and merges it over
 * whatever is in the browser, then writes the store back, debounced, whenever
 * it changes. One row per user in user_state, guarded by row level security.
 *
 * Reference images are base64 and can run to megabytes, so they stay on the
 * device and are stripped before upload.
 */

const SYNCED_KEYS = [
  "brand",
  "targets",
  "onboarded",
  "searches",
  "draft",
  "boards",
  "saves",
  "lastBoardId",
  "drafts",
  "seenAt",
  "settings",
];

const stripHeavy = (state) => {
  const out = { updatedAt: state.updatedAt || 0 };
  for (const k of SYNCED_KEYS) out[k] = state[k];
  if (out.brand) {
    out.brand = {
      ...out.brand,
      instaRefImages: [null, null, null, null],
      refCreativeImages: [null, null, null],
    };
  }
  if (out.settings) out.settings = { ...out.settings, googleKey: "" };
  return out;
};

export default function StateSync() {
  const { user, configured } = useSession();
  const loadedFor = useRef(null);
  const timer = useRef(null);
  const lastPushed = useRef("");

  // Load on sign in.
  useEffect(() => {
    if (!configured || !user || loadedFor.current === user.id) return undefined;
    const supabase = getSupabaseBrowser();
    if (!supabase) return undefined;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("user_state")
        .select("state, version")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || error) return;

      const local = useStore.getState();
      // A copy saved by an older build is brought up to the current shape
      // with the same migration the local store uses.
      const stored = data?.state && Object.keys(data.state).length ? { ...data.state } : null;
      const remote = stored && (data.version || 1) < STATE_VERSION ? migrateState(stored, data.version || 1) : stored;

      // Whose copy is in this browser decides who wins:
      // - this account's own copy: the newer side wins, as before;
      // - nobody's yet (setup done before signing up): it is adopted, unless
      //   the account already has its own copy, which is never overwritten;
      // - another account's leftovers: never pushed; the account's copy, or
      //   a clean slate, replaces them.
      const mine = local.ownerId === user.id;
      const anonymous = !local.ownerId;
      const remoteWins = remote
        ? mine
          ? (remote.updatedAt || 0) > (local.updatedAt || 0)
          : true
        : false;

      if (!remote && !mine && !anonymous) {
        useStore.getState().resetLocal();
      }

      if (remoteWins) {
        // Another device, or an earlier session, has the fresher copy. Apply it
        // through the raw setter so this does not count as a new local edit.
        useStore.setState({
          ...remote,
          brand: {
            ...remote.brand,
            // Reference images never leave the device, so they are kept only
            // when this browser's copy is this account's own.
            instaRefImages: (mine && local.brand?.instaRefImages) || [null, null, null, null],
            refCreativeImages: (mine && local.brand?.refCreativeImages) || [null, null, null],
          },
          settings: { ...remote.settings, googleKey: mine ? local.settings?.googleKey || "" : "" },
          ownerId: user.id,
        });
        lastPushed.current = JSON.stringify(stripHeavy(useStore.getState()));
        loadedFor.current = user.id;
        return;
      }

      // Local is this account's (or adopted): it becomes the copy of record.
      if (!mine) useStore.setState({ ownerId: user.id });
      loadedFor.current = user.id;
      const payload = stripHeavy(useStore.getState());
      const json = JSON.stringify(payload);
      if (json !== lastPushed.current) {
        const { error: upErr } = await supabase
          .from("user_state")
          .upsert({ user_id: user.id, state: payload, version: STATE_VERSION }, { onConflict: "user_id" });
        if (!upErr) lastPushed.current = json;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, user]);

  // Push on change, debounced, only after the initial load has settled.
  useEffect(() => {
    if (!configured || !user) return undefined;
    const unsub = useStore.subscribe((state) => {
      if (loadedFor.current !== user.id) return;
      const payload = stripHeavy(state);
      const json = JSON.stringify(payload);
      if (json === lastPushed.current) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const supabase = getSupabaseBrowser();
        if (!supabase) return;
        const { error } = await supabase
          .from("user_state")
          .upsert({ user_id: user.id, state: payload, version: STATE_VERSION }, { onConflict: "user_id" });
        if (!error) lastPushed.current = json;
      }, 900);
    });
    return () => {
      unsub();
      clearTimeout(timer.current);
    };
  }, [configured, user]);

  // On sign out, forget which user was loaded so the next sign in reloads.
  useEffect(() => {
    if (!user) loadedFor.current = null;
  }, [user]);

  return null;
}
