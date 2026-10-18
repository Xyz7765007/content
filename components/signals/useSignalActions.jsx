"use client";

import { useCallback, useMemo, useState } from "react";
import SignalSheet from "./SignalSheet";
import { useSaving } from "./BoardPicker";
import { useStore } from "../../lib/store";
import { useAccount } from "../../lib/account";
import { goTo } from "../../lib/runner";
import { toast } from "../ui";

/**
 * Everything a list of signals needs, in one place: open a signal, write
 * about it, save it, and the sheets those open. Screens render `ui` once.
 */
export function useSignalActions() {
  const [active, setActive] = useState({ signal: null, open: false, autoWrite: false });
  const saves = useStore((s) => s.saves);
  const drafts = useStore((s) => s.drafts);
  const { toggleSignal, savePost, picker } = useSaving();

  const savedIds = useMemo(
    () => new Set(saves.filter((x) => x.type === "signal").map((x) => x.signal?.id)),
    [saves]
  );

  const openSignal = useCallback((signal) => setActive({ signal, open: true, autoWrite: false }), []);
  // Writing posts is part of Studio: on Intelligence, say so instead of
  // starting a write that would only fail.
  const writeSignal = useCallback((signal) => {
    const account = useAccount.getState().account;
    if (account && !account.studio) {
      toast("Writing posts is part of Studio.", { action: { label: "See Studio", onClick: () => goTo("/plans") } });
      return;
    }
    setActive({ signal, open: true, autoWrite: true });
  }, []);
  const close = useCallback(() => setActive((a) => ({ ...a, open: false })), []);
  const draftCount = useCallback((signal) => Object.keys(drafts?.[signal.id] || {}).length, [drafts]);

  const ui = (
    <>
      <SignalSheet
        signal={active.signal}
        open={active.open}
        autoWrite={active.autoWrite}
        onClose={close}
        saved={active.signal ? savedIds.has(active.signal.id) : false}
        onToggleSave={toggleSignal}
        onSavePost={savePost}
      />
      {picker}
    </>
  );

  return { openSignal, writeSignal, toggleSignal, savedIds, draftCount, ui };
}
