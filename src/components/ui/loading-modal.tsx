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
import { cn } from "@/utils/cn";

export interface LoadingFeedItem {
  atSecond: number;
  label: string;
  hint?: string;
}

type LoadingModalVariant = "minimal" | "feed";

interface LoadingModalProps {
  open: boolean;
  title?: string;
  description?: string;
  feedItems?: LoadingFeedItem[];
  /** Defaults to `feed` when feedItems are present, otherwise `minimal`. */
  variant?: LoadingModalVariant;
}

export function LoadingModal({
  open,
  title = "Please wait",
  description = "Processing your request...",
  feedItems = [],
  variant,
}: LoadingModalProps) {
  const resolvedVariant: LoadingModalVariant =
    variant ?? (feedItems.length > 0 ? "feed" : "minimal");

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  /**
   * Restart the count as the modal opens. Done during render rather than in the effect
   * below, which would show the previous run's total for a frame before zeroing it.
   */
  const timing = open && resolvedVariant === "feed";
  const [wasTiming, setWasTiming] = useState(timing);
  if (timing !== wasTiming) {
    setWasTiming(timing);
    setElapsedSeconds(0);
  }

  // The clock is read inside the effect and its interval, never during render.
  useEffect(() => {
    if (!timing) return;

    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [timing]);

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
        className={cn(
          "[&>button]:hidden",
          resolvedVariant === "minimal" ? "max-w-sm gap-0 p-0 sm:rounded-xl" : "max-w-md",
        )}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {resolvedVariant === "minimal" ? (
          <div className="flex flex-col items-center px-8 pb-8 pt-10 text-center">
            <div className="relative mb-6 flex size-14 items-center justify-center">
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-primary/15"
              />
              <span
                aria-hidden
                className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-primary border-r-primary/40"
              />
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
            <DialogHeader className="space-y-2 text-center sm:text-center">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                {title}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </DialogDescription>
            </DialogHeader>
            <div
              aria-hidden
              className="mt-6 h-1 w-full overflow-hidden rounded-full bg-primary/15"
            >
              <div className="h-full w-1/3 animate-[loading-bar_1.35s_ease-in-out_infinite] rounded-full bg-primary" />
            </div>
          </div>
        ) : (
          <>
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
                <span className="font-mono text-xs text-muted-foreground">
                  {elapsedSeconds}s elapsed
                </span>
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
                          <span
                            className={
                              isPending ? "text-muted-foreground" : "text-foreground"
                            }
                          >
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
