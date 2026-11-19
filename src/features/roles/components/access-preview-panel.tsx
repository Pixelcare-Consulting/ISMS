"use client";

import { Check, X } from "lucide-react";

import { cn } from "@/utils/cn";

export interface AccessPreviewItem {
  id: string;
  /** Primary line. A permission uses the module title; a role uses the role name. */
  name: string;
  /** Supporting line. Set for a permission action, such as Manage. */
  detail?: string;
}

function previewItemLabel(item: AccessPreviewItem): string {
  return item.detail ? `${item.name} — ${item.detail}` : item.name;
}

interface AccessPreviewPanelProps {
  heading: string;
  selectedLabel: string;
  selectedItems: AccessPreviewItem[];
  onRemove: (id: string) => void;
  accessNames: string[];
  emptySelection: string;
  emptyAccess: string;
  note: string;
  caption: string;
  disabled?: boolean;
  className?: string;
}

export function AccessPreviewPanel({
  heading,
  selectedLabel,
  selectedItems,
  onRemove,
  accessNames,
  emptySelection,
  emptyAccess,
  note,
  caption,
  disabled = false,
  className,
}: AccessPreviewPanelProps) {
  return (
    <aside
      aria-label="Access preview"
      className={cn(
        "flex h-full min-h-[280px] min-w-0 flex-col rounded-xl bg-[#F1F6F5] p-4",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
        Access preview
      </p>
      <h3 className="mt-1 text-lg font-semibold text-foreground">{heading}</h3>

      <p className="mt-4 text-xs font-medium text-foreground">{selectedLabel}</p>
      {selectedItems.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptySelection}</p>
      ) : (
        <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto">
          {selectedItems.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[#E2EEEB] bg-white px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {item.name}
                </span>
                {item.detail ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-[#F1F6F5] hover:text-foreground"
                aria-label={`Remove ${previewItemLabel(item)}`}
                disabled={disabled}
                onClick={() => onRemove(item.id)}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="my-4 border-t border-[#D5E3DF]" />

      <p className="text-xs font-medium text-foreground">Combined access</p>
      {accessNames.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyAccess}</p>
      ) : (
        <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {accessNames.map((name) => (
            <li key={name} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">{name}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 rounded-md bg-[#FFF4DE] px-3 py-2 text-sm text-foreground">
        {note}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
    </aside>
  );
}
