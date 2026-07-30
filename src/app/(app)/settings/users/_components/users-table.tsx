"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { toast } from "sonner";

import { deleteUserAction } from "@/features/users/actions/user.actions";
import { userHasProviderOnlyRole } from "@/features/roles/constants/role.constants";
import { CreateUserDialog } from "@/app/(app)/settings/users/_components/create-user-dialog";
import { EditUserDialog } from "@/app/(app)/settings/users/_components/edit-user-dialog";
import {
  DeleteConfirmDialog,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
  useTableSelection,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInitials } from "@/utils/get-initials";
import { matchesTableSearch } from "@/utils/match-table-search";

const COLUMN_COUNT = 7;

interface RoleOption {
  slug: string;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  userRoles: { role: { slug: string; name: string } }[];
  department: { id: string; name: string } | null;
}

interface UsersTableProps {
  users: UserRow[];
  roles: RoleOption[];
  departments: DepartmentOption[];
  currentUserId: string;
  toolbarActions?: ReactNode;
}

function isProtectedUser(user: UserRow, currentUserId: string): boolean {
  return user.id === currentUserId || userHasProviderOnlyRole(user.userRoles);
}

export function UsersTable({
  users,
  roles,
  departments,
  currentUserId,
  toolbarActions,
}: UsersTableProps) {
  const router = useRouter();
  const [rows, setRows] = useState(users);
  const [query, setQuery] = useState("");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);
  const [pending, startTransition] = useTransition();

  const addUserAction =
    toolbarActions ?? (
      <CreateUserDialog
        roles={roles}
        departments={departments}
        onCreated={(user) => {
          setRows((currentRows) => [user, ...currentRows]);
          router.refresh();
        }}
      />
    );

  useEffect(() => {
    setRows(users);
  }, [users]);

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
        rows.flatMap((user) => user.userRoles.map((userRole) => userRole.role.name)),
      ),
    [rows],
  );

  const selection = useTableSelection(filteredUsers.map((user) => user.id));
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(filteredUsers, { resetKey: query });

  function handleDeleteConfirm() {
    if (!deletingUser) {
      return;
    }

    startTransition(async () => {
      const result = await deleteUserAction(deletingUser.id);
      if (result.error) {
        toast.error("Could not delete user", { description: result.error });
        return;
      }

      toast.success("User deleted");
      setRows((currentRows) =>
        currentRows.filter((user) => user.id !== deletingUser.id),
      );
      setDeletingUser(null);
      router.refresh();
    });
  }

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
        toolbarLeading={
          <TableSelectionBadge
            count={selection.selectedCount}
            onClear={selection.clearSelection}
          />
        }
        toolbarActions={addUserAction}
        empty
        emptyMessage="No users yet."
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
        toolbarLeading={
          <TableSelectionBadge
            count={selection.selectedCount}
            onClear={selection.clearSelection}
          />
        }
        toolbarActions={addUserAction}
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
                <TableSelectAllCheckbox
                  isAllSelected={selection.isAllSelected}
                  isPartiallySelected={selection.isPartiallySelected}
                  onToggleAll={selection.toggleAll}
                  aria-label="Select all users"
                />
                <TableIndexHead />
                <GlobalTableHead>Name</GlobalTableHead>
                <GlobalTableHead>Email</GlobalTableHead>
                <GlobalTableHead>Roles</GlobalTableHead>
                <GlobalTableHead>Department</GlobalTableHead>
                <GlobalTableHead className="w-28 text-right">Actions</GlobalTableHead>
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
                  const isProtected = isProtectedUser(user, currentUserId);

                  return (
                    <TableRow
                      key={user.id}
                      data-state={
                        selection.isRowSelected(user.id) ? "selected" : undefined
                      }
                      className={index % 2 === 1 ? "bg-table-stripe" : undefined}
                    >
                      <TableRowCheckbox
                        checked={selection.isRowSelected(user.id)}
                        onCheckedChange={(checked) =>
                          selection.toggleRow(user.id, checked)
                        }
                        aria-label={`Select user ${user.name ?? user.email}`}
                      />
                      <TableIndexCell index={indexOffset + index + 1} />
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="size-8">
                            {user.image ? (
                              <AvatarImage
                                src={user.image}
                                alt={user.name ?? user.email}
                              />
                            ) : null}
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {getInitials(user.name ?? user.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.name ?? "—"}</span>
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
                        editDisabled={isProtected}
                        deleteDisabled={isProtected}
                        editTitle={
                          isProtected ? "This user cannot be edited" : "Edit user"
                        }
                        deleteTitle={
                          isProtected
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
        <EditUserDialog
          key={editingUser.id}
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditingUser(null);
            }
          }}
          user={editingUser}
          roles={roles}
          departments={departments}
          onUpdated={(user) => {
            setRows((currentRows) =>
              currentRows.map((row) => (row.id === user.id ? user : row)),
            );
            router.refresh();
          }}
        />
      ) : null}

      {deletingUser ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDeletingUser(null);
            }
          }}
          title="Delete user"
          description={`Remove ${deletingUser.name ?? deletingUser.email} from your organization? This action cannot be undone.`}
          pending={pending}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </>
  );
}
