"use client";

import { Textarea } from "@/components/ui/textarea";

/**
 * Controlled line note. The element stays mounted across value updates so typing
 * does not drop focus after each character. The note wraps instead of clipping.
 */
export function WorksheetLineNote({
  value,
  disabled,
  placeholder,
  label,
  title,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  label: string;
  title?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Textarea
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      rows={2}
      className="min-h-16 w-full min-w-0 resize-y overflow-visible whitespace-pre-wrap break-words disabled:bg-muted"
      aria-label={label}
      title={title}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
