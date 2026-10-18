"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_CREATIVE_DIRECTION,
  DEFAULT_RESULT_RANGE,
  GLOBAL_REGION,
  normaliseRegions,
} from "./constants";

const emptyBrand = {
  brandName: "",
  // Which platforms this brand actually publishes on. Chosen up front so the
  // tone step only asks for the tones that will be used.
  activePlatforms: [],
  product: "",
  brandDescription: "",
  targetAudience: "",
  brandPersona: "",
  brandValues: "",
  platformPersonality: {},
  referencePosts: {},
  creativeDirection: DEFAULT_CREATIVE_DIRECTION,
  instaRefImages: [null, null, null, null],
  refCreativeImages: [null, null, null],
  atRid: null,
};

const emptyTargets = {
  targetMode: "niche",
  niche: "",
  subNiches: "",
  accountList: "",
};

const freshDraft = (targets = emptyTargets) => ({
  name: "",
  selectedSignals: [],
  signalPrompts: {},
  researchPlatforms: ["google", "instagram", "twitter"],
  researchLocations: [GLOBAL_REGION],
  resultRange: DEFAULT_RESULT_RANGE,
  lookbackDays: 7,
  targetMode: targets.targetMode || "niche",
  niche: targets.niche || "",
  subNiches: targets.subNiches || "",
  accountList: targets.accountList || "",
});

const DEFAULT_BOARD = { id: "default", name: "Unsorted", createdAt: 0 };

const uid = () => Math.random().toString(36).substring(2, 11);
const headlineKey = (s) => String(s?.headline || "").trim().toLowerCase().replace(/\W+/g, " ");

// localStorage is capped around 5MB and reference images are base64. A quota
// failure must not take the whole app down, so the write is guarded and falls
// back to dropping the heavy image fields rather than losing everything.
const safeStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      try {
        const parsed = JSON.parse(value);
        if (parsed?.state?.brand) {
          parsed.state.brand.instaRefImages = [null, null, null, null];
          parsed.state.brand.refCreativeImages = [null, null, null];
        }
        localStorage.setItem(name, JSON.stringify(parsed));
      } catch {
        /* storage is unavailable, the session stays in memory only */
      }
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* nothing to do */
    }
  },
};

// Every store write stamps updatedAt. StateSync compares it with the copy on
// Supabase so a stale snapshot arriving late can never overwrite a fresher
// local edit, and a fresher remote copy from another device still wins.
const stamped = (config) => (set, get, api) =>
  config(
    (patch, replace) =>
      set(
        (state) => ({
          ...(typeof patch === "function" ? patch(state) : patch),
          updatedAt: Date.now(),
        }),
        replace
      ),
    get,
    api
  );

// Brings a stored state (local or from Supabase) up to the current shape.
export function migrateState(state, from) {
  if (!state) return state;
  // v3 stored regions as short ids and let a search pick from seven
  // platforms. Regions are labels now, and only three platforms remain.
  if (from < 4) {
    const keep = new Set(["google", "instagram", "twitter"]);
    const fixConfig = (c) => {
      if (!c) return c;
      const platforms = (c.researchPlatforms || []).filter((x) => keep.has(x));
      return {
        ...c,
        researchLocations: normaliseRegions(c.researchLocations),
        researchPlatforms: platforms.length ? platforms : ["google"],
      };
    };
    state.draft = fixConfig(state.draft);
    state.searches = (state.searches || []).map((x) => ({ ...x, config: fixConfig(x.config) }));
  }
  // v2 had no activePlatforms and asked for all four tones.
  if (from < 3 && state.brand && !state.brand.activePlatforms) {
    const written = Object.entries(state.brand.platformPersonality || {})
      .filter(([, v]) => v && v.trim())
      .map(([k]) => k);
    state.brand.activePlatforms = written.length ? written : ["instagram", "linkedin", "twitter", "email"];
  }
  // v4 had bookmarks beside boards, and kept written posts only for the
  // last run. Bookmarks become saves in Unsorted; the last run's posts
  // become drafts under their signals.
  if (from < 5) {
    const saves = [...(state.saves || [])];
    const savedIds = new Set(saves.filter((x) => x.type === "signal").map((x) => x.signal?.id));
    for (const b of Object.values(state.bookmarks || {})) {
      if (!b?.id || savedIds.has(b.id)) continue;
      const { bookmarkedAt, ...signal } = b;
      saves.push({ id: uid(), boardId: "default", savedAt: bookmarkedAt || Date.now(), type: "signal", title: b.headline, signal });
    }
    state.saves = saves;
    delete state.bookmarks;
    if (!(state.boards || []).length) state.boards = [{ ...DEFAULT_BOARD }];

    const drafts = { ...(state.drafts || {}) };
    for (const [signalId, byPlatform] of Object.entries(state.compose?.generatedContent || {})) {
      for (const [platform, text] of Object.entries(byPlatform || {})) {
        if (!text || String(text).startsWith("Error:")) continue;
        drafts[signalId] = { ...(drafts[signalId] || {}), [platform]: { text, at: Date.now() } };
      }
    }
    state.drafts = drafts;
    if (state.compose) delete state.compose.generatedContent;
    state.searches = (state.searches || []).map((x) => ({ ...x, lastRunAt: x.lastRunAt || x.createdAt, runs: x.runs || 1 }));
  }
  return state;
}

