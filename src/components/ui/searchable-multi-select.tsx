"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MAX_RENDERED_OPTIONS,
  type SearchableOption,
} from "@/components/ui/searchable-select";
import { cn } from "@/utils/cn";

export type { SearchableOption };

type SearchableMultiSelectProps = {
  label?: string;
  options: SearchableOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  hint?: string;
  disabled?: boolean;
  /** Same row as the dropdown; selected chips still wrap below. */
  actions?: ReactNode;
  /** Selected name chips under the field. Off for compact dialogs. */
  showSelectedBadges?: boolean;
  /** Extra classes for the options popover (e.g. raise z-index above a dialog). */
  popoverClassName?: string;
  /** Accessible name when the visible label is rendered by a parent field. */
  ariaLabel?: string;
  /**
   * When false, option labels wrap instead of truncating and the popover can grow
   * wider than the trigger (still capped to the viewport). Default true.
   */
  truncateLabels?: boolean;
};

export function SearchableMultiSelect({
  label,
  options,
  selectedIds,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No options available.",
  hint,
  disabled = false,
  actions,
  showSelectedBadges = true,
  popoverClassName,
  ariaLabel,
  truncateLabels = true,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selected = useMemo(
    () => options.filter((option) => selectedSet.has(option.id)),
    [options, selectedSet],
  );

  // Lowercase once per list, not once per option per keystroke.
  const haystack = useMemo(
    () =>
      options.map((option) => ({
        option,
        text: `${option.label} ${option.description ?? ""}`.toLowerCase(),
      })),
    [options],
  );

  // Full match set — "Select all filtered" and the select-all disabled state
  // must consider every match, not just the rendered window.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return haystack
      .filter((entry) => entry.text.includes(q))
      .map((entry) => entry.option);
  }, [haystack, options, query]);

  // Rendering every match locks the browser on big lists (dealers, warehouses),
  // since cmdk registers and re-sorts each item it renders.
  const visible = useMemo(
    () => filtered.slice(0, MAX_RENDERED_OPTIONS),
    [filtered],
  );
  const hiddenCount = filtered.length - visible.length;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((option) => selectedSet.has(option.id));

  const summary =
    selected.length === 0 ? placeholder : `${selected.length} selected`;

  function toggle(id: string) {
    onChange(
      selectedSet.has(id)
        ? selectedIds.filter((selectedId) => selectedId !== id)
        : [...selectedIds, id],
    );
  }

  function selectAllFiltered() {
    onChange([...new Set([...selectedIds, ...filtered.map((option) => option.id)])]);
  }

  function clearSelection() {
    onChange([]);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((selectedId) => selectedId !== id));
  }

  return (
    <div className="min-w-0 space-y-1.5">
      {label ? <Label>{label}</Label> : null}

      <div className={cn(actions && "flex items-center gap-2")}>
        <div className={cn(actions && "min-w-0 flex-1")}>
          {options.length === 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled
              className={cn(
                "h-9 w-full justify-between border-input bg-card font-normal shadow-sm",
                "disabled:bg-muted/60 disabled:opacity-50",
              )}
            >
              <span className="min-w-0 truncate text-left text-muted-foreground">
                {emptyMessage}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </Button>
          ) : (
            <Popover
              modal
              open={open}
              onOpenChange={(next) => {
                setOpen(next);
                if (!next) setQuery("");
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  aria-label={label ?? ariaLabel}
                  disabled={disabled}
                  title={summary}
                  className={cn(
                    "h-9 w-full justify-between border-input bg-card font-normal shadow-sm",
                    "hover:border-primary/40 hover:bg-card hover:text-foreground",
                    "disabled:bg-muted/60 disabled:opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "min-w-0 truncate text-left",
                      selected.length === 0 && "text-muted-foreground",
                    )}
                  >
                    {summary}
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                collisionPadding={12}
                className={cn(
                  truncateLabels
                    ? "w-(--radix-popover-trigger-width) max-w-[min(100%,calc(100vw-2rem))] p-0"
                    : "w-auto min-w-(--radix-popover-trigger-width) max-w-[min(42rem,calc(100vw-2rem))] p-0",
                  popoverClassName,
                )}
              >
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={searchPlaceholder}
                    value={query}
                    onValueChange={setQuery}
                  />
                  <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={filtered.length === 0 || allFilteredSelected}
                      onClick={selectAllFiltered}
                    >
                      Select all{query.trim() ? " filtered" : ""}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={selectedIds.length === 0}
                      onClick={clearSelection}
                    >
                      Clear
                    </Button>
                  </div>
                  {/* stopPropagation: Dialog RemoveScroll otherwise steals wheel events */}
                  <CommandList onWheel={(event) => event.stopPropagation()}>
                    <CommandEmpty>No matches.</CommandEmpty>
                    <CommandGroup>
                      {visible.map((option) => {
                        const isSelected = selectedSet.has(option.id);
                        return (
                          <CommandItem
                            key={option.id}
                            value={option.id}
                            onSelect={() => toggle(option.id)}
                          >
                            <Check
                              className={cn(
                                "size-4 shrink-0",
                                isSelected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span
                              className={cn(
                                "min-w-0 flex-1",
                                truncateLabels ? "truncate" : undefined,
                              )}
                            >
                              <span
                                className={cn(
                                  "block",
                                  truncateLabels
                                    ? "truncate"
                                    : "wrap-break-word whitespace-normal",
                                )}
                              >
                                {option.label}
                              </span>
                              {option.description ? (
                                <span
                                  className={cn(
                                    "block text-xs text-muted-foreground",
                                    truncateLabels
                                      ? "truncate"
                                      : "wrap-break-word whitespace-normal",
                                  )}
                                >
                                  {option.description}
                                </span>
                              ) : null}
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                    {hiddenCount > 0 ? (
                      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                        {hiddenCount.toLocaleString()} more match
                        {hiddenCount === 1 ? "" : "es"} — keep typing to narrow.
                        Select all still applies to every match.
                      </p>
                    ) : null}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {actions}
      </div>

      {showSelectedBadges && selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <Badge
              key={option.id}
              variant="secondary"
              className="max-w-full gap-1 pr-1 font-normal"
            >
              <span className="truncate">{option.label}</span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted"
                onClick={() => remove(option.id)}
                aria-label={`Remove ${option.label}`}
                disabled={disabled}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
