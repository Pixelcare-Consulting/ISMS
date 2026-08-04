"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableHead } from "@/components/ui/table";
import { cn } from "@/utils/cn";

interface TableSelectAllCheckboxProps {
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  onToggleAll: (checked: boolean) => void;
  "aria-label"?: string;
  className?: string;
}

/** Header checkbox cell wired to `useTableSelection` select-all. */
export function TableSelectAllCheckbox({
  isAllSelected,
  isPartiallySelected,
  onToggleAll,
  "aria-label": ariaLabel = "Select all",
  className,
}: TableSelectAllCheckboxProps) {
  return (
    <TableHead className={cn("w-10", className)}>
      <Checkbox
        checked={
          isAllSelected || (isPartiallySelected ? "indeterminate" : false)
        }
        onCheckedChange={(checked) => onToggleAll(checked === true)}
        aria-label={ariaLabel}
      />
    </TableHead>
  );
}

interface TableRowCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
}

/** Body checkbox cell wired to `useTableSelection` per-row toggle. */
export function TableRowCheckbox({
  checked,
  onCheckedChange,
  "aria-label": ariaLabel = "Select row",
  className,
  disabled = false,
}: TableRowCheckboxProps) {
  return (
    <TableCell className={className}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={ariaLabel}
      />
    </TableCell>
  );
}
