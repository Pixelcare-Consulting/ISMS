"use client";

import { Button } from "@/components/ui/button";
import {
  usePersistedBoolean,
  type PersistedBooleanSetter,
} from "@/hooks/use-persisted-boolean";
import { cn } from "@/utils/cn";

/** Shared by deliveries, transfers, and pull-outs. Absent or false stays on the table. */
export const LOGISTICS_LIST_PROGRESS_STORAGE_KEY = "isms.logistics.list-progress";

const VIEW_OPTIONS = [
  { id: "table", label: "Table", progress: false },
  { id: "progress", label: "Progress", progress: true },
] as const;

export function useLogisticsListProgressView(): [boolean, PersistedBooleanSetter] {
  return usePersistedBoolean(LOGISTICS_LIST_PROGRESS_STORAGE_KEY, false);
}

/** Table or Progress. One preference for every logistics list. */
export function LogisticsListViewSwitch() {
  const [progress, setProgress] = useLogisticsListProgressView();

  return (
    <div
      className="inline-flex rounded-lg border border-border/80 bg-muted/50 p-0.5"
      role="group"
      aria-label="List view"
    >
      {VIEW_OPTIONS.map((option) => {
        const active = progress === option.progress;
        return (
          <Button
            key={option.id}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-8 rounded-md px-3 text-xs sm:text-sm",
              !active && "text-muted-foreground",
            )}
            aria-pressed={active}
            onClick={() => setProgress(option.progress)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
