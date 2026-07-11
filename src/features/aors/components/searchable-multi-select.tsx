"use client";

import { Check, ChevronsUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";

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
import { cn } from "@/utils/cn";

export type SearchableOption = {
  id: string;
  label: string;
  description?: string;
};

type SearchableMultiSelectProps = {
  label: string;
  options: SearchableOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  hint?: string;
  disabled?: boolean;
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
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selected = useMemo(
    () => options.filter((option) => selectedSet.has(option.id)),
    [options, selectedSet],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        (option.description?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((option) => selectedSet.has(option.id));

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
    <div className="space-y-1.5">
      <Label>{label}</Label>

      {options.length === 0 ? (
        <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
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
              disabled={disabled}
              className={cn(
                "h-9 w-full justify-between border-input bg-background font-normal shadow-sm",
                "hover:border-primary/40 hover:bg-background hover:text-foreground",
                "disabled:bg-muted/60 disabled:opacity-50",
              )}
            >
              <span
                className={cn(
                  "truncate text-left",
                  selected.length === 0 && "text-muted-foreground",
                )}
              >
                {selected.length === 0
                  ? placeholder
                  : `${selected.length} selected`}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
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
                  {filtered.map((option) => {
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
                        <span className="min-w-0 flex-1 truncate">
                          <span className="block truncate">{option.label}</span>
                          {option.description ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {selected.length > 0 ? (
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
