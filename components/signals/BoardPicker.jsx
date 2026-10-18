"use client";

import { useEffect, useState } from "react";
import { Check, FolderSimple, Plus } from "@phosphor-icons/react";
import { Button, Input, Sheet, cx, toast } from "../ui";
import { useStore } from "../../lib/store";

/**
 * Moves one saved item between boards, or into a new one. Opened from the
 * "Move" in a save toast, or from a saved item's menu.
 */
export default function BoardPicker({ saveId, onClose }) {
  const boards = useStore((s) => s.boards);
  const item = useStore((s) => s.saves.find((x) => x.id === saveId));
  const moveSave = useStore((s) => s.moveSave);
  const createBoard = useStore((s) => s.createBoard);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!saveId) setName("");
  }, [saveId]);

  const move = (boardId, label) => {
    moveSave(saveId, boardId);
    toast(`Moved to ${label}`, { tone: "good" });
    onClose();
  };

  return (
    <Sheet open={Boolean(saveId && item)} onClose={onClose} title="Move to a board" width={440}>
      {item?.title ? <p className="-mt-1 mb-4 line-clamp-2 text-[13.5px] text-muted">{item.title}</p> : null}
      <div className="flex flex-col gap-1">
        {boards.map((b) => {
          const here = item?.boardId === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => (here ? onClose() : move(b.id, b.name))}
              className={cx(
                "flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors",
                here ? "bg-accent-soft text-accent-deep" : "text-ink hover:bg-sunken"
              )}
            >
              <FolderSimple size={17} className={here ? "" : "text-muted"} weight={here ? "fill" : "regular"} />
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              {here ? <Check size={15} weight="bold" /> : null}
            </button>
          );
        })}
      </div>
      <form
        className="mt-4 flex gap-2 border-t border-line pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          const id = createBoard(n);
          move(id, n);
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New board name" aria-label="New board name" className="h-10" />
        <Button type="submit" size="md" variant="quiet" disabled={!name.trim()}>
          <Plus size={14} weight="bold" />
          Create
        </Button>
      </form>
    </Sheet>
  );
}

// Save and unsave with the toasts that go with them: "Move" right after a
// save, "Undo" right after taking something out.
export function useSaving() {
  const toggleSaveSignal = useStore((s) => s.toggleSaveSignal);
  const restoreSave = useStore((s) => s.restoreSave);
  const saveItem = useStore((s) => s.saveItem);
  const [moving, setMoving] = useState(null);

  const toggleSignal = (signal) => {
    const r = toggleSaveSignal(signal);
    if (r.saved) toast("Saved", { tone: "good", action: { label: "Move", onClick: () => setMoving(r.id) } });
    else toast("Removed from Saved", { action: { label: "Undo", onClick: () => restoreSave(r.removed) } });
  };

  const savePost = ({ signal, platform, text, label }) => {
    const id = saveItem({ type: "content", title: `${label || platform}: ${signal.headline}`, platform, content: text, signal });
    toast("Post saved", { tone: "good", action: { label: "Move", onClick: () => setMoving(id) } });
  };

  const picker = <BoardPicker saveId={moving} onClose={() => setMoving(null)} />;
  return { toggleSignal, savePost, picker, openPicker: setMoving };
}
