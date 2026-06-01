"use client";

import { WhatsNewDialog } from "@/components/whats-new-dialog";
import { getVersionWithDateLabel } from "@/lib/shared/version";
import { cn } from "@/utils/cn";

interface AppVersionProps {
  interactive?: boolean;
  className?: string;
}

const interactiveTriggerClassName =
  "cursor-pointer underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function AppVersion({
  interactive = true,
  className,
}: AppVersionProps) {
  const versionLabel = getVersionWithDateLabel();

  if (!interactive) {
    return (
      <p
        className={cn(
          "text-center text-xs text-muted-foreground",
          className,
        )}
      >
        {versionLabel}
      </p>
    );
  }

  return (
    <WhatsNewDialog
      trigger={
        <button
          type="button"
          className={cn(
            "text-center text-xs text-muted-foreground",
            interactiveTriggerClassName,
            className,
          )}
          aria-label="View release notes"
          title="View release notes"
        >
          {versionLabel}
        </button>
      }
    />
  );
}
