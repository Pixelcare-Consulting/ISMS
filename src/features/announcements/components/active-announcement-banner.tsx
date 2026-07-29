"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

type ActiveAnnouncement = {
  id: string;
  title: string;
  body: string;
};

interface ActiveAnnouncementBannerProps {
  announcements: ActiveAnnouncement[];
}

const AUTO_SLIDE_MS = 5000;

export function ActiveAnnouncementBanner({
  announcements,
}: ActiveAnnouncementBannerProps) {
  const [index, setIndex] = useState(0);
  const total = announcements.length;
  const showCarousel = total > 1;

  useEffect(() => {
    if (!showCarousel) return;

    const timer = window.setInterval(() => {
      setIndex((currentIndex) => (currentIndex + 1) % total);
    }, AUTO_SLIDE_MS);

    return () => window.clearInterval(timer);
  }, [showCarousel, total, index]);

  if (total === 0) return null;

  const current = announcements[Math.min(index, total - 1)] ?? announcements[0];

  function goPrevious() {
    setIndex((currentIndex) => (currentIndex - 1 + total) % total);
  }

  function goNext() {
    setIndex((currentIndex) => (currentIndex + 1) % total);
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-50"
      role="region"
      aria-roledescription={showCarousel ? "carousel" : undefined}
      aria-label="Active announcements"
    >
      <div className="flex">
        <div
          className="w-1 shrink-0 bg-amber-500/80 dark:bg-amber-400/70"
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 sm:px-4">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100/80 dark:bg-amber-900/50">
            <Megaphone className="size-4 opacity-90" aria-hidden />
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800/80 dark:text-amber-200/80">
                Announcement
              </p>
              {showCarousel ? (
                <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-800/60 dark:text-amber-100">
                  {index + 1} of {total}
                </span>
              ) : null}
            </div>
            <p className="font-medium leading-snug">{current.title}</p>
            <p className="line-clamp-2 text-xs leading-relaxed opacity-90">
              {current.body}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
            {showCarousel ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-amber-900 hover:bg-amber-100/80 dark:text-amber-50 dark:hover:bg-amber-900/50"
                  onClick={goPrevious}
                  aria-label="Previous announcement"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-amber-900 hover:bg-amber-100/80 dark:text-amber-50 dark:hover:bg-amber-900/50"
                  onClick={goNext}
                  aria-label="Next announcement"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : null}
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-7 border-amber-300/80 bg-white/70 text-amber-950 hover:bg-white dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-50 dark:hover:bg-amber-900/60"
            >
              <Link href="/announcements">View</Link>
            </Button>
          </div>
        </div>
      </div>

      {showCarousel ? (
        <div className="flex items-center justify-center gap-1.5 border-t border-amber-200/60 px-3 py-2 dark:border-amber-900/40">
          {announcements.map((announcement, dotIndex) => (
            <button
              key={announcement.id}
              type="button"
              aria-label={`Go to announcement ${dotIndex + 1}`}
              aria-current={dotIndex === index ? "true" : undefined}
              className={cn(
                "h-1.5 rounded-full transition-all",
                dotIndex === index
                  ? "w-4 bg-amber-600 dark:bg-amber-300"
                  : "w-1.5 bg-amber-300/80 hover:bg-amber-400 dark:bg-amber-700 dark:hover:bg-amber-600",
              )}
              onClick={() => setIndex(dotIndex)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
