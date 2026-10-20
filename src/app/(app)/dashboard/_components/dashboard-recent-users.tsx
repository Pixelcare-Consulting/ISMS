"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { getInitials } from "@/utils/get-initials";
import { matchesTableSearch } from "@/utils/match-table-search";

const userColumn = createColumnHelper<DataTableFeatures, UserRow>();

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

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        users.map((user) => user.name),
        users.map((user) => user.email),
        users.flatMap((user) => user.userRoles.map((userRole) => userRole.role.name)),
      ),
    [users],
  );

  const columns = useMemo(() => {
    const cols: DataTableColumn<UserRow>[] = [
      userColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "text-center tabular-nums text-muted-foreground" },
      }),
      userColumn.display({
        id: "name",
        header: "Name",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar className="size-7">
              {row.original.image ? (
                <AvatarImage src={row.original.image} alt={row.original.name ?? row.original.email} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-xs text-primary">
                {getInitials(row.original.name ?? row.original.email)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">{row.original.name ?? "—"}</span>
          </div>
        ),
      }),
      userColumn.display({
        id: "email",
        header: "Email",
        enableSorting: false,
        cell: ({ row }) => row.original.email,
        meta: { className: "text-muted-foreground" },
      }),
      userColumn.display({
        id: "role",
        header: "Role",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.userRoles.map((userRole) => userRole.role.name).join(", ") || "—",
      }),
    ];
    return cols;
  }, []);

  return (
    <DataTable
      data={filteredUsers}
      columns={columns}
      getRowId={(row) => row.id}
      stickyHeader
      toolbarLeading={<h2 className="font-semibold">Recent team members</h2>}
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search team members…",
        suggestions,
      }}
      toolbarActions={
        <Link href="/settings/users" className="text-sm font-medium text-primary hover:underline">
          View all
        </Link>
      }
      empty={filteredUsers.length === 0}
      emptyMessage={
        users.length === 0 ? "No team members yet." : "No team members match your search."
      }
    />
  );
}
