"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface LoadingFeedItem {
  atSecond: number;
  label: string;
  hint?: string;
}

interface LoadingModalProps {
  open: boolean;
  title?: string;
  description?: string;
  feedItems?: LoadingFeedItem[];
}

export function LoadingModal({
  open,
  title = "Please wait",
  description = "Processing your request...",
  feedItems = [],
}: LoadingModalProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!open) {
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    setElapsedSeconds(0);
    const interval = setInterval(() => {
      const nextElapsed = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(nextElapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [open]);

  const currentFeedIndex = useMemo(() => {
    if (feedItems.length === 0) return -1;
    let index = 0;
    for (let i = 0; i < feedItems.length; i += 1) {
      if (elapsedSeconds >= feedItems[i].atSecond) index = i;
    }
    return index;
  }, [elapsedSeconds, feedItems]);

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Running live checks...</span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">{elapsedSeconds}s elapsed</span>
          </div>

          {feedItems.length > 0 ? (
            <div className="space-y-2 rounded-md border px-3 py-3">
              {feedItems.map((item, index) => {
                const isDone = index < currentFeedIndex;
                const isCurrent = index === currentFeedIndex;
                const isPending = index > currentFeedIndex;

                return (
                  <div key={`${item.atSecond}-${item.label}`} className="space-y-0.5">
                    <div className="inline-flex items-center gap-2 text-sm">
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : isCurrent ? (
                        <Loader2 className="size-4 animate-spin text-primary" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                      <span className={isPending ? "text-muted-foreground" : "text-foreground"}>
                        {item.label}
                      </span>
                    </div>
                    {item.hint && isCurrent ? (
                      <p className="pl-6 text-xs text-muted-foreground">{item.hint}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
