"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteDepartmentAction } from "@/features/users/actions/department.actions";
import { CreateDepartmentDialog } from "@/app/(app)/settings/departments/_components/create-department-dialog";
import { EditDepartmentDialog } from "@/app/(app)/settings/departments/_components/edit-department-dialog";
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

interface DepartmentRow {
  id: string;
  name: string;
  _count: { users: number };
}

interface DepartmentsTableProps {
  departments: DepartmentRow[];
}

export function DepartmentsTable({ departments }: DepartmentsTableProps) {
  const router = useRouter();
  const [rows, setRows] = useState(departments);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRows(departments);
  }, [departments]);

  const filtered = useMemo(
    () =>
      rows.filter((department) =>
        matchesTableSearch(query, [department.name]),
      ),
    [rows, query],
  );

  function handleDeleteConfirm() {
    if (!deleting) return;

    startTransition(async () => {
      const result = await deleteDepartmentAction(deleting.id);
      if (result.error) {
        toast.error("Could not delete department", { description: result.error });
        return;
      }
      toast.success("Department deleted");
      setRows((currentRows) =>
        currentRows.filter((department) => department.id !== deleting.id),
      );
      setDeleting(null);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <DataTableShell>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search departments…"
        >
          <CreateDepartmentDialog
            onCreated={(department) => {
              setRows((currentRows) => [
                { ...department, _count: { users: 0 } },
                ...currentRows,
              ]);
              router.refresh();
            }}
          />
        </TableSearchToolbar>
        <DataTableEmpty message="No departments yet. Add one or register a new organization to get defaults." />
      </DataTableShell>
    );
  }

  return (
    <>
      <DataTableShell>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search departments…"
        >
          <CreateDepartmentDialog
            onCreated={(department) => {
              setRows((currentRows) => [
                { ...department, _count: { users: 0 } },
                ...currentRows,
              ]);
              router.refresh();
            }}
          />
        </TableSearchToolbar>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-24 text-right">Users</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No departments match your search.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((department) => (
                  <TableRow key={department.id}>
                    <TableCell className="font-medium">{department.name}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{department._count.users}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setEditing(department)}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">Edit {department.name}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleting(department)}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Delete {department.name}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DataTableScroll>
      </DataTableShell>

      <EditDepartmentDialog
        department={editing}
        onClose={() => setEditing(null)}
        onUpdated={(department) => {
          setRows((currentRows) =>
            currentRows.map((row) =>
              row.id === department.id ? { ...row, name: department.name } : row,
            ),
          );
          router.refresh();
        }}
      />

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete department"
        description={
          deleting && deleting._count.users > 0
            ? `${deleting.name} has ${deleting._count.users} assigned user(s). Reassign them before deleting.`
            : `Delete ${deleting?.name ?? "this department"}? This cannot be undone.`
        }
        onConfirm={() => {
          if (deleting && deleting._count.users > 0) {
            toast.error("Cannot delete department", {
              description: "Reassign users before deleting this department.",
            });
            return;
          }
          handleDeleteConfirm();
        }}
        pending={pending}
      />
    </>
  );
}
