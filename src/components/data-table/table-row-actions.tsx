"use client";

import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { cn } from "@/utils/cn";

interface TableRowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
  editTitle?: string;
  deleteTitle?: string;
  /** Extra icon buttons (e.g. planogram link) — rendered before edit/delete. */
  children?: ReactNode;
  className?: string;
  /** When false, renders only the button group (no wrapping `TableCell`). */
  asCell?: boolean;
}

/**
 * Right-aligned ghost icon actions for a table row.
 * Pass `children` for domain-specific extras; edit/delete are optional.
 */
export function TableRowActions({
  onEdit,
  onDelete,
  editDisabled = false,
  deleteDisabled = false,
  editTitle = "Edit",
  deleteTitle = "Delete",
  children,
  className,
  asCell = true,
}: TableRowActionsProps) {
  const group = (
    <div className={cn("flex justify-end gap-1", !asCell && className)}>
      {children}
      {onEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={editDisabled}
          title={editTitle}
          onClick={onEdit}
        >
          <Pencil className="size-4" />
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          disabled={deleteDisabled}
          title={deleteTitle}
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : null}
    </div>
  );

  if (!asCell) return group;

  return <TableCell className={cn("text-right", className)}>{group}</TableCell>;
}
