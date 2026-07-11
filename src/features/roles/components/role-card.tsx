"use client";

import { Pencil, Trash2 } from "lucide-react";

import { RoleUserCountBadge } from "@/features/roles/components/role-user-count-badge";
import type { RolePermissionRow } from "@/features/roles/types/role.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface RoleCardProps {
  role: RolePermissionRow;
  permissionSummary: string;
  isProtected: boolean;
  onOpenPermissions: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function RoleCard({
  role,
  permissionSummary,
  isProtected,
  onOpenPermissions,
  onEdit,
  onDelete,
}: RoleCardProps) {
  const canDelete = !isProtected && !role.isSystem && role.userCount === 0;

  return (
    <article
      className={cn(
        "group flex flex-col rounded-xl border border-border/70 bg-card p-4 shadow-sm transition-colors",
        "hover:border-border hover:bg-accent/20",
      )}
    >
      <button
        type="button"
        className="flex flex-1 flex-col gap-2 text-left"
        onClick={onOpenPermissions}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {role.name}
          </h2>
          <RoleUserCountBadge roleName={role.name} userCount={role.userCount} />
          {role.isSystem ? (
            <Badge
              variant="secondary"
              className="h-5 rounded-md px-1.5 text-[10px] font-medium uppercase tracking-wide"
            >
              System
            </Badge>
          ) : null}
        </div>
        {role.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {role.description}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground/80">
            No description
          </p>
        )}
        <p className="mt-auto pt-2 text-xs tabular-nums text-muted-foreground">
          {permissionSummary}
        </p>
      </button>

      <div className="mt-3 flex items-center justify-end gap-1 border-t border-border/50 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={onOpenPermissions}
        >
          Access
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={isProtected}
          title={isProtected ? "This role cannot be edited" : "Edit role"}
          onClick={onEdit}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          disabled={!canDelete}
          title={
            isProtected
              ? "This role cannot be deleted"
              : role.isSystem
                ? "System roles cannot be deleted"
                : role.userCount > 0
                  ? "Remove users from this role first"
                  : "Delete role"
          }
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </article>
  );
}
