"use client";

import {
  PIXELCARE_AI_TASKS,
  type PixelcareAiTaskId,
} from "@/features/pixelcare-ai/constants/tasks";
import { cn } from "@/utils/cn";

export function GuidedTaskChips(props: {
  onSelect: (taskId: PixelcareAiTaskId) => void;
  disabled?: boolean;
  pendingId?: string | null;
  className?: string;
  /** Slightly tighter layout for the in-chat empty state. */
  density?: "default" | "compact";
}) {
  const compact = props.density === "compact";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2",
        props.className,
      )}
      aria-label="Guided tasks"
    >
      {PIXELCARE_AI_TASKS.map((task) => {
        const selected = props.pendingId === task.id;
        return (
          <button
            key={task.id}
            type="button"
            disabled={props.disabled}
            title={task.description}
            onClick={() => props.onSelect(task.id)}
            className={cn(
              "rounded-full border bg-background font-medium text-foreground transition",
              "hover:border-primary/40 hover:bg-muted/50",
              "disabled:cursor-not-allowed disabled:opacity-60",
              compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
              selected && "border-primary/50 bg-muted/60",
            )}
          >
            {task.title}
          </button>
        );
      })}
    </div>
  );
}
