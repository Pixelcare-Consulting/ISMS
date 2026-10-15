"use client";

import Link from "next/link";
import { Menu, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export type ConversationListItem = {
  id: string;
  title: string;
  updatedAt: string;
  pinnedAt: string | null;
};

export function ConversationSidebar(props: {
  items: ConversationListItem[];
  activeId?: string | null;
  onNew: () => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  className?: string;
}) {
  const [openMobile, setOpenMobile] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const pinnedItems = props.items.filter((item) => item.pinnedAt);
  const otherItems = props.items.filter((item) => !item.pinnedAt);
  const pendingTitle =
    props.items.find((item) => item.id === pendingDeleteId)?.title ?? "this conversation";

  function renderRow(item: ConversationListItem) {
    const isPinned = Boolean(item.pinnedAt);
    const isActive = props.activeId === item.id;
    const actionsForced =
      isActive || pendingDeleteId === item.id;

    return (
      <div
        key={item.id}
        className={cn(
          "group relative flex items-center gap-1 rounded-md px-1.5 py-1",
          isActive && "bg-muted",
        )}
      >
        <Link
          href={`/internal/ai?c=${item.id}`}
          className="min-w-0 flex-1 truncate py-1.5 pr-16 pl-1.5 text-sm hover:underline"
          onClick={() => setOpenMobile(false)}
          title={item.title}
        >
          {isPinned ? (
            <span className="mr-1.5 inline-flex align-middle text-muted-foreground" aria-hidden>
              <Pin className="size-3" />
            </span>
          ) : null}
          {item.title}
        </Link>
        <div
          className={cn(
            "absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-muted/95 px-0.5 transition-opacity",
            // Hidden by default; ChatGPT-style reveal on hover / keyboard focus.
            "pointer-events-none opacity-0",
            "group-hover:pointer-events-auto group-hover:opacity-100",
            "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
            // Touch / mobile: keep actions usable on the selected row or while delete is open.
            actionsForced && "pointer-events-auto opacity-100",
          )}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={() => props.onTogglePin(item.id, !isPinned)}
            title={isPinned ? "Unpin conversation" : "Pin conversation"}
            aria-label={isPinned ? "Unpin conversation" : "Pin conversation"}
            aria-pressed={isPinned}
          >
            {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={() => setPendingDeleteId(item.id)}
            title="Delete conversation"
            aria-label="Delete conversation"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-3">
        <p className="text-sm font-semibold">Conversations</p>
        <Button type="button" size="sm" variant="outline" onClick={props.onNew}>
          <Plus className="size-3.5" />
          New
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
        {props.items.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No saved chats yet. Start from a guided task or send a message.
          </p>
        ) : (
          <>
            {pinnedItems.length > 0 ? (
              <div className="space-y-1.5">
                <p className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Pinned
                </p>
                <div className="space-y-1.5">{pinnedItems.map(renderRow)}</div>
              </div>
            ) : null}
            {otherItems.length > 0 ? (
              <div className="space-y-1.5">
                {pinnedItems.length > 0 ? (
                  <p className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Recent
                  </p>
                ) : null}
                <div className="space-y-1.5">{otherItems.map(renderRow)}</div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="shrink-0 border-b p-2 md:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpenMobile((value) => !value)}
        >
          <Menu className="size-3.5" />
          History
        </Button>
      </div>
      {openMobile ? (
        <div className="max-h-48 shrink-0 overflow-hidden border-b md:hidden">{list}</div>
      ) : null}
      <aside
        className={cn(
          "hidden h-full min-h-0 w-64 shrink-0 border-r bg-muted/20 md:flex md:flex-col",
          props.className,
        )}
      >
        {list}
      </aside>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes{" "}
              <span className="font-medium text-foreground">{pendingTitle}</span> from your
              history. You can start a new chat anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!pendingDeleteId) return;
                const id = pendingDeleteId;
                setPendingDeleteId(null);
                props.onDelete(id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
