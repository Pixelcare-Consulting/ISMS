"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

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
import { cn } from "@/utils/cn";

/** cmdk cost is linear in rendered items; past this the search box is faster. */
export const MAX_RENDERED_OPTIONS = 100;

export type SearchableOption = {
  id: string;
  label: string;
  description?: string;
};

type SearchableSelectProps = {
  label?: string;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  allowClear?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
  /** Extra classes for the options popover (e.g. raise z-index above a dialog). */
  popoverClassName?: string;
  /** Which side of the trigger the list opens on. Default is below the field. */
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  onOpenChange?: (open: boolean) => void;
  /**
   * Server-search mode. When set, options are not filtered in the browser.
   * The parent owns debounce, paging, and which rows to pass in.
   */
  onQueryChange?: (query: string) => void;
  /**
   * Trigger label when `value` is not in `options` (a choice from another page).
   */
  selectedOption?: SearchableOption | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
};

export function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No options available.",
  allowClear = false,
  disabled = false,
  name,
  id,
  className,
  popoverClassName,
  side,
  align = "start",
  onOpenChange,
  onQueryChange,
  selectedOption,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const serverSearch = onQueryChange != null;

  const selected = useMemo(() => {
    const fromList = options.find((option) => option.id === value) ?? null;
    if (fromList) return fromList;
    if (selectedOption?.id === value) return selectedOption;
    return null;
  }, [options, selectedOption, value]);

  // Lists here reach five figures (product models). Lowercase once per list
  // rather than once per option per keystroke. Server search skips this.
  const haystack = useMemo(
    () =>
      serverSearch
        ? []
        : options.map((option) => ({
            option,
            text: `${option.label} ${option.description ?? ""}`.toLowerCase(),
          })),
    [options, serverSearch],
  );

  // cmdk registers every rendered item in a store and re-sorts on each change,
  // so rendering all matches locks the browser for seconds on big lists. Render
  // a capped window and let the search box do the narrowing. Server search
  // already paged in the database, so those options are shown as given.
  const { visible, matchCount } = useMemo(() => {
    if (serverSearch) {
      return { visible: options, matchCount: options.length };
    }

    const q = query.trim().toLowerCase();
    const out: SearchableOption[] = [];
    let count = 0;

    // Keep the current selection on screen when the list is unfiltered, so
    // reopening the field always shows what is already chosen. Under a query it
    // is pinned only if it actually matches, and is never listed twice.
    const pinned = !q && selected ? selected : null;
    if (pinned) out.push(pinned);

    for (const entry of haystack) {
      if (q && !entry.text.includes(q)) continue;
      count += 1;
      if (entry.option === pinned) continue;
      if (out.length < MAX_RENDERED_OPTIONS) out.push(entry.option);
    }

    return { visible: out, matchCount: count };
  }, [haystack, options, query, selected, serverSearch]);

  const hiddenCount = matchCount - visible.length;

  function publishQuery(next: string) {
    setQuery(next);
    onQueryChange?.(next);
  }

  function selectOption(next: string) {
    onChange(next);
    setOpen(false);
    publishQuery("");
  }

  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}

      {name ? (
        <input type="hidden" name={name} value={value} />
      ) : null}

      <Popover
        modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) publishQuery("");
          onOpenChange?.(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            title={selected?.label}
            className={cn(
              "h-9 w-full justify-between border-input bg-card font-normal shadow-sm",
              "hover:border-primary/40 hover:bg-card hover:text-foreground",
              "disabled:bg-muted/60 disabled:opacity-50",
            )}
          >
            <span
              className={cn(
                // min-w-0: without it the flex item refuses to shrink and the
                // label spills out of the dialog instead of truncating.
                "min-w-0 truncate text-left",
                !selected && "text-muted-foreground",
              )}
            >
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            // Match the field width so lists stay inside dialogs/modals;
            // long labels wrap instead of expanding past the panel.
            "w-(--radix-popover-trigger-width) max-w-[min(100%,calc(100vw-2rem))] p-0",
            popoverClassName,
          )}
          side={side}
          align={align}
          collisionPadding={12}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={query}
              onValueChange={publishQuery}
            />
            {/* stopPropagation: Dialog RemoveScroll otherwise steals wheel events */}
            <CommandList onWheel={(event) => event.stopPropagation()}>
              <CommandEmpty>
                {options.length === 0 ? emptyMessage : "No matches."}
              </CommandEmpty>
              <CommandGroup>
                {allowClear ? (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => selectOption("")}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        value === "" ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="text-muted-foreground">—</span>
                  </CommandItem>
                ) : null}
                {visible.map((option) => {
                  const isSelected = option.id === value;
                  return (
                    <CommandItem
                      key={option.id}
                      value={option.id}
                      onSelect={() => selectOption(option.id)}
                      className="items-start"
                    >
                      <Check
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block wrap-break-word whitespace-normal">
                          {option.label}
                        </span>
                        {option.description ? (
                          <span className="block wrap-break-word whitespace-normal text-xs text-muted-foreground">
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
                </p>
              ) : null}
              {hasMore && onLoadMore ? (
                <div className="border-t p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    disabled={loadingMore}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onLoadMore()}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
