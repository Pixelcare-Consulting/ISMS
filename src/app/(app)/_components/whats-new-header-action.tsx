"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WhatsNewDialog } from "@/components/whats-new-dialog";

export function WhatsNewHeaderAction() {
  return (
    <WhatsNewDialog
      trigger={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-white/20 bg-white/10 text-sidebar-foreground hover:bg-white/15 hover:text-sidebar-foreground"
        >
          <Sparkles className="size-4 shrink-0" />
          <span className="hidden sm:inline">What&apos;s new</span>
        </Button>
      }
    />
  );
}
