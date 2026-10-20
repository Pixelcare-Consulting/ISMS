"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";

import { CreateProviderUserDialog } from "@/app/(provider)/provider/tenants/_components/create-provider-user-dialog";
import { EditProviderUserDialog } from "@/app/(provider)/provider/tenants/_components/edit-provider-user-dialog";
import type { ProviderUserRow } from "@/app/(provider)/provider/tenants/_components/create-provider-user-dialog";
import {
  DeleteConfirmDialog,
  TableRowActions,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { deleteProviderCustomerUserAction } from "@/features/provider/actions/provider.actions";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";

const userColumn = createColumnHelper<DataTableFeatures, ProviderUserRow>();
import { matchesTableSearch } from "@/utils/match-table-search";

interface RoleOption {
  slug: string;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface ProviderUsersTableProps {
  tenantId: string;
  users: ProviderUserRow[];
  roles: RoleOption[];
  departments: DepartmentOption[];
  orgDisabled?: boolean;
}

export function ProviderUsersTable({
  tenantId,
  users,
  roles,
  departments,
  orgDisabled = false,
}: ProviderUsersTableProps) {
  const router = useRouter();
  const [rows, setRows] = useState(users);
  const [usersSnapshot, setUsersSnapshot] = useState(users);
  const [query, setQuery] = useState("");
  const [editingUser, setEditingUser] = useState<ProviderUserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<ProviderUserRow | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  if (users !== usersSnapshot) {
    setUsersSnapshot(users);
    setRows(users);
  }

  const filteredUsers = useMemo(
    () =>
      rows.filter((user) =>
        matchesTableSearch(query, [
          user.name,
          user.email,
          user.department?.name,
          ...user.userRoles.map((userRole) => userRole.role.name),
        ]),
      ),
    [query, rows],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((user) => user.name),
        rows.map((user) => user.email),
        rows.map((user) => user.department?.name),
        rows.flatMap((user) =>
          user.userRoles.map((userRole) => userRole.role.name),
        ),
      ),
    [rows],
  );

  const sort = useClientTableSort(filteredUsers, {
    name: (user) => user.name,
    email: (user) => user.email,
    roles: (user) =>
      user.userRoles.map((userRole) => userRole.role.name).join(", "),
    department: (user) => user.department?.name,
  });

  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${query}:${sort.sortKey}:${sort.sortDir}`,
  });

  function handleCreated(user: ProviderUserRow) {
    setRows((current) => [user, ...current]);
    router.refresh();
  }

  function handleDeleteConfirm() {
    if (!deletingUser) return;

    startTransition(async () => {
      const result = await deleteProviderCustomerUserAction({
        tenantId,
        userId: deletingUser.id,
      });

      if (!result.success) {
        toast.error("Could not delete user", { description: result.error });
        return;
      }

      toast.success("User deleted");
      setRows((current) =>
        current.filter((user) => user.id !== deletingUser.id),
      );
      setDeletingUser(null);
      router.refresh();
    });
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<ProviderUserRow>[] = [
      userColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      userColumn.display({
        id: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{row.original.name ?? "—"}</span>
            <Badge variant="secondary" className="w-fit">
              Active
            </Badge>
          </div>
        ),
      }),
      userColumn.display({
        id: "email",
        header: "Email",
        enableSorting: true,
        cell: ({ row }) => row.original.email,
        meta: { className: "text-muted-foreground" },
      }),
      userColumn.display({
        id: "roles",
        header: "Roles",
        enableSorting: true,
        cell: ({ row }) =>
          row.original.userRoles.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {row.original.userRoles.map((userRole) => (
                <span
                  key={userRole.role.slug}
                  className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium"
                >
                  {userRole.role.name}
                </span>
              ))}
            </div>
          ) : (
            "—"
          ),
      }),
      userColumn.display({
        id: "department",
        header: "Department",
        enableSorting: true,
        cell: ({ row }) => row.original.department?.name ?? "—",
        meta: { className: "text-muted-foreground" },
      }),
      userColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <TableRowActions
            asCell={false}
            onEdit={() => setEditingUser(row.original)}
            onDelete={() => setDeletingUser(row.original)}
            editDisabled={orgDisabled}
            deleteDisabled={orgDisabled}
            editTitle={
              orgDisabled ? "Restore the organization to edit users" : "Edit user"
            }
            deleteTitle={
              orgDisabled ? "Restore the organization to delete users" : "Delete user"
            }
          />
        ),
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [indexOffset, orgDisabled]);

  const toolbarActions = (
    <div className="flex flex-wrap items-center gap-2">
      <CreateProviderUserDialog
        tenantId={tenantId}
        roles={roles}
        departments={departments}
        mode="user"
        disabled={orgDisabled}
        onCreated={handleCreated}
      />
      <CreateProviderUserDialog
        tenantId={tenantId}
        roles={roles}
        departments={departments}
        mode="admin"
        disabled={orgDisabled}
        onCreated={handleCreated}
      />
      <CreateProviderUserDialog
        tenantId={tenantId}
        roles={roles}
        departments={departments}
        mode="superadmin"
        disabled={
          orgDisabled || !roles.some((role) => role.slug === "super_admin")
        }
        onCreated={handleCreated}
      />
    </div>
  );

  return (
    <>
      <DataTable
        data={pageItems}
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
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search by name, email, role, or department…",
          suggestions,
        }}
        toolbarActions={toolbarActions}
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "user",
          onPageChange: setPage,
        }}
        empty={pageItems.length === 0}
        emptyMessage={
          rows.length === 0
            ? orgDisabled
              ? "No users. Restore the organization to add people."
              : "No users yet. Add a user or Tenant Admin to get started."
            : "No users match your search."
        }
      />
      {editingUser ? (
        <EditProviderUserDialog
          key={editingUser.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditingUser(null);
          }}
          tenantId={tenantId}
          user={editingUser}
          roles={roles}
          departments={departments}
          onUpdated={(user) => {
            setRows((current) =>
              current.map((row) => (row.id === user.id ? user : row)),
            );
            router.refresh();
          }}
        />
      ) : null}

      {deletingUser ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeletingUser(null);
          }}
          title="Delete user"
          description={`Remove ${deletingUser.name ?? deletingUser.email} from this organization? They will no longer be able to sign in.`}
          pending={pending}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </>
  );
}
