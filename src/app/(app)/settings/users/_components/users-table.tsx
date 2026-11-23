"use client";

import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";

import { Ban, CircleCheck, LogOut } from "lucide-react";
import { toast } from "sonner";

import {
  deleteUserAction,
  disableUserAction,
  enableUserAction,
  resetUserSessionAction,
} from "@/features/users/actions/user.actions";
import {
  disableAccountDeniedReason,
  resetSessionConfirmDescription,
  resetSessionDeniedReason,
} from "@/features/users/lib/user-account-guards";
import { Button } from "@/components/ui/button";
import type { UserRoleOption } from "@/app/(app)/settings/users/_components/user-role-picker";
import {
  filterTenantVisibleRoles,
  isProviderOnlyRole,
  userHasProviderOnlyRole,
} from "@/features/roles/constants/role.constants";
import { CreateUserDialog } from "@/app/(app)/settings/users/_components/create-user-dialog";
import { EditUserDialog } from "@/app/(app)/settings/users/_components/edit-user-dialog";
import {
  DeleteConfirmDialog,
  TableRowActions,
  TableSelectionBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/utils/get-initials";
import { matchesTableSearch } from "@/utils/match-table-search";

const userColumn = createColumnHelper<DataTableFeatures, UserRow>();

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
  disabledAt?: Date | string | null;
}

interface UsersTableProps {
  users: UserRow[];
  roles: UserRoleOption[];
  departments: DepartmentOption[];
  hideSystemRoles: boolean;
  currentUserId: string;
  toolbarActions?: ReactNode;
}

function isProtectedUser(user: UserRow, currentUserId: string): boolean {
  return user.id === currentUserId || userHasProviderOnlyRole(user.userRoles);
}

function roleNames(user: UserRow) {
  return user.userRoles.map((userRole) => userRole.role.name);
}

function displayName(user: UserRow) {
  return user.name ?? user.email;
}

