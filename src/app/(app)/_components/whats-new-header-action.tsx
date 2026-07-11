"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WhatsNewDialog } from "@/components/whats-new-dialog";
import { getVersionWithDateLabel } from "@/lib/shared/version";

export function WhatsNewHeaderAction() {
  const versionLabel = getVersionWithDateLabel();

  return (
    <div className="flex items-center gap-2 sm:gap-2.5">
      <span
        className="text-xs tabular-nums text-muted-foreground"
        title={versionLabel}
        aria-label={`Build version ${versionLabel}`}
      >
        {versionLabel}
      </span>
      <WhatsNewDialog
        trigger={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Sparkles className="size-4 shrink-0" />
            <span className="hidden sm:inline">What&apos;s new</span>
          </Button>
        }
      />
    </div>
  );
}
