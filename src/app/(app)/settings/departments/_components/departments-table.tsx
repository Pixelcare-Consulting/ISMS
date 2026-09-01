"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { toast } from "sonner";

import { deleteDepartmentAction } from "@/features/users/actions/department.actions";
import { CreateDepartmentDialog } from "@/app/(app)/settings/departments/_components/create-department-dialog";
import { EditDepartmentDialog } from "@/app/(app)/settings/departments/_components/edit-department-dialog";
import { Badge } from "@/components/ui/badge";
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
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import {
  TableBody,
  TableCell,
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
  /**
   * Local copy of the server rows so edits can show immediately, re-seeded whenever the
   * server sends a new list. Adjusted during render rather than in an effect: an effect
   * would paint the stale list for a frame first, and React re-runs this render before
   * committing anything to the DOM.
   */
  const [rows, setRows] = useState(departments);
  const [seeded, setSeeded] = useState(departments);
  if (seeded !== departments) {
    setSeeded(departments);
    setRows(departments);
  }
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [deleting, setDeleting] = useState<DepartmentRow | null>(null);
  const [pending, startTransition] = useTransition();

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
  const sort = useClientTableSort(filtered, {
    name: (department) => department.name,
    users: (department) => department._count.users,
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
      <GlobalDataTable
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search departments…",
          suggestions,
        }}
        toolbarLeading={
          <TableSelectionBadge
            count={selection.selectedCount}
            onClear={selection.clearSelection}
          />
        }
        toolbarActions={createAction}
        empty={rows.length === 0}
        emptyMessage="No departments yet. Add one or register a new organization to get defaults."
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "department",
          onPageChange: setPage,
        }}
      >
            <TableHeader>
              <TableRow>
                <TableSelectAllCheckbox
                  isAllSelected={selection.isAllSelected}
                  isPartiallySelected={selection.isPartiallySelected}
                  onToggleAll={selection.toggleAll}
                  aria-label="Select all departments"
                />
                <TableIndexHead />
                <GlobalTableHead {...sort.sortProps("name")}>Name</GlobalTableHead>
                <GlobalTableHead
                  className="w-24 text-right"
                  {...sort.sortProps("users")}
                >
                  Users
                </GlobalTableHead>
                <GlobalTableHead className="w-28 text-right">Actions</GlobalTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow
                  colSpan={5}
                  message="No departments match your search."
                />
              ) : (
                pageItems.map((department, index) => (
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
                    <TableIndexCell index={indexOffset + index + 1} />
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
      </GlobalDataTable>

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
