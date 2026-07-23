"use client";

import { cn } from "@/utils/cn";
import { WEEKDAY_SHORT } from "@/features/orders/utils/order-window";

interface WeekdayPickerProps {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
  className?: string;
}

/** Toggle row for selecting weekdays (0=Sun … 6=Sat). */
export function WeekdayPicker({ value, onChange, disabled, className }: WeekdayPickerProps) {
  const selected = new Set(value);

  function toggle(day: number) {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange([...next].sort((a, b) => a - b));
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {WEEKDAY_SHORT.map((label, day) => {
        const active = selected.has(day);
        return (
          <button
            key={day}
            type="button"
            disabled={disabled}
            onClick={() => toggle(day)}
            aria-pressed={active}
            className={cn(
              "min-w-11 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
