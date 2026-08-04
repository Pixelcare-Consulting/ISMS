"use client";

import { STATUS_COLOR_OPTIONS, type StatusColorKey } from "@/features/reason-status/constants/status-colors";
import { cn } from "@/utils/cn";

interface StatusColorPickerProps {
  value: string | null | undefined;
  disabled?: boolean;
  onChange: (color: StatusColorKey) => void;
}

export function StatusColorPicker({
  value,
  disabled = false,
  onChange,
}: StatusColorPickerProps) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="radiogroup"
      aria-label="Status badge color"
    >
      {STATUS_COLOR_OPTIONS.map((option) => {
        const selected = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            disabled={disabled}
            className={cn(
              "size-7 rounded-full border-2 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              option.swatchClassName,
              selected
                ? "border-foreground shadow-sm ring-2 ring-ring/40"
                : "border-transparent opacity-80 hover:opacity-100",
              disabled && "cursor-not-allowed opacity-50",
            )}
            onClick={() => onChange(option.key)}
          />
        );
      })}
    </div>
  );
}