export const STATE_VERSION = 5;

export const useStore = create()(
  persist(
    stamped((set, get) => ({
      updatedAt: 0,

      /* ------------------------------------------------------------ brand */
      brand: { ...emptyBrand },
      targets: { ...emptyTargets },
      onboarded: false,

      setBrand: (patch) =>
        set((s) => ({
          brand: { ...s.brand, ...(typeof patch === "function" ? patch(s.brand) : patch) },
        })),
      setTargets: (patch) =>
        set((s) => ({
          targets: {
            ...s.targets,
            ...(typeof patch === "function" ? patch(s.targets) : patch),
          },
        })),
      completeOnboarding: () => set({ onboarded: true }),
      resetBrand: () => set({ brand: { ...emptyBrand }, targets: { ...emptyTargets }, onboarded: false }),

      /* -------------------------------------------- watchlists (searches) */
      // A search is a saved watchlist: what to watch, which kinds of move
      // count, where to look. Running it again merges the new signals in.
      searches: [],
      draft: freshDraft(),

      setDraft: (patch) =>
        set((s) => ({
          draft: { ...s.draft, ...(typeof patch === "function" ? patch(s.draft) : patch) },
        })),

      resetDraft: () => set((s) => ({ draft: freshDraft(s.targets) })),

      saveSearch: (config, signals) => {
        const id = uid();
        const now = Date.now();
        set((s) => ({
          searches: [
            {
              id,
              name: config.name || config.niche || "Untitled watchlist",
              config,
              signals,
              createdAt: now,
              lastRunAt: signals.length ? now : 0,
              runs: signals.length ? 1 : 0,
            },
            ...s.searches,
          ],
        }));
        return id;
      },

      // Folds a fresh run into an existing watchlist: new stories go on top,
      // a story seen before keeps its place, its ranking and its drafts.
      mergeRun: (id, fresh) =>
        set((s) => ({
          searches: s.searches.map((x) => {
            if (x.id !== id) return x;
            const known = new Map((x.signals || []).map((sig) => [headlineKey(sig), sig]));
            const added = [];
            for (const sig of fresh) {
              const prev = known.get(headlineKey(sig));
              if (prev) known.set(headlineKey(sig), { ...prev, fit: sig.fit ?? prev.fit, angle: sig.angle || prev.angle });
              else added.push(sig);
            }
            return {
              ...x,
              signals: [...added, ...known.values()],
              lastRunAt: Date.now(),
              runs: (x.runs || 1) + 1,
              lastAdded: added.length,
            };
          }),
        })),

      updateSearch: (id, patch) =>
        set((s) => ({
          searches: s.searches.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),

      // Applies ranks ({ id, fit, angle }) to whichever watchlists hold them.
      applyRanks: (ranks) => {
        const byId = new Map((ranks || []).map((r) => [r.id, r]));
        if (!byId.size) return;
        set((s) => ({
          searches: s.searches.map((x) => ({
            ...x,
            signals: (x.signals || []).map((sig) =>
              byId.has(sig.id) ? { ...sig, fit: byId.get(sig.id).fit, angle: byId.get(sig.id).angle } : sig
            ),
          })),
        }));
      },

      deleteSearch: (id) => {
        const s = get();
        const index = s.searches.findIndex((x) => x.id === id);
        const removed = s.searches[index];
        set({ searches: s.searches.filter((x) => x.id !== id) });
        return removed ? { removed, index } : null;
      },

      restoreSearch: ({ removed, index }) =>
        set((s) => {
          if (!removed || s.searches.some((x) => x.id === removed.id)) return {};
          const next = [...s.searches];
          next.splice(Math.min(index, next.length), 0, removed);
          return { searches: next };
        }),

      getSearch: (id) => get().searches.find((x) => x.id === id),

      /* ------------------------------------------------------------ saves */
      // One way to keep things: save. A save lands in a board (Unsorted by
      // default) and can be moved later. Signals and finished posts both
      // live here.
      boards: [{ ...DEFAULT_BOARD }],
      saves: [],
      lastBoardId: "default",

      createBoard: (name) => {
        const id = uid();
        set((s) => ({ boards: [...s.boards, { id, name, createdAt: Date.now() }] }));
        return id;
      },

      renameBoard: (id, name) => set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, name } : b)) })),

      // Deleting a board removes what is filed in it; the caller offers Undo
      // with what this returns. There is always at least one board.
      deleteBoard: (id) => {
        const s = get();
        const board = s.boards.find((b) => b.id === id);
        const items = s.saves.filter((x) => x.boardId === id);
        const boards = s.boards.filter((b) => b.id !== id);
        set({
          boards: boards.length ? boards : [{ ...DEFAULT_BOARD, createdAt: Date.now() }],
          saves: s.saves.filter((x) => x.boardId !== id),
          lastBoardId: s.lastBoardId === id ? "default" : s.lastBoardId,
        });
        return board ? { board, items } : null;
      },

      restoreBoard: ({ board, items }) =>
        set((s) => ({
          boards: s.boards.some((b) => b.id === board.id) ? s.boards : [...s.boards, board],
          saves: [...items, ...s.saves.filter((x) => !items.some((i) => i.id === x.id))],
        })),

      saveItem: (item, boardId) => {
        const id = uid();
        const target = boardId || get().lastBoardId || "default";
        set((s) => ({
          saves: [{ id, boardId: target, savedAt: Date.now(), ...item }, ...s.saves],
          lastBoardId: target,
        }));
        return id;
      },

      // Saving a signal is a toggle: save it, or take it out of wherever it is.
      toggleSaveSignal: (signal, boardId) => {
        const existing = get().saves.find((x) => x.type === "signal" && x.signal?.id === signal.id);
        if (existing) {
          set((s) => ({ saves: s.saves.filter((x) => x.id !== existing.id) }));
          return { saved: false, removed: existing };
        }
        const id = get().saveItem({ type: "signal", title: signal.headline, signal }, boardId);
        return { saved: true, id };
      },

      moveSave: (id, boardId) =>
        set((s) => ({ saves: s.saves.map((x) => (x.id === id ? { ...x, boardId } : x)), lastBoardId: boardId })),

      removeSave: (id) => {
        const removed = get().saves.find((x) => x.id === id);
        set((s) => ({ saves: s.saves.filter((x) => x.id !== id) }));
        return removed || null;
      },

      restoreSave: (item) =>
        set((s) => (item && !s.saves.some((x) => x.id === item.id) ? { saves: [item, ...s.saves] } : {})),

      /* ----------------------------------------------------------- drafts */
      // Every post written for a signal, kept under the signal's id so the
      // card can say it has drafts and the sheet can reopen them.
      drafts: {},

      setDraftPost: (signalId, platform, text) =>
        set((s) => ({
          drafts: {
            ...s.drafts,
            [signalId]: { ...(s.drafts[signalId] || {}), [platform]: { text, at: Date.now() } },
          },
        })),

      /* ---------------------------------------------------------- compose */
      // A batch run: several signals, several platforms. Results are read
      // from drafts.
      compose: {
        searchId: null,
        signals: [],
        selectedPlatforms: [],
        emailPersonalisation: "",
        emailCsvData: null,
        emailFieldMap: {},
      },

      setCompose: (patch) =>
        set((s) => ({
          compose: {
            ...s.compose,
            ...(typeof patch === "function" ? patch(s.compose) : patch),
          },
        })),

      resetCompose: () =>
        set({
          compose: {
            searchId: null,
            signals: [],
            selectedPlatforms: [],
            emailPersonalisation: "",
            emailCsvData: null,
            emailFieldMap: {},
          },
        }),

      /* ------------------------------------------------------------- feed */
      // When the feed was last looked at, so new signals can say they are new.
      seenAt: 0,
      markSeen: () => set({ seenAt: Date.now() }),

      /* --------------------------------------------------------- settings */
      settings: { googleKey: "", displayName: "", email: "" },
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      /* ------------------------------------------------------------ owner */
      // Which account this browser's copy belongs to. Null until someone
      // signs in, so setup done before an account is adopted by the first
      // account, and never handed to a second one.
      ownerId: null,
      setOwner: (ownerId) => set({ ownerId }),

      // Sign out: this browser forgets everything, so the next person to use
      // it starts clean.
      resetLocal: () =>
        set({
          brand: { ...emptyBrand },
          targets: { ...emptyTargets },
          onboarded: false,
          searches: [],
          draft: freshDraft(),
          boards: [{ ...DEFAULT_BOARD }],
          saves: [],
          lastBoardId: "default",
          drafts: {},
          compose: {
            searchId: null,
            signals: [],
            selectedPlatforms: [],
            emailPersonalisation: "",
            emailCsvData: null,
            emailFieldMap: {},
          },
          seenAt: 0,
          settings: { googleKey: "", displayName: "", email: "" },
          ownerId: null,
          updatedAt: 0,
        }),
    })),
    {
      name: "content-engine",
      version: STATE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      migrate: migrateState,
    }
  )
);

// Zustand rehydrates after the first client render. Reading persisted state
// during that first pass would mismatch the server HTML, so screens gate on it.
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setHydrated(true);
      return undefined;
    }
    return useStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}

// Every signal across every watchlist, one per story, newest search first.
export function collectSignals(searches) {
  const byKey = new Map();
  for (const s of searches || []) {
    for (const sig of s.signals || []) {
      const key = headlineKey(sig);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, { ...sig, searchId: s.id, searchName: s.name });
    }
  }
  return [...byKey.values()];
}
