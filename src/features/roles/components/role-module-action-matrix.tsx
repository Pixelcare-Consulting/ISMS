"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { appModules, parsePermissionSlug } from "@/config/app-modules";
import {
  getPermissionActionLabel,
  matrixActionColumns,
} from "@/config/permission-actions";
import { toggleRolePermissionAction } from "@/features/roles/actions/role.actions";
import {
  filterTenantVisibleRoles,
  isProviderOnlyRole,
} from "@/features/roles/constants/role.constants";
import { PermissionChangeDialog } from "@/features/roles/components/permission-change-dialog";
import {
  showPermissionChangeError,
  showPermissionChangeToast,
} from "@/features/roles/components/permission-change-toast";
import {
  PermissionToggle,
  usePermissionChangeDialog,
} from "@/features/roles/components/permission-toggle";
import { RoleUserCountBadge } from "@/features/roles/components/role-user-count-badge";
import type {
  PermissionRow,
  RolePermissionRow,
  RolesPermissionsMatrix,
} from "@/features/roles/types/role.types";
import { DataTableShell } from "@/components/data-table/data-table-shell";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { matchesTableSearch } from "@/utils/match-table-search";

interface RoleModuleActionMatrixProps {
  matrix: RolesPermissionsMatrix;
  /** Super Admin or platform operator — may toggle grants on system roles. */
  canManageSystemRoleAccess?: boolean;
}

interface ModuleActionCell {
  permission: PermissionRow | null;
}

const moduleColumn = createColumnHelper<DataTableFeatures, ModuleMatrixRow>();

interface ModuleMatrixRow {
  moduleId: string;
  moduleName: string;
  description?: string;
  cells: Record<string, ModuleActionCell>;
}

type BulkPending = {
  roleId: string;
  roleName: string;
  moduleName: string;
  enable: boolean;
  items: PermissionRow[];
} | null;

function buildModuleRows(
  permissions: PermissionRow[],
): {
  rows: ModuleMatrixRow[];
  actionColumns: ReturnType<typeof matrixActionColumns>;
} {
  const bySlug = new Map(permissions.map((p) => [p.slug, p]));
  const presentActions = new Set<string>();

  for (const permission of permissions) {
    const { action } = parsePermissionSlug(permission.slug);
    if (action) {
      presentActions.add(action);
    }
  }

  for (const appModule of appModules) {
    for (const action of appModule.actions) {
      presentActions.add(action.value);
    }
  }

  const actionColumns = matrixActionColumns(presentActions);
  const rows: ModuleMatrixRow[] = [];
  const knownSlugs = new Set<string>();

  for (const appModule of appModules) {
    const cells: Record<string, ModuleActionCell> = {};
    let hasAnyCatalogSlug = false;

    for (const column of actionColumns) {
      const allowlisted = appModule.actions.some((a) => a.value === column.value);
      if (!allowlisted) {
        cells[column.value] = { permission: null };
        continue;
      }
      const slug = `${appModule.slugPrefix}.${column.value}`;
      const permission = bySlug.get(slug) ?? null;
      if (permission) {
        hasAnyCatalogSlug = true;
        knownSlugs.add(permission.slug);
      }
      cells[column.value] = { permission };
    }

    if (!hasAnyCatalogSlug) {
      continue;
    }

    rows.push({
      moduleId: appModule.id,
      moduleName: appModule.name,
      description: appModule.description,
      cells,
    });
  }

  const orphans = permissions.filter((p) => !knownSlugs.has(p.slug));
  if (orphans.length > 0) {
    const cells: Record<string, ModuleActionCell> = {};
    for (const column of actionColumns) {
      cells[column.value] = { permission: null };
    }
    const fallbackKey = actionColumns[0]?.value;
    if (fallbackKey) {
      for (const orphan of orphans) {
        const { action } = parsePermissionSlug(orphan.slug);
        const key =
          action && Object.prototype.hasOwnProperty.call(cells, action)
            ? action
            : fallbackKey;
        if (!cells[key]?.permission) {
          cells[key] = { permission: orphan };
        }
      }
    }
    rows.push({
      moduleId: "other",
      moduleName: "Other",
      description: "Permissions not linked to a registered module",
      cells,
    });
  }

  return { rows, actionColumns };
}

