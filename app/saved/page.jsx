"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Check, Copy, FolderSimple, FolderSimpleDashed, PencilSimple, Plus, TrashSimple } from "@phosphor-icons/react";
import AppShell from "../../components/shell/AppShell";
import InsightsNav from "../../components/insights/InsightsNav";
import SignalCard from "../../components/signals/SignalCard";
import { useSignalActions } from "../../components/signals/useSignalActions";
import { PLATFORM_META } from "../../components/compose/PostCard";
import BoardPicker from "../../components/signals/BoardPicker";
import { Appear, Badge, Button, Card, Chip, EmptyState, IconButton, Input, cx, toast } from "../../components/ui";
import { useHydrated, useStore } from "../../lib/store";
import { relativeDay, sectionList } from "../../lib/parse";

const ALL = "__all";

export default function SavedPage() {
  const hydrated = useHydrated();
  const boards = useStore((s) => s.boards);
  const saves = useStore((s) => s.saves);
  const brand = useStore((s) => s.brand);
  const createBoard = useStore((s) => s.createBoard);
  const renameBoard = useStore((s) => s.renameBoard);
  const deleteBoard = useStore((s) => s.deleteBoard);
  const restoreBoard = useStore((s) => s.restoreBoard);
  const removeSave = useStore((s) => s.removeSave);
  const restoreSave = useStore((s) => s.restoreSave);
  const actions = useSignalActions();

  const [view, setView] = useState(ALL);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [rename, setRename] = useState("");
  const [moving, setMoving] = useState(null);

  const board = boards.find((b) => b.id === view);
  useEffect(() => {
    if (view !== ALL && !board) setView(ALL);
  }, [view, board]);

  const items = useMemo(
    () => saves.filter((x) => view === ALL || x.boardId === view).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)),
    [saves, view]
  );
  const countFor = (id) => saves.filter((x) => x.boardId === id).length;

  const remove = (item) => {
    removeSave(item.id);
    toast("Removed", { action: { label: "Undo", onClick: () => restoreSave(item) } });
  };

  const addBoard = () => {
    const name = newName.trim();
    if (!name) return;
    const id = createBoard(name);
    setNewName("");
    setCreating(false);
    setView(id);
  };

  const dropBoard = () => {
    const undo = deleteBoard(board.id);
    setView(ALL);
    toast(`Deleted ${board.name}${undo?.items?.length ? ` and ${undo.items.length} saved` : ""}`, {
      action: { label: "Undo", onClick: () => restoreBoard(undo) },
    });
  };

  if (!hydrated) {
    return (
      <AppShell title="Saved">
        <InsightsNav />
        <div className="skeleton h-64 rounded-[20px]" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Saved"
      actions={
        <Button size="sm" variant="quiet" onClick={() => setCreating(true)}>
          <Plus size={14} weight="bold" />
          New board
        </Button>
      }
    >
      <InsightsNav className="mb-0" />
      <div className="mt-6 flex flex-col gap-6">
        <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          <Chip selected={view === ALL} onClick={() => setView(ALL)} className="shrink-0">
            All saved <span className="tabular opacity-60">{saves.length}</span>
          </Chip>
          {boards.map((b) => (
            <Chip key={b.id} selected={view === b.id} onClick={() => setView(b.id)} className="shrink-0">
              <FolderSimple size={13} weight={view === b.id ? "fill" : "regular"} />
              {b.name} <span className="tabular opacity-60">{countFor(b.id)}</span>
            </Chip>
          ))}
        </div>

        {creating ? (
          <form
            className="flex max-w-[440px] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addBoard();
            }}
          >
            <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Board name" aria-label="New board name" className="h-10" />
            <Button type="submit" size="md" disabled={!newName.trim()}>
              Create
            </Button>
            <Button type="button" size="md" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </form>
        ) : null}

        {board ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {renaming ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (rename.trim()) renameBoard(board.id, rename.trim());
                  setRenaming(false);
                }}
              >
                <Input autoFocus value={rename} onChange={(e) => setRename(e.target.value)} aria-label="Board name" className="h-10 w-[240px]" />
                <Button type="submit" size="md">
                  Save
                </Button>
              </form>
            ) : (
              <h2 className="font-display text-[22px]">{board.name}</h2>
            )}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRename(board.name);
                  setRenaming(true);
                }}
              >
                <PencilSimple size={14} />
                Rename
              </Button>
              <Button size="sm" variant="ghost" onClick={dropBoard}>
                <TrashSimple size={14} />
                Delete board
              </Button>
            </div>
          </div>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            mood="sleepy"
            title={view === ALL ? "Nothing saved yet" : "This board is empty"}
            body="Save a signal or a finished post and it stays here, even after the watchlist moves on."
            action={
              <Button as={Link} href="/home" variant="quiet">
                Go to Today
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {items.map((item, i) => (
                <Appear key={item.id} index={i}>
                  {item.type === "signal" && item.signal ? (
                    <div className="flex h-full flex-col gap-1.5">
                      <SignalCard
                        signal={item.signal}
                        brandName={brand.brandName}
                        saved
                        drafts={actions.draftCount(item.signal)}
                        onOpen={actions.openSignal}
                        onWrite={actions.writeSignal}
                        onSave={() => remove(item)}
                      />
                      <ItemMeta item={item} boards={boards} onMove={() => setMoving(item.id)} />
                    </div>
                  ) : (
                    <SavedPost
                      item={item}
                      boards={boards}
                      onRemove={() => remove(item)}
                      onMove={() => setMoving(item.id)}
                      onOpenSignal={() => item.signal && actions.openSignal(item.signal)}
                    />
                  )}
                </Appear>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      <BoardPicker saveId={moving} onClose={() => setMoving(null)} />
      {actions.ui}
    </AppShell>
  );
}

function ItemMeta({ item, boards, onMove }) {
  const board = boards.find((b) => b.id === item.boardId);
  return (
    <button
      type="button"
      onClick={onMove}
      className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-full px-2 text-[12px] text-faint transition-colors hover:bg-sunken hover:text-ink pointer-coarse:min-h-11"
    >
      <FolderSimpleDashed size={13} />
      {board?.name || "Unsorted"} · saved {relativeDay(new Date(item.savedAt).toISOString())}
    </button>
  );
}

function SavedPost({ item, boards, onRemove, onMove, onOpenSignal }) {
  const [copied, setCopied] = useState(false);
  const list = sectionList(item.content);
  const meta = PLATFORM_META[item.platform];
  const Icon = meta?.icon;
  const plain = list.length ? list.map((s) => s.value).join("\n\n") : String(item.content || "");

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="flex h-full flex-col gap-1.5">
      <Card className="flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="accent">
            {Icon ? <Icon size={12} /> : null}
            {meta?.label || item.platform}
          </Badge>
          <div className="flex items-center">
            <IconButton
              label={copied ? "Copied" : "Copy the post"}
              size={32}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(plain);
                  setCopied(true);
                } catch {
                  toast("Your browser blocked copying. Select the text and copy it.");
                }
              }}
            >
              {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
            </IconButton>
            <IconButton label="Remove" size={32} onClick={onRemove}>
              <TrashSimple size={14} />
            </IconButton>
          </div>
        </div>
        {item.signal?.headline ? (
          <button
            type="button"
            onClick={onOpenSignal}
            className="font-display mt-2.5 text-left text-[16px] leading-snug text-ink decoration-accent-line decoration-2 underline-offset-4 hover:underline"
          >
            {item.signal.headline}
          </button>
        ) : null}
        <div className={cx("mt-3 flex flex-col gap-3 text-[13.5px] leading-relaxed text-ink")}>
          {list.length ? (
            list.map((s) => (
              <div key={s.key}>
                {list.length > 1 ? <p className="meta mb-1">{s.key.replace(/_/g, " ").toLowerCase()}</p> : null}
                <p className="whitespace-pre-wrap">{s.value}</p>
              </div>
            ))
          ) : (
            <p className="whitespace-pre-wrap">{plain}</p>
          )}
        </div>
      </Card>
      <ItemMeta item={item} boards={boards} onMove={onMove} />
    </div>
  );
}
