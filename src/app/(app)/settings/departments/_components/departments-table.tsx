"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { toast } from "sonner";

import { deleteDepartmentAction } from "@/features/users/actions/department.actions";
import { CreateDepartmentDialog } from "@/app/(app)/settings/departments/_components/create-department-dialog";
import { EditDepartmentDialog } from "@/app/(app)/settings/departments/_components/edit-department-dialog";
import { Badge } from "@/components/ui/badge";
import {
  AppDataTable,
  AppDataTableBody,
  DeleteConfirmDialog,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  TableRowCheckbox,
  TableSearchBar,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  uniqueSearchSuggestions,
  useTableSelection,
} from "@/components/data-table";
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

  const suggestions = useMemo(
    () => uniqueSearchSuggestions(rows.map((department) => department.name)),
    [rows],
  );

  const selection = useTableSelection(filtered.map((department) => department.id));

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

  const createAction = (
    <CreateDepartmentDialog
      onCreated={(department) => {
        setRows((currentRows) => [
          { ...department, _count: { users: 0 } },
          ...currentRows,
        ]);
        router.refresh();
      }}
    />
  );

  return (
    <>
      <AppDataTable
        shellHeader={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TableSearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search departments…"
              suggestions={suggestions}
              className="sm:max-w-sm"
            />
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <TableSelectionBadge
                count={selection.selectedCount}
                onClear={selection.clearSelection}
              />
              {createAction}
            </div>
          </div>
        }
        empty={rows.length === 0}
        emptyMessage="No departments yet. Add one or register a new organization to get defaults."
      >
        <AppDataTableBody>
          <Table>
            <TableHeader>
              <TableRow>
                <TableSelectAllCheckbox
                  isAllSelected={selection.isAllSelected}
                  isPartiallySelected={selection.isPartiallySelected}
                  onToggleAll={selection.toggleAll}
                  aria-label="Select all departments"
                />
                <TableIndexHead />
                <TableHead>Name</TableHead>
                <TableHead className="w-24 text-right">Users</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow
                  colSpan={5}
                  message="No departments match your search."
                />
              ) : (
                filtered.map((department, index) => (
                  <TableRow
                    key={department.id}
                    data-state={
                      selection.isRowSelected(department.id) ? "selected" : undefined
                    }
                    className={cn(index % 2 === 1 && "bg-table-stripe")}
                  >
                    <TableRowCheckbox
                      checked={selection.isRowSelected(department.id)}
                      onCheckedChange={(checked) =>
                        selection.toggleRow(department.id, checked)
                      }
                      aria-label={`Select department ${department.name}`}
                    />
                    <TableIndexCell index={index + 1} />
                    <TableCell className="font-medium">{department.name}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{department._count.users}</Badge>
                    </TableCell>
                    <TableRowActions
                      onEdit={() => setEditing(department)}
                      onDelete={() => setDeleting(department)}
                      editTitle={`Edit ${department.name}`}
                      deleteTitle={`Delete ${department.name}`}
                    />
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </AppDataTableBody>
      </AppDataTable>

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