function moduleAssignedCount(
  row: ModuleMatrixRow,
  assigned: ReadonlySet<string>,
): { assigned: number; total: number } {
  let assignedCount = 0;
  let total = 0;
  for (const cell of Object.values(row.cells)) {
    if (!cell.permission) continue;
    total += 1;
    if (assigned.has(cell.permission.slug)) {
      assignedCount += 1;
    }
  }
  return { assigned: assignedCount, total };
}

function catalogPermissionsInRow(row: ModuleMatrixRow): PermissionRow[] {
  const items: PermissionRow[] = [];
  for (const cell of Object.values(row.cells)) {
    if (cell.permission) {
      items.push(cell.permission);
    }
  }
  return items;
}

function ModuleBulkActions({
  counts,
  disabled,
  onSelectAll,
  onClear,
}: {
  counts: { assigned: number; total: number };
  disabled: boolean;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  if (counts.total === 0) return null;
  const allSelected = counts.assigned === counts.total;
  const noneSelected = counts.assigned === 0;

  return (
    <div className="flex shrink-0 gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={disabled || allSelected}
        onClick={onSelectAll}
      >
        Select all
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={disabled || noneSelected}
        onClick={onClear}
      >
        Clear
      </Button>
    </div>
  );
}

export function RoleModuleActionMatrix({
  matrix,
  canManageSystemRoleAccess = false,
}: RoleModuleActionMatrixProps) {
  const router = useRouter();
  const roles = filterTenantVisibleRoles(matrix.roles);
  const { permissions } = matrix;
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? "");
  const [moduleQuery, setModuleQuery] = useState("");
  const [bulkPending, setBulkPending] = useState<BulkPending>(null);
  const [bulkBusy, startBulkTransition] = useTransition();

  const { rows, actionColumns } = useMemo(
    () => buildModuleRows(permissions),
    [permissions],
  );

  const filteredRows = useMemo(() => {
    const trimmed = moduleQuery.trim();
    if (!trimmed) return rows;
    return rows.filter((row) => {
      if (matchesTableSearch(trimmed, [row.moduleName, row.description])) {
        return true;
      }
      return catalogPermissionsInRow(row).some((permission) =>
        matchesTableSearch(trimmed, [permission.name, permission.slug]),
      );
    });
  }, [moduleQuery, rows]);

  const selectedRole: RolePermissionRow | undefined = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? roles[0],
    [roles, selectedRoleId],
  );

  const assigned = useMemo(
    () => new Set(selectedRole?.permissionSlugs ?? []),
    [selectedRole],
  );

  const isProtected =
    !selectedRole ||
    isProviderOnlyRole(selectedRole.slug) ||
    (selectedRole.isSystem && !canManageSystemRoleAccess);

  const {
    pendingChange,
    isPending,
    openChangeDialog,
    closeChangeDialog,
    confirmChange,
  } = usePermissionChangeDialog(
    (change) => {
      showPermissionChangeToast({
        roleName: change.roleName,
        permissionName: change.permissionName,
        enabled: change.enabled,
      });
      router.refresh();
    },
    showPermissionChangeError,
    toggleRolePermissionAction,
  );

  function handleModuleSelectAll(row: ModuleMatrixRow, enable: boolean) {
    if (!selectedRole || isProtected) return;
    const items = catalogPermissionsInRow(row).filter((permission) => {
      const has = assigned.has(permission.slug);
      return enable ? !has : has;
    });
    if (items.length === 0) return;
    setBulkPending({
      roleId: selectedRole.id,
      roleName: selectedRole.name,
      moduleName: row.moduleName,
      enable,
      items,
    });
  }

  function confirmBulk() {
    if (!bulkPending) return;
    const change = bulkPending;

    startBulkTransition(async () => {
      let failed: string | null = null;
      for (const item of change.items) {
        const result = await toggleRolePermissionAction({
          roleId: change.roleId,
          permissionSlug: item.slug,
          enabled: change.enable,
        });
        if (result.error) {
          failed = result.error;
          break;
        }
      }

      if (failed) {
        showPermissionChangeError(failed);
        setBulkPending(null);
        router.refresh();
        return;
      }

      toast.success(change.enable ? "Access granted" : "Access cleared", {
        description: change.enable
          ? `All ${change.moduleName} access added to ${change.roleName}.`
          : `All ${change.moduleName} access removed from ${change.roleName}.`,
      });
      setBulkPending(null);
      router.refresh();
    });
  }

  const busy = isPending || bulkBusy;

  const desktopColumns = useMemo(() => {
    const cols: DataTableColumn<ModuleMatrixRow>[] = [
      moduleColumn.display({
        id: "module",
        header: "Module",
        enableSorting: false,
        cell: ({ row }) => {
          const counts = moduleAssignedCount(row.original, assigned);
          return (
            <div>
              <p className="font-medium">{row.original.moduleName}</p>
              {row.original.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{row.original.description}</p>
              ) : null}
              <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                {counts.assigned} of {counts.total}
              </p>
            </div>
          );
        },
        meta: {
          wrap: true,
          className:
            "sticky left-0 z-10 min-w-48 border-r border-border/60 bg-card shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]",
          headClassName:
            "sticky left-0 z-30 min-w-48 border-r border-border/60 bg-muted shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]",
        },
      }),
    ];

    for (const column of actionColumns) {
      cols.push(
        moduleColumn.display({
          id: column.value,
          header: column.label,
          enableSorting: false,
          cell: ({ row }) => {
            const permission = row.original.cells[column.value]?.permission ?? null;
            if (!permission || !selectedRole) return "—";
            return (
              <div className="flex justify-center">
                <PermissionToggle
                  roleId={selectedRole.id}
                  roleName={selectedRole.name}
                  permissionSlug={permission.slug}
                  permissionName={
                    permission.name ||
                    `${getPermissionActionLabel(column.value)} ${row.original.moduleName}`
                  }
                  checked={assigned.has(permission.slug)}
                  disabled={isProtected}
                  pending={busy}
                  onToggleRequest={openChangeDialog}
                />
              </div>
            );
          },
          meta: {
            className: "min-w-20 text-center",
            headClassName: "min-w-20 text-center normal-case",
          },
        }),
      );
    }

    cols.push(
      moduleColumn.display({
        id: "row",
        header: "Row",
        enableSorting: false,
        cell: ({ row }) => {
          const counts = moduleAssignedCount(row.original, assigned);
          return (
            <div className="flex justify-end">
              <ModuleBulkActions
                counts={counts}
                disabled={isProtected || busy}
                onSelectAll={() => handleModuleSelectAll(row.original, true)}
                onClear={() => handleModuleSelectAll(row.original, false)}
              />
            </div>
          );
        },
        meta: { align: "end", headClassName: "min-w-32 text-right normal-case" },
      }),
    );

    return cols;
  }, [
    actionColumns,
    assigned,
    busy,
    isProtected,
    openChangeDialog,
    selectedRole,
  ]);

  if (roles.length === 0) {
    return (
      <DataTableShell>
        <p className="py-12 text-center text-muted-foreground">
          {canManageSystemRoleAccess
            ? "No roles configured yet."
            : "No custom roles yet. Use Add role on the simple view, or assign built-in roles from Settings → Users."}
        </p>
      </DataTableShell>
    );
  }

  if (!selectedRole) {
    return null;
  }

  return (
    <>
      <DataTableShell>
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 w-full sm:max-w-sm sm:flex-1">
            <SearchableSelect
              label="Role"
              id="matrix-role"
              options={roles.map((role) => ({
                id: role.id,
                label: role.name,
                description: role.slug,
              }))}
              value={selectedRole.id}
              onChange={setSelectedRoleId}
              placeholder="Select a role"
              searchPlaceholder="Search roles…"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <RoleUserCountBadge
              roleName={selectedRole.name}
              userCount={selectedRole.userCount}
            />
            {selectedRole.isSystem ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                System
              </span>
            ) : null}
            {isProtected ? (
              <span className="text-xs">Read-only for this role</span>
            ) : null}
          </div>
        </div>

        <div className="border-b border-border/60 px-4 py-3">
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={moduleQuery}
              onChange={(event) => setModuleQuery(event.target.value)}
              placeholder="Search modules or permissions…"
              className="pl-8"
              aria-label="Search modules"
            />
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No modules match “{moduleQuery.trim()}”.
          </p>
        ) : (
          <>
            {/* Mobile / tablet: stacked module cards */}
            <div className="space-y-3 p-4 lg:hidden">
              {filteredRows.map((row) => {
                const counts = moduleAssignedCount(row, assigned);
                const actionable = actionColumns.flatMap((column) => {
                  const permission = row.cells[column.value]?.permission ?? null;
                  if (!permission) return [];
                  return [{ column, permission }];
                });

                return (
                  <section
                    key={row.moduleId}
                    className="rounded-lg border border-border/70 bg-card/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-3 py-2.5">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium">{row.moduleName}</h3>
                        {row.description ? (
                          <p className="text-xs text-muted-foreground">
                            {row.description}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                          {counts.assigned} of {counts.total}
                        </p>
                      </div>
                      <ModuleBulkActions
                        counts={counts}
                        disabled={isProtected || busy}
                        onSelectAll={() => handleModuleSelectAll(row, true)}
                        onClear={() => handleModuleSelectAll(row, false)}
                      />
                    </div>
                    {actionable.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">
                        No catalog permissions for this module yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/50">
                        {actionable.map(({ column, permission }) => (
                          <li
                            key={permission.id}
                            className="flex items-start gap-3 px-3 py-2.5"
                          >
                            <PermissionToggle
                              roleId={selectedRole.id}
                              roleName={selectedRole.name}
                              permissionSlug={permission.slug}
                              permissionName={
                                permission.name ||
                                `${getPermissionActionLabel(column.value)} ${row.moduleName}`
                              }
                              checked={assigned.has(permission.slug)}
                              disabled={isProtected}
                              pending={busy}
                              className="mt-0.5"
                              onToggleRequest={openChangeDialog}
                            />
                            <div className="min-w-0">
                              <p className="text-sm leading-snug">
                                {getPermissionActionLabel(column.value)}
                              </p>
                              <p
                                className="truncate text-[11px] text-muted-foreground"
                                title={permission.slug}
                              >
                                {permission.slug}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>

            <div className="hidden lg:block">
              <DataTable
                chrome="plain"
                data={filteredRows}
                columns={desktopColumns}
                getRowId={(row) => row.moduleId}
                stickyHeader
                className="max-h-[min(70vh,44rem)]"
              />
            </div>
          </>
        )}
      </DataTableShell>

      {pendingChange ? (
        <PermissionChangeDialog
          open
          onOpenChange={(open) => {
            if (!open) closeChangeDialog();
          }}
          roleName={pendingChange.roleName}
          permissionName={pendingChange.permissionName}
          enabled={pendingChange.enabled}
          pending={isPending}
          onConfirm={confirmChange}
        />
      ) : null}

      {bulkPending ? (
        <PermissionChangeDialog
          open
          onOpenChange={(open) => {
            if (!open && !bulkBusy) setBulkPending(null);
          }}
          roleName={bulkPending.roleName}
          permissionName={`${bulkPending.items.length} ${bulkPending.moduleName} permission(s)`}
          enabled={bulkPending.enable}
          pending={bulkBusy}
          onConfirm={confirmBulk}
        />
      ) : null}
    </>
  );
}
