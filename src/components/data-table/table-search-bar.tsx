"use client";

import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface TableSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function TableSearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: TableSearchBarProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9"
        aria-label={placeholder}
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

interface TableSearchToolbarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}

export function TableSearchToolbar({
  value,
  onChange,
  placeholder,
  children,
}: TableSearchToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <TableSearchBar
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="sm:max-w-sm"
      />
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}
