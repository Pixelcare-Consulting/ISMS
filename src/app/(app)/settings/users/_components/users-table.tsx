"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteUserAction } from "@/features/users/actions/user.actions";
import { userHasProviderOnlyRole } from "@/features/roles/constants/role.constants";
import { CreateUserDialog } from "@/app/(app)/settings/users/_components/create-user-dialog";
import { EditUserDialog } from "@/app/(app)/settings/users/_components/edit-user-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import {
  DataTableEmpty,
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInitials } from "@/utils/get-initials";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

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
  const selection = useTableSelection(filteredUsers.map((user) => user.id));

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
      <DataTableShell>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search by name, email, role, or department…"
        >
          {selection.selectedCount > 0 ? (
            <Button variant="secondary" onClick={selection.clearSelection}>
              {selection.selectedCount} selected
            </Button>
          ) : null}
          {addUserAction}
        </TableSearchToolbar>
        <DataTableEmpty message="No users yet." />
      </DataTableShell>
    );
  }

  return (
    <>
      <DataTableShell>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search by name, email, role, or department…"
        >
          {addUserAction}
        </TableSearchToolbar>
        {filteredUsers.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No users match your search.
          </div>
        ) : (
          <DataTableScroll>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                      onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                      aria-label="Select all users"
                    />
                  </TableHead>
                  <TableHead className="w-12 min-w-12 text-center text-muted-foreground">
                    #
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user, index) => {
                  const isProtected =
                    isProtectedUser(user, currentUserId);

                  return (
                    <TableRow
                      key={user.id}
                      data-state={selection.isRowSelected(user.id) ? "selected" : undefined}
                      className={cn(index % 2 === 1 && "bg-table-stripe")}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selection.isRowSelected(user.id)}
                          onCheckedChange={(checked) => selection.toggleRow(user.id, checked === true)}
                          aria-label={`Select user ${user.name ?? user.email}`}
                        />
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">
                        {index + 1}
                      </TableCell>
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            disabled={isProtected}
                            title={
                              isProtected
                                ? "This user cannot be edited"
                                : "Edit user"
                            }
                            onClick={() => setEditingUser(user)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            disabled={isProtected}
                            title={
                              isProtected
                                ? "This user cannot be deleted"
                                : "Delete user"
                            }
                            onClick={() => setDeletingUser(user)}
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