export function UsersTable({
  users,
  roles,
  departments,
  hideSystemRoles,
  currentUserId,
  toolbarActions,
}: UsersTableProps) {
  const router = useRouter();
  /**
   * Local copy of the server rows so edits can show immediately, re-seeded whenever the
   * server sends a new list. Adjusted during render rather than in an effect: an effect
   * would paint the stale list for a frame first, and React re-runs this render before
   * committing anything to the DOM.
   */
  const [rows, setRows] = useState(users);
  const [seeded, setSeeded] = useState(users);
  if (seeded !== users) {
    setSeeded(users);
    setRows(users);
  }
  const [query, setQuery] = useState("");
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);
  const [resettingUser, setResettingUser] = useState<UserRow | null>(null);
  const [accessUser, setAccessUser] = useState<UserRow | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleRows = rows;
  const visibleRoles = useMemo(() => filterTenantVisibleRoles(roles), [roles]);

  const addUserAction =
    toolbarActions ?? (
      <CreateUserDialog
        roles={visibleRoles}
        departments={departments}
        hideSystemRoles={hideSystemRoles}
        onCreated={(user) => {
          setRows((currentRows) => [user, ...currentRows]);
          router.refresh();
        }}
      />
    );

  const filteredUsers = useMemo(
    () =>
      visibleRows.filter((user) =>
        matchesTableSearch(query, [
          user.name,
          user.email,
          user.department?.name,
          ...roleNames(user),
          user.disabledAt ? "Disabled" : "",
        ]),
      ),
    [query, visibleRows],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        visibleRows.map((user) => user.name),
        visibleRows.map((user) => user.email),
        visibleRows.map((user) => user.department?.name),
        visibleRows.flatMap((user) => roleNames(user)),
      ),
    [visibleRows],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = filteredUsers.filter((user) => rowSelection[user.id]).length;
  const sort = useClientTableSort(filteredUsers, {
    name: (user) => user.name,
    email: (user) => user.email,
    roles: (user) => roleNames(user).join(", "),
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

  function handleResetSessionConfirm() {
    if (!resettingUser) {
      return;
    }

    startTransition(async () => {
      const result = await resetUserSessionAction(resettingUser.id);
      if (result.error) {
        toast.error("Could not reset session", { description: result.error });
        return;
      }

      toast.success("Session reset", {
        description: `${resettingUser.name ?? resettingUser.email} can sign in again.`,
      });
      setResettingUser(null);
      router.refresh();
    });
  }

  function handleAccessConfirm() {
    if (!accessUser) {
      return;
    }

    const enabling = Boolean(accessUser.disabledAt);
    startTransition(async () => {
      const result = enabling
        ? await enableUserAction(accessUser.id)
        : await disableUserAction(accessUser.id);
      if (result.error) {
        toast.error(enabling ? "Could not enable account" : "Could not disable account", {
          description: result.error,
        });
        return;
      }

      toast.success(enabling ? "Account enabled" : "Account disabled");
      setRows((currentRows) =>
        currentRows.map((user) =>
          user.id === accessUser.id
            ? { ...user, disabledAt: enabling ? null : new Date().toISOString() }
            : user,
        ),
      );
      setAccessUser(null);
      router.refresh();
    });
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<UserRow>[] = [
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
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              {row.original.image ? (
                <AvatarImage src={row.original.image} alt={row.original.name ?? row.original.email} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(row.original.name ?? row.original.email)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">{row.original.name ?? "—"}</span>
            {row.original.disabledAt ? (
              <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                Disabled
              </span>
            ) : null}
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
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {roleNames(row.original).length > 0 ? (
              row.original.userRoles.map((userRole) => (
                <span
                  key={userRole.role.slug}
                  className={
                    isProviderOnlyRole(userRole.role.slug)
                      ? "rounded-md bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300"
                      : "rounded-md bg-accent px-2 py-0.5 text-xs font-medium"
                  }
                >
                  {userRole.role.name}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        ),
        meta: { wrap: true },
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
        cell: ({ row }) => {
          const isProtected = isProtectedUser(row.original, currentUserId);
          const resetDenied = resetSessionDeniedReason({
            actorUserId: currentUserId,
            targetUserId: row.original.id,
            targetRoles: row.original.userRoles,
          });
          const isDisabled = Boolean(row.original.disabledAt);
          const disableDenied = isDisabled
            ? null
            : disableAccountDeniedReason({
                actorUserId: currentUserId,
                targetUserId: row.original.id,
                targetRoles: row.original.userRoles,
              });
          return (
            <TableRowActions
              asCell={false}
              onEdit={() => setEditingUser(row.original)}
              onDelete={() => setDeletingUser(row.original)}
              editDisabled={isProtected}
              deleteDisabled={isProtected}
              editTitle={isProtected ? "This user cannot be edited" : "Edit user"}
              deleteTitle={isProtected ? "This user cannot be deleted" : "Delete user"}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={Boolean(resetDenied)}
                title={resetDenied ?? "Reset session"}
                aria-label="Reset session"
                onClick={() => setResettingUser(row.original)}
              >
                <LogOut className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={
                  isDisabled
                    ? "size-8"
                    : "size-8 text-destructive hover:text-destructive"
                }
                disabled={Boolean(disableDenied)}
                title={
                  isDisabled ? "Enable account" : (disableDenied ?? "Disable account")
                }
                aria-label={isDisabled ? "Enable account" : "Disable account"}
                onClick={() => setAccessUser(row.original)}
              >
                {isDisabled ? (
                  <CircleCheck className="size-4" />
                ) : (
                  <Ban className="size-4" />
                )}
              </Button>
            </TableRowActions>
          );
        },
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [currentUserId, indexOffset]);

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
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectAllLabel="Select all users"
        getSelectionLabel={(row) => `Select user ${row.name ?? row.email}`}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search by name, email, role, or department…",
          suggestions,
        }}
        toolbarLeading={
          <TableSelectionBadge count={selectedCount} onClear={() => setRowSelection({})} />
        }
        toolbarActions={addUserAction}
        empty={pageItems.length === 0}
        emptyMessage={
          visibleRows.length === 0 ? "No users yet." : "No users match your search."
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "user",
          onPageChange: setPage,
        }}
      />

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
          roles={visibleRoles}
          departments={departments}
          hideSystemRoles={hideSystemRoles}
          onUpdated={(user) => {
            setRows((currentRows) =>
              currentRows.map((row) => (row.id === user.id ? user : row)),
            );
            router.refresh();
          }}
        />
      ) : null}

      {resettingUser ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setResettingUser(null);
            }
          }}
          title="Reset session"
          description={resetSessionConfirmDescription(
            resettingUser.name ?? resettingUser.email,
          )}
          confirmLabel="Reset session"
          pendingLabel="Resetting…"
          confirmVariant="default"
          pending={pending}
          onConfirm={handleResetSessionConfirm}
        />
      ) : null}

      {accessUser ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setAccessUser(null);
            }
          }}
          title={accessUser.disabledAt ? "Enable account" : "Disable account"}
          description={
            accessUser.disabledAt
              ? `Turn ${displayName(accessUser)}'s account back on so they can sign in again?`
              : `Turn off ${displayName(accessUser)}'s account? They are signed out of every device and cannot sign in until the account is enabled.`
          }
          confirmLabel={accessUser.disabledAt ? "Enable account" : "Disable account"}
          pendingLabel={accessUser.disabledAt ? "Enabling…" : "Disabling…"}
          confirmVariant={accessUser.disabledAt ? "default" : "destructive"}
          pending={pending}
          onConfirm={handleAccessConfirm}
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
