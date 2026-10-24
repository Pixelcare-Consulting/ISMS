"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";

import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteRoleAction, toggleRolePermissionAction } from "@/features/roles/actions/role.actions";
import {
  filterTenantVisibleRoles,
  isProviderOnlyRole,
} from "@/features/roles/constants/role.constants";
import { CreateRoleDialog } from "@/features/roles/components/create-role-dialog";
import { EditRoleDialog } from "@/features/roles/components/edit-role-dialog";
import { RoleUserCountBadge } from "@/features/roles/components/role-user-count-badge";
import { PermissionChangeDialog } from "@/features/roles/components/permission-change-dialog";
import {
  showPermissionChangeError,
  showPermissionChangeToast,
} from "@/features/roles/components/permission-change-toast";
import {
  PermissionToggle,
  usePermissionChangeDialog,
} from "@/features/roles/components/permission-toggle";
import type { RolesPermissionsMatrix } from "@/features/roles/types/role.types";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { matchesTableSearch } from "@/utils/match-table-search";

type RoleRow = RolesPermissionsMatrix["roles"][number];
const roleColumn = createColumnHelper<DataTableFeatures, RoleRow>();

interface RolesPermissionsTableProps {
  matrix: RolesPermissionsMatrix;
  isPlatformOperator?: boolean;
  canManageSystemRoleAccess?: boolean;
  toolbarActions?: ReactNode;
}

const stickyIndexClassName =
  "sticky left-0 z-10 w-12 min-w-12 border-r border-border/60 bg-card text-center";
const stickyIndexHeadClassName =
  "sticky left-0 z-30 w-12 min-w-12 border-r border-border/60 bg-muted text-center";
const stickyRoleClassName =
  "sticky left-12 z-10 min-w-[220px] border-r border-border/60 bg-card shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]";
const stickyRoleHeadClassName =
  "sticky left-12 z-30 min-w-[220px] border-r border-border/60 bg-muted shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]";

export function RolesPermissionsTable({
  matrix,
  isPlatformOperator = false,
  canManageSystemRoleAccess = false,
  toolbarActions,
}: RolesPermissionsTableProps) {
  const addRoleAction = toolbarActions ?? <CreateRoleDialog />;
  const router = useRouter();
  const roles = filterTenantVisibleRoles(matrix.roles);
  const { permissions } = matrix;
  const [query, setQuery] = useState("");
  const [editingRole, setEditingRole] = useState<(typeof roles)[number] | null>(
    null,
  );
  const [deletingRole, setDeletingRole] = useState<(typeof roles)[number] | null>(
    null,
  );
  const [deletePending, startDeleteTransition] = useTransition();

  const filteredRoles = useMemo(
    () =>
      roles.filter((role) =>
        matchesTableSearch(query, [role.name, role.slug, role.description]),
      ),
    [query, roles],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        roles.map((role) => role.name),
        roles.map((role) => role.slug),
        roles.map((role) => role.description),
      ),
    [roles],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const {
    pendingChange,
    isPending,
    openChangeDialog,
    closeChangeDialog,
    confirmChange,
  } = usePermissionChangeDialog(
    (change) =>
      showPermissionChangeToast({
        roleName: change.roleName,
        permissionName: change.permissionName,
        enabled: change.enabled,
      }),
    showPermissionChangeError,
    toggleRolePermissionAction,
  );

  function handleDeleteConfirm() {
    if (!deletingRole) {
      return;
    }

    startDeleteTransition(async () => {
      const result = await deleteRoleAction(deletingRole.id);
      if (result.error) {
        toast.error("Could not delete role", { description: result.error });
        return;
      }

      toast.success("Role deleted");
      setDeletingRole(null);
      router.refresh();
    });
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<RoleRow>[] = [
      roleColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: {
          className: `${stickyIndexClassName} tabular-nums text-muted-foreground`,
          headClassName: stickyIndexHeadClassName,
        },
      }),
      roleColumn.display({
        id: "role",
        header: "Role",
        enableSorting: false,
        cell: ({ row }) => {
          const role = row.original;
          return (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{role.name}</p>
                <RoleUserCountBadge roleName={role.name} userCount={role.userCount} />
              </div>
              <p className="text-xs text-muted-foreground">{role.slug}</p>
              {role.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>
              ) : null}
              {role.isSystem ? (
                <span className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  System
                </span>
              ) : null}
            </div>
          );
        },
        meta: {
          className: stickyRoleClassName,
          headClassName: stickyRoleHeadClassName,
          wrap: true,
        },
      }),
    ];

    for (const permission of permissions) {
      cols.push(
        roleColumn.display({
          id: permission.id,
          header: permission.name,
          enableSorting: false,
          cell: ({ row }) => {
            const role = row.original;
            const permissionsLocked =
              isProviderOnlyRole(role.slug) ||
              (role.isSystem && !canManageSystemRoleAccess);
            const assigned = new Set(role.permissionSlugs);
            return (
              <div className="flex justify-center">
                <PermissionToggle
                  roleId={role.id}
                  roleName={role.name}
                  permissionSlug={permission.slug}
                  permissionName={permission.name}
                  checked={assigned.has(permission.slug)}
                  disabled={permissionsLocked}
                  pending={isPending}
                  onToggleRequest={openChangeDialog}
                />
              </div>
            );
          },
          meta: { className: "min-w-30 text-center", headClassName: "min-w-30 text-center normal-case" },
        }),
      );
    }

    cols.push(
      roleColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => {
          const role = row.original;
          const metaLocked =
            isProviderOnlyRole(role.slug) || (role.isSystem && !isPlatformOperator);
          return (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={metaLocked}
                title={metaLocked ? "This role cannot be renamed" : "Edit role"}
                onClick={() => setEditingRole(role)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                disabled={metaLocked || role.userCount > 0 || role.isSystem}
                title={
                  metaLocked || role.isSystem
                    ? "System roles cannot be deleted"
                    : role.userCount > 0
                      ? "Remove users from this role first"
                      : "Delete role"
                }
                onClick={() => setDeletingRole(role)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        },
        meta: { align: "end", headClassName: "min-w-25 text-right normal-case" },
      }),
    );

    return cols;
  }, [canManageSystemRoleAccess, isPending, isPlatformOperator, openChangeDialog, permissions]);

  return (
    <>
      <DataTable
        data={filteredRoles}
        columns={columns}
        getRowId={(row) => row.id}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectAllLabel="Select all roles"
        getSelectionLabel={(row) => `Select role ${row.name}`}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search by role name, slug, or description…",
          suggestions,
        }}
        toolbarActions={addRoleAction}
        empty={filteredRoles.length === 0}
        emptyMessage={
          roles.length === 0
            ? canManageSystemRoleAccess
              ? "No roles configured yet."
              : "No custom roles yet. Use Add role to create one, or assign built-in roles from Settings → Users."
            : "No roles match your search."
        }
      />
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

      {editingRole ? (
        <EditRoleDialog
          key={editingRole.id}
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditingRole(null);
            }
          }}
          role={editingRole}
        />
      ) : null}

      {deletingRole ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDeletingRole(null);
            }
          }}
          title="Delete role"
          description={`Delete ${deletingRole.name}? This action cannot be undone.`}
          pending={deletePending}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </>
  );
}
