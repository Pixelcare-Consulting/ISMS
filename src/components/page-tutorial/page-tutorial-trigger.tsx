"use client";

import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";

import { PageTutorialDialog } from "@/components/page-tutorial/page-tutorial-dialog";
import type { PageTutorialContent } from "@/components/page-tutorial/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const DISMISS_STORAGE_PREFIX = "isms:page-tutorial:dismissed:";

function dismissStorageKey(id: string) {
  return `${DISMISS_STORAGE_PREFIX}${id}`;
}

interface PageTutorialTriggerProps {
  content: PageTutorialContent;
  className?: string;
}

export function PageTutorialTrigger({ content, className }: PageTutorialTriggerProps) {
  // Start closed to avoid SSR/hydration flash; auto-open after mount if not dismissed.
  const [open, setOpen] = useState(false);

  // Deliberately an effect: whether this tutorial was dismissed lives in localStorage,
  // which does not exist while rendering on the server and cannot be read during render
  // without risking a hydration mismatch. Opening after mount is the point, not an
  // oversight, so the lint rule against setting state from an effect does not apply.
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const key = dismissStorageKey(content.id);
      if (window.localStorage.getItem(key)) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
    } catch {
      // localStorage may be unavailable (private mode / blocked) — skip auto-open.
    }
  }, [content.id]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      try {
        window.localStorage.setItem(dismissStorageKey(content.id), "1");
      } catch {
        // Ignore storage write failures; user can still reopen via ?.
      }
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(
          "size-7 shrink-0 rounded-full border-border/80 text-muted-foreground shadow-none",
          "hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
          className,
        )}
        aria-label={content.triggerLabel ?? `Open ${content.dialogTitle} tutorial`}
        onClick={() => setOpen(true)}
      >
        <CircleHelp className="size-4" />
      </Button>
      <PageTutorialDialog content={content} open={open} onOpenChange={handleOpenChange} />
    </>
  );
}
