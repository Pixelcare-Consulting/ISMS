"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";

import { toast } from "sonner";

import { deleteDepartmentAction } from "@/features/users/actions/department.actions";
import { CreateDepartmentDialog } from "@/app/(app)/settings/departments/_components/create-department-dialog";
import { EditDepartmentDialog } from "@/app/(app)/settings/departments/_components/edit-department-dialog";
import { Badge } from "@/components/ui/badge";
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
import { matchesTableSearch } from "@/utils/match-table-search";

const departmentColumn = createColumnHelper<DataTableFeatures, DepartmentRow>();

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

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const selectedCount = filtered.filter((department) => rowSelection[department.id]).length;
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

  const columns = useMemo(() => {
    const cols: DataTableColumn<DepartmentRow>[] = [
      departmentColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      departmentColumn.display({
        id: "name",
        header: "Name",
        enableSorting: true,
        cell: ({ row }) => row.original.name,
        meta: { className: "font-medium" },
      }),
      departmentColumn.display({
        id: "users",
        header: "Users",
        enableSorting: true,
        cell: ({ row }) => <Badge variant="secondary">{row.original._count.users}</Badge>,
        meta: { align: "end" },
      }),
      departmentColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <TableRowActions
            asCell={false}
            onEdit={() => setEditing(row.original)}
            onDelete={() => setDeleting(row.original)}
            editTitle={`Edit ${row.original.name}`}
            deleteTitle={`Delete ${row.original.name}`}
          />
        ),
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [indexOffset]);

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
        selectAllLabel="Select all departments"
        getSelectionLabel={(row) => `Select department ${row.name}`}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search departments…",
          suggestions,
        }}
        toolbarLeading={
          <TableSelectionBadge
            count={selectedCount}
            onClear={() => setRowSelection({})}
          />
        }
        toolbarActions={createAction}
        empty={pageItems.length === 0}
        emptyMessage={
          rows.length === 0
            ? "No departments yet. Add one or register a new organization to get defaults."
            : "No departments match your search."
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "department",
          onPageChange: setPage,
        }}
      />

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
