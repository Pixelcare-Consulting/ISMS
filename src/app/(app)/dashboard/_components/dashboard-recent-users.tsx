"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TableSearchBar } from "@/components/data-table/table-search-bar";
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

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  userRoles: { role: { name: string } }[];
}

interface DashboardRecentUsersProps {
  users: UserRow[];
}

export function DashboardRecentUsers({ users }: DashboardRecentUsersProps) {
  const [query, setQuery] = useState("");

  const filteredUsers = useMemo(
    () =>
      users.filter((user) =>
        matchesTableSearch(query, [
          user.name,
          user.email,
          ...user.userRoles.map((userRole) => userRole.role.name),
        ]),
      ),
    [query, users],
  );
  const selection = useTableSelection(filteredUsers.map((user) => user.id));

  return (
    <DataTableShell>
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold">Recent team members</h2>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          {selection.selectedCount > 0 ? (
            <span className="text-xs text-muted-foreground">{selection.selectedCount} selected</span>
          ) : null}
          <TableSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search team members…"
            className="sm:w-64"
          />
          <Link
            href="/settings/users"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>
      </div>
      {filteredUsers.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No team members match your search.
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
                    aria-label="Select all recent users"
                  />
                </TableHead>
                <TableHead className="w-12 min-w-12 text-center text-muted-foreground">
                  #
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user, index) => (
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
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-7">
                        {user.image ? (
                          <AvatarImage
                            src={user.image}
                            alt={user.name ?? user.email}
                          />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-xs text-primary">
                          {getInitials(user.name ?? user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {user.userRoles.map((ur) => ur.role.name).join(", ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableScroll>
      )}
    </DataTableShell>
  );
}
