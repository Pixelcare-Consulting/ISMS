"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";

import { AiCopilotChat } from "@/features/ai/components/ai-copilot-chat";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function isHelpPath(pathname: string) {
  return pathname === "/help" || pathname.startsWith("/help/");
}

export function AiCopilotLauncher(props: {
  canAssist: boolean;
  configured: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (!props.canAssist || isHelpPath(pathname)) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pr-[max(1rem,env(safe-area-inset-right))] sm:p-6">
      <div className="pointer-events-auto">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              className="size-12 rounded-full shadow-lg"
              aria-label={open ? "Close ISMS Assist" : "Open ISMS Assist"}
              aria-expanded={open}
              title="ISMS Assist"
            >
              {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={12}
            collisionPadding={16}
            className="flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0"
          >
            <div className="border-b px-4 py-3">
              <p className="text-sm font-medium">ISMS Assist</p>
              <p className="text-xs text-muted-foreground">
                Ask in plain language. Answers come from Help and your guides — you
                still confirm any stock or order action.
              </p>
            </div>
            <div className="max-h-[min(28rem,calc(100dvh-10rem))] p-3">
              <AiCopilotChat
                configured={props.configured}
                compact
                className="h-full"
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
