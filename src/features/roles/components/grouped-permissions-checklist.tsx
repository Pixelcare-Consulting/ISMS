"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { PermissionModuleGroup } from "@/features/roles/lib/group-permissions-by-module";
import { cn } from "@/utils/cn";

interface GroupedPermissionsChecklistProps {
  groups: PermissionModuleGroup[];
  assignedSlugs: ReadonlySet<string>;
  disabled?: boolean;
  pending?: boolean;
  /** When true, checkboxes call onToggle; when false, use draft onToggleSlug. */
  mode: "live" | "draft";
  onToggle?: (input: {
    permissionSlug: string;
    permissionName: string;
    enabled: boolean;
  }) => void;
  onToggleSlug?: (slug: string, enabled: boolean) => void;
  onModuleSelectAll?: (group: PermissionModuleGroup, enable: boolean) => void;
  className?: string;
}

export function GroupedPermissionsChecklist({
  groups,
  assignedSlugs,
  disabled = false,
  pending = false,
  mode,
  onToggle,
  onToggleSlug,
  onModuleSelectAll,
  className,
}: GroupedPermissionsChecklistProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {groups.map((group) => {
        const assignedCount = group.permissions.filter((p) =>
          assignedSlugs.has(p.slug),
        ).length;
        const allSelected =
          group.permissions.length > 0 &&
          assignedCount === group.permissions.length;
        const noneSelected = assignedCount === 0;

        return (
          <section
            key={group.moduleId}
            className="rounded-lg border border-border/70 bg-card/40"
          >
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-3 py-2.5">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-foreground">
                  {group.moduleName}
                </h3>
                {group.description ? (
                  <p className="text-xs text-muted-foreground">
                    {group.description}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                  {assignedCount} of {group.permissions.length} selected
                </p>
              </div>
              {onModuleSelectAll && group.permissions.length > 0 ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={disabled || pending || allSelected}
                    onClick={() => onModuleSelectAll(group, true)}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={disabled || pending || noneSelected}
                    onClick={() => onModuleSelectAll(group, false)}
                  >
                    Clear
                  </Button>
                </div>
              ) : null}
            </div>
            <ul className="divide-y divide-border/50">
              {group.permissions.map((permission) => {
                const checked = assignedSlugs.has(permission.slug);
                return (
                  <li
                    key={permission.id}
                    className="flex items-start gap-3 px-3 py-2.5"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled || pending}
                      className={cn("mt-0.5", pending && "opacity-50")}
                      aria-label={`Toggle ${permission.label}`}
                      onCheckedChange={(next) => {
                        const enabled = next === true;
                        if (enabled === checked) return;
                        if (mode === "live") {
                          onToggle?.({
                            permissionSlug: permission.slug,
                            permissionName: permission.label,
                            enabled,
                          });
                          return;
                        }
                        onToggleSlug?.(permission.slug, enabled);
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm leading-snug text-foreground">
                        {permission.label}
                      </p>
                      <p
                        className="truncate text-[11px] text-muted-foreground"
                        title={permission.slug}
                      >
                        {permission.slug}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
