"use client";

import { useEffect } from "react";

// Sets the tab title to "<title> · Huesy". On a fresh load, hydrating the
// server's <title> writes the site's title back just after this runs, so for
// a moment after mounting the title is put back whenever it changes.
export function useTitle(title) {
  useEffect(() => {
    if (!title) return undefined;
    const want = `${title} · Huesy`;
    document.title = want;
    const el = document.querySelector("head > title");
    if (!el) return undefined;
    const keep = new MutationObserver(() => {
      if (document.title !== want) document.title = want;
    });
    keep.observe(el, { childList: true, characterData: true, subtree: true });
    const stop = setTimeout(() => keep.disconnect(), 1000);
    return () => {
      clearTimeout(stop);
      keep.disconnect();
    };
  }, [title]);
}
