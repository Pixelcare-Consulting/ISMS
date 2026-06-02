"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteRoleAction, toggleRolePermissionAction } from "@/features/roles/actions/role.actions";
import { isProviderOnlyRole } from "@/features/roles/constants/role.constants";
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
import {
  DataTableEmpty,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

interface RolesPermissionsTableProps {
  matrix: RolesPermissionsMatrix;
  isPlatformOperator?: boolean;
  toolbarActions?: ReactNode;
}

const stickyHeadCheckboxClassName =
  "sticky left-0 top-0 z-40 w-10 min-w-10 border-r border-border/60 bg-muted text-center";
const stickyHeadIndexClassName =
  "sticky left-10 top-0 z-40 w-12 min-w-12 border-r border-border/60 bg-muted text-center";
const stickyHeadRoleClassName =
  "sticky left-22 top-0 z-30 min-w-[220px] border-r border-border/60 bg-muted shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]";
const stickyHeadDefaultClassName = "sticky top-0 z-20 bg-muted";
const stickyCellCheckboxClassName =
  "sticky left-0 z-10 w-10 min-w-10 border-r border-border/60";
const stickyCellIndexClassName =
  "sticky left-10 z-10 w-12 min-w-12 border-r border-border/60";
const stickyCellRoleClassName =
  "sticky left-22 z-[9] min-w-[220px] border-r border-border/60 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]";

export function RolesPermissionsTable({
  matrix,
  isPlatformOperator = false,
  toolbarActions,
}: RolesPermissionsTableProps) {
  const addRoleAction = toolbarActions ?? <CreateRoleDialog />;
  const router = useRouter();
  const { roles, permissions } = matrix;
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
  const selection = useTableSelection(filteredRoles.map((role) => role.id));

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

  if (roles.length === 0) {
    return (
      <DataTableShell>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search by role name, slug, or description…"
        >
          {selection.selectedCount > 0 ? (
            <Button variant="secondary" size="sm" onClick={selection.clearSelection}>
              {selection.selectedCount} selected
            </Button>
          ) : null}
          {addRoleAction}
        </TableSearchToolbar>
        <DataTableEmpty
          message={
            isPlatformOperator
              ? "No roles configured yet."
              : "No custom roles yet. Use Add role to create one, or assign built-in roles from Settings → Users."
          }
        />
      </DataTableShell>
    );
  }

  return (
    <>
      <DataTableShell>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search by role name, slug, or description…"
        >
          {addRoleAction}
        </TableSearchToolbar>
        {filteredRoles.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No roles match your search.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead
                  className={cn(
                    stickyHeadCheckboxClassName,
                    "text-muted-foreground",
                  )}
                >
                  <Checkbox
                    checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                    aria-label="Select all roles"
                  />
                </TableHead>
                <TableHead
                  className={cn(
                    stickyHeadIndexClassName,
                    "text-muted-foreground",
                  )}
                >
                  #
                </TableHead>
                <TableHead className={stickyHeadRoleClassName}>Role</TableHead>
                {permissions.map((permission) => (
                  <TableHead
                    key={permission.id}
                    className={cn(
                      stickyHeadDefaultClassName,
                      "min-w-[120px] text-center normal-case",
                    )}
                    title={permission.slug}
                  >
                    {permission.name}
                  </TableHead>
                ))}
                <TableHead
                  className={cn(
                    stickyHeadDefaultClassName,
                    "min-w-[100px] text-right normal-case",
                  )}
                >
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoles.map((role, index) => {
                const isProtected =
                  isProviderOnlyRole(role.slug) ||
                  (!isPlatformOperator && role.isSystem);
                const assigned = new Set(role.permissionSlugs);
                const rowBg = index % 2 === 1 ? "bg-table-stripe" : "bg-card";

                return (
                  <TableRow
                    key={role.id}
                    data-state={selection.isRowSelected(role.id) ? "selected" : undefined}
                    className={cn(index % 2 === 1 && "bg-table-stripe")}
                  >
                    <TableCell
                      className={cn(
                        stickyCellCheckboxClassName,
                        rowBg,
                      )}
                    >
                      <Checkbox
                        checked={selection.isRowSelected(role.id)}
                        onCheckedChange={(checked) => selection.toggleRow(role.id, checked === true)}
                        aria-label={`Select role ${role.name}`}
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        stickyCellIndexClassName,
                        "text-center tabular-nums text-muted-foreground",
                        rowBg,
                      )}
                    >
                      {index + 1}
                    </TableCell>
                    <TableCell className={cn(stickyCellRoleClassName, rowBg)}>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{role.name}</p>
                          <RoleUserCountBadge
                            roleName={role.name}
                            userCount={role.userCount}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">{role.slug}</p>
                        {role.description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {role.description}
                          </p>
                        ) : null}
                        {role.isSystem ? (
                          <span className="mt-1 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            System
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    {permissions.map((permission) => (
                      <TableCell key={permission.id} className={cn("text-center", rowBg)}>
                        <div className="flex justify-center">
                          <PermissionToggle
                            roleId={role.id}
                            roleName={role.name}
                            permissionSlug={permission.slug}
                            permissionName={permission.name}
                            checked={assigned.has(permission.slug)}
                            disabled={isProtected}
                            pending={isPending}
                            onToggleRequest={openChangeDialog}
                          />
                        </div>
                      </TableCell>
                    ))}
                    <TableCell className={cn("text-right", rowBg)}>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={isProtected}
                          title={
                            isProtected
                              ? "This role cannot be edited"
                              : "Edit role"
                          }
                          onClick={() => setEditingRole(role)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          disabled={isProtected || role.userCount > 0 || role.isSystem}
                          title={
                            isProtected
                              ? "This role cannot be deleted"
                              : role.isSystem
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
