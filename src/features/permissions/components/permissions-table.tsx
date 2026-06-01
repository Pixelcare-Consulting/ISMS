"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deletePermissionAction } from "@/features/permissions/actions/permission.actions";
import { CreatePermissionDialog } from "@/features/permissions/components/create-permission-dialog";
import { EditPermissionDialog } from "@/features/permissions/components/edit-permission-dialog";
import type { PermissionRow } from "@/features/permissions/types/permission.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import {
  DataTableEmpty,
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
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

interface PermissionsTableProps {
  permissions: PermissionRow[];
  toolbarActions?: ReactNode;
}

export function PermissionsTable({
  permissions,
  toolbarActions,
}: PermissionsTableProps) {
  const addPermissionAction = toolbarActions ?? <CreatePermissionDialog />;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editingPermission, setEditingPermission] = useState<PermissionRow | null>(
    null,
  );
  const [deletingPermission, setDeletingPermission] =
    useState<PermissionRow | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredPermissions = useMemo(
    () =>
      permissions.filter((permission) =>
        matchesTableSearch(query, [
          permission.name,
          permission.slug,
          permission.description,
          permission.moduleName,
          permission.moduleRoute,
        ]),
      ),
    [permissions, query],
  );

  function handleDeleteConfirm() {
    if (!deletingPermission) {
      return;
    }

    startTransition(async () => {
      const result = await deletePermissionAction(deletingPermission.id);
      if (result.error) {
        toast.error("Could not delete permission", { description: result.error });
        return;
      }

      toast.success("Permission deleted");
      setDeletingPermission(null);
      router.refresh();
    });
  }

  return (
    <>
      <DataTableShell>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search by name, slug, or description…"
        >
          {addPermissionAction}
        </TableSearchToolbar>
        {filteredPermissions.length === 0 ? (
          <DataTableEmpty
            message={
              permissions.length === 0
                ? "No permissions defined yet."
                : "No permissions match your search."
            }
          />
        ) : (
          <DataTableScroll>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-12 text-center text-muted-foreground">
                    #
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Roles</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPermissions.map((permission, index) => {
                  const canDelete =
                    !permission.isProtected && permission.roleCount === 0;

                  return (
                    <TableRow
                      key={permission.id}
                      className={cn(index % 2 === 1 && "bg-table-stripe")}
                    >
                      <TableCell className="text-center tabular-nums text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{permission.name}</span>
                          {permission.isProtected ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Protected
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {permission.isLinked ? (
                          <div>
                            <p className="font-medium">{permission.moduleName}</p>
                            {permission.moduleRoute ? (
                              <p className="text-xs text-muted-foreground">
                                {permission.moduleRoute}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Module not routed yet
                              </p>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Unlinked
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs text-muted-foreground">
                          {permission.slug}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {permission.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {permission.roleCount}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="Edit permission"
                            onClick={() => setEditingPermission(permission)}
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
                              permission.isProtected
                                ? "Protected permissions cannot be deleted"
                                : permission.roleCount > 0
                                  ? "Remove from all roles before deleting"
                                  : "Delete permission"
                            }
                            onClick={() => setDeletingPermission(permission)}
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
          </DataTableScroll>
        )}
      </DataTableShell>

      {editingPermission ? (
        <EditPermissionDialog
          key={editingPermission.id}
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditingPermission(null);
            }
          }}
          permission={editingPermission}
        />
      ) : null}

      {deletingPermission ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDeletingPermission(null);
            }
          }}
          title="Delete permission"
          description={`Delete ${deletingPermission.name} (${deletingPermission.slug})? This removes it from the platform catalog.`}
          pending={pending}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </>
  );
}
