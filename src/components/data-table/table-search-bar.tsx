"use client";

import { Search, X } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const MAX_SUGGESTIONS = 8;

/** Dedupe, trim, and drop empties from one or more field groups. */
export function uniqueSearchSuggestions(
  ...groups: Array<Array<string | null | undefined>>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    for (const raw of group) {
      const value = raw?.trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

interface TableSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Client-side suggestion labels from loaded row data. */
  suggestions?: string[];
}

export function TableSearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className,
  suggestions,
}: TableSearchBarProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q || !suggestions?.length) return [];
    return suggestions
      .filter((label) => label.toLowerCase().includes(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [suggestions, value]);

  const showList = open && matches.length > 0;

  useEffect(() => {
    if (!showList) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showList]);

  function applySuggestion(label: string) {
    onChange(label);
    setOpen(false);
    setHighlight(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!matches.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((prev) => (prev + 1) % matches.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlight((prev) => (prev <= 0 ? matches.length - 1 : prev - 1));
      return;
    }
    if (event.key === "Enter" && highlight >= 0 && matches[highlight]) {
      event.preventDefault();
      applySuggestion(matches[highlight]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setHighlight(-1);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="pl-9 pr-9"
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-controls={showList ? listId : undefined}
        aria-expanded={showList}
        role="combobox"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 z-10 size-7 -translate-y-1/2 text-muted-foreground"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          aria-label="Clear search"
        >
          <X className="size-4" />
        </Button>
      ) : null}
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.map((label, index) => (
            <li
              key={`${label}-${index}`}
              role="option"
              aria-selected={index === highlight}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                index === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => applySuggestion(label)}
            >
              {label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface TableSearchToolbarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
  suggestions?: string[];
}

export function TableSearchToolbar({
  value,
  onChange,
  placeholder,
  children,
  suggestions,
}: TableSearchToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <TableSearchBar
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        suggestions={suggestions}
        className="sm:max-w-sm"
      />
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}
