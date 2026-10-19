"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { sendJson } from "./stream";
import { slimBrand } from "./api";
import { useStore } from "./store";

// The brand's market map in the browser: loaded once per brand profile and
// shared by every screen that says what a piece of work will read.

const useMap = create(() => ({ key: null, map: null, loading: false, error: null }));

const signature = (brand, targets) =>
  JSON.stringify([brand?.brandName, brand?.product, brand?.brandDescription?.slice(0, 200), brand?.intel, targets?.niche, targets?.subNiches]);

export function useMarketMap({ enabled = true } = {}) {
  const brand = useStore((s) => s.brand);
  const targets = useStore((s) => s.targets);
  const state = useMap();
  const key = signature(brand, targets);

  useEffect(() => {
    if (!enabled || !brand?.brandName) return;
    const now = useMap.getState();
    if (now.key === key && (now.map || now.loading)) return;
    let cached = null;
    try {
      cached = JSON.parse(sessionStorage.getItem("huesy:map") || "null");
    } catch {
      /* private window */
    }
    if (cached?.key === key && cached.map) {
      useMap.setState({ key, map: cached.map, loading: false, error: null });
      return;
    }
    useMap.setState({ key, map: null, loading: true, error: null });
    sendJson("/api/intel/map", { brand: slimBrand(brand), targets }).then((r) => {
      if (useMap.getState().key !== key) return;
      if (r.error) useMap.setState({ loading: false, error: r.error });
      else {
        useMap.setState({ map: r.map, loading: false, error: null });
        try {
          sessionStorage.setItem("huesy:map", JSON.stringify({ key, map: r.map }));
        } catch {
          /* fine */
        }
      }
    });
  }, [enabled, key, brand, targets]);

  // No brand yet: nothing to map, and nothing to wait for.
  if (!brand?.brandName) return { key, map: null, loading: false, error: null, missingBrand: true };
  return state.key === key ? state : { key, map: null, loading: enabled, error: null };
}
