"use client";

import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  TABLE_PAGE_SIZE_OPTIONS,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TablePageSizeSelectProps {
  value: number;
  onChange: (limit: TablePageSize) => void;
  /** Accessible label for the control. */
  "aria-label"?: string;
}

/**
 * Rows-per-page dropdown shown before the table search bar.
 * Used by Orders (and other tables that opt in).
 */
export function TablePageSizeSelect({
  value,
  onChange,
  "aria-label": ariaLabel = "Rows per page",
}: TablePageSizeSelectProps) {
  const resolved = parseTablePageSize(value);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Show</span>
      <Select
        value={String(resolved)}
        onValueChange={(next) => onChange(parseTablePageSize(next))}
      >
        <SelectTrigger size="sm" aria-label={ariaLabel} className="w-[5.5rem]">
          <SelectValue placeholder={String(DEFAULT_TABLE_PAGE_SIZE)} />
        </SelectTrigger>
        <SelectContent align="start">
          {TABLE_PAGE_SIZE_OPTIONS.map((size) => (
            <SelectItem key={size} value={String(size)}>
              {size}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
