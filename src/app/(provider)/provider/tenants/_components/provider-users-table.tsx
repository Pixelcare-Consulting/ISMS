"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { CreateProviderUserDialog } from "@/app/(provider)/provider/tenants/_components/create-provider-user-dialog";
import { EditProviderUserDialog } from "@/app/(provider)/provider/tenants/_components/edit-provider-user-dialog";
import type { ProviderUserRow } from "@/app/(provider)/provider/tenants/_components/create-provider-user-dialog";
import {
  DeleteConfirmDialog,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteProviderCustomerUserAction } from "@/features/provider/actions/provider.actions";
import { userHasProviderOnlyRole } from "@/features/roles/constants/role.constants";
import {
  GlobalDataTable,
  GlobalTableHead,
  useClientTableSort,
} from "@/lib/data-table";
import { matchesTableSearch } from "@/utils/match-table-search";

const COLUMN_COUNT = 6;

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
    </div>
  );

  if (rows.length === 0) {
    return (
      <GlobalDataTable
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search by name, email, role, or department…",
          suggestions,
        }}
        toolbarActions={toolbarActions}
        empty
        emptyMessage={
          orgDisabled
            ? "No users. Restore the organization to add people."
            : "No users yet. Add a user or Tenant Admin to get started."
        }
      >
        <></>
      </GlobalDataTable>
    );
  }

  return (
    <>
      <GlobalDataTable
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
      >
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableIndexHead />
            <GlobalTableHead {...sort.sortProps("name")}>Name</GlobalTableHead>
            <GlobalTableHead {...sort.sortProps("email")}>Email</GlobalTableHead>
            <GlobalTableHead {...sort.sortProps("roles")}>Roles</GlobalTableHead>
            <GlobalTableHead {...sort.sortProps("department")}>
              Department
            </GlobalTableHead>
            <GlobalTableHead className="w-28 text-right">
              Actions
            </GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredUsers.length === 0 ? (
            <TableEmptyRow
              colSpan={COLUMN_COUNT}
              message="No users match your search."
            />
          ) : (
            pageItems.map((user, index) => {
              const isProtected = userHasProviderOnlyRole(user.userRoles);
              const actionsDisabled = orgDisabled || isProtected;

              return (
                <TableRow
                  key={user.id}
                  className={index % 2 === 1 ? "bg-table-stripe" : undefined}
                >
                  <TableIndexCell index={indexOffset + index + 1} />
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{user.name ?? "—"}</span>
                      <Badge variant="secondary" className="w-fit">
                        Active
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.userRoles.length > 0 ? (
                        user.userRoles.map((userRole) => (
                          <span
                            key={userRole.role.slug}
                            className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium"
                          >
                            {userRole.role.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.department?.name ?? "—"}
                  </TableCell>
                  <TableRowActions
                    onEdit={() => setEditingUser(user)}
                    onDelete={() => setDeletingUser(user)}
                    editDisabled={actionsDisabled}
                    deleteDisabled={actionsDisabled}
                    editTitle={
                      orgDisabled
                        ? "Restore the organization to edit users"
                        : isProtected
                          ? "This user cannot be edited"
                          : "Edit user"
                    }
                    deleteTitle={
                      orgDisabled
                        ? "Restore the organization to delete users"
                        : isProtected
                          ? "This user cannot be deleted"
                          : "Delete user"
                    }
                  />
                </TableRow>
              );
            })
          )}
        </TableBody>
      </GlobalDataTable>

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
