"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";

import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deletePermissionAction } from "@/features/permissions/actions/permission.actions";
import { CreatePermissionDialog } from "@/features/permissions/components/create-permission-dialog";
import { EditPermissionDialog } from "@/features/permissions/components/edit-permission-dialog";
import type { PermissionRow } from "@/features/permissions/types/permission.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { matchesTableSearch } from "@/utils/match-table-search";

const permissionColumn = createColumnHelper<DataTableFeatures, PermissionRow>();

interface PermissionsTableProps {
  permissions: PermissionRow[];
  toolbarActions?: ReactNode;
  /** Platform catalog CRUD. Tenant Super Admins browse read-only and assign via Roles. */
  canManageCatalog?: boolean;
}

export function PermissionsTable({
  permissions,
  toolbarActions,
  canManageCatalog = true,
}: PermissionsTableProps) {
  const addPermissionAction =
    toolbarActions ?? (canManageCatalog ? <CreatePermissionDialog /> : null);
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

  const sort = useClientTableSort(filteredPermissions, {
    name: (p) => p.name,
    module: (p) => p.moduleName,
    slug: (p) => p.slug,
    roles: (p) => p.roleCount,
  });

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        permissions.map((p) => p.name),
        permissions.map((p) => p.slug),
        permissions.map((p) => p.description),
        permissions.map((p) => p.moduleName),
        permissions.map((p) => p.moduleRoute),
      ),
    [permissions],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = filteredPermissions.filter(
    (permission) => rowSelection[permission.id],
  ).length;

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

  const columns = useMemo(() => {
    const cols: DataTableColumn<PermissionRow>[] = [
      permissionColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      permissionColumn.display({
        id: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.isProtected ? (
              <Badge variant="secondary" className="text-[10px]">
                Protected
              </Badge>
            ) : null}
          </div>
        ),
      }),
      permissionColumn.display({
        id: "module",
        header: "Module",
        enableSorting: true,
        cell: ({ row }) =>
          row.original.isLinked ? (
            <div>
              <p className="font-medium">{row.original.moduleName}</p>
              <p className="text-xs text-muted-foreground">
                {row.original.moduleRoute ?? "Module not routed yet"}
              </p>
            </div>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Unlinked
            </Badge>
          ),
      }),
      permissionColumn.display({
        id: "slug",
        header: "Slug",
        enableSorting: true,
        cell: ({ row }) => (
          <code className="text-xs text-muted-foreground">{row.original.slug}</code>
        ),
      }),
      permissionColumn.display({
        id: "description",
        header: "Description",
        enableSorting: false,
        cell: ({ row }) => row.original.description ?? "—",
        meta: { className: "max-w-xs truncate text-muted-foreground" },
      }),
      permissionColumn.display({
        id: "roles",
        header: "Roles",
        enableSorting: true,
        cell: ({ row }) => row.original.roleCount,
        meta: { className: "text-center tabular-nums" },
      }),
    ];
    if (canManageCatalog) {
      cols.push(
        permissionColumn.display({
          id: "actions",
          header: "Actions",
          enableSorting: false,
          cell: ({ row }) => {
            const canDelete = !row.original.isProtected && row.original.roleCount === 0;
            return (
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  title="Edit permission"
                  onClick={() => setEditingPermission(row.original)}
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
                    row.original.isProtected
                      ? "Protected permissions cannot be deleted"
                      : row.original.roleCount > 0
                        ? "Remove from all roles before deleting"
                        : "Delete permission"
                  }
                  onClick={() => setDeletingPermission(row.original)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          },
          meta: { align: "end" },
        }),
      );
    }
    return cols;
  }, [canManageCatalog]);

  return (
    <>
      <DataTable
        data={sort.sorted}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort.sortKey,
          sortDir: sort.sortDir,
          onSort: sort.toggleSort,
        }}
        enableRowSelection={canManageCatalog}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectAllLabel="Select all permissions"
        getSelectionLabel={(row) => `Select permission ${row.name}`}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search by name, slug, or description…",
          suggestions,
        }}
        toolbarActions={
          <>
            {canManageCatalog && selectedCount > 0 ? (
              <Badge variant="secondary">{selectedCount} selected</Badge>
            ) : null}
            {addPermissionAction}
          </>
        }
        empty={sort.sorted.length === 0}
        emptyMessage={
          permissions.length === 0
            ? "No permissions defined yet."
            : "No permissions match your search."
        }
      />

      {canManageCatalog && editingPermission ? (
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

      {canManageCatalog && deletingPermission ? (
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
