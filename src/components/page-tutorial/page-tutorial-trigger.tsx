"use client";

import { useState } from "react";
import { CircleHelp } from "lucide-react";

import { PageTutorialDialog } from "@/components/page-tutorial/page-tutorial-dialog";
import type { PageTutorialContent } from "@/components/page-tutorial/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface PageTutorialTriggerProps {
  content: PageTutorialContent;
  className?: string;
}

export function PageTutorialTrigger({ content, className }: PageTutorialTriggerProps) {
  const [open, setOpen] = useState(false);

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
      <PageTutorialDialog content={content} open={open} onOpenChange={setOpen} />
    </>
  );
}
