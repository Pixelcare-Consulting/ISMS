"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { LayoutGrid, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  deleteBranchAction,
  syncBranchesFromSapWarehousesAction,
} from "@/features/branches/actions/branch.actions";
import { SapSyncButton } from "@/features/sap/components/sap-sync-button";
import { CreateBranchDialog } from "@/app/(app)/settings/branches/_components/create-branch-dialog";
import { EditBranchDialog } from "@/app/(app)/settings/branches/_components/edit-branch-dialog";
import { ImportBranchesDialog } from "@/app/(app)/settings/branches/_components/import-branches-dialog";
import {
  DeleteConfirmDialog,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  TableRowCheckbox,
  TableSelectAllCheckbox,
  TableSelectionBadge,
  TableStatusBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
  useTableSelection,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";

const COLUMN_COUNT = 7;

interface BranchRow {
  id: string;
  sapCode: string;
  name: string;
  status: string;
  areaId?: string | null;
  branchAreaId?: string | null;
  dealerId?: string | null;
  primaryWarehouseId?: string | null;
  regionId?: string | null;
  provinceId?: string | null;
  branchArea: { name: string } | null;
  dealer?: { name: string } | null;
  alternateWarehouses?: { alternateBranchId: string }[];
  deliveryScheduleConfig?: {
    frequencyCodeId: string;
    deliveryDays: number[];
    orderDays: number[];
    notes: string | null;
  } | null;
}

export function BranchesTable({ branches }: { branches: BranchRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(branches);
  const [prevBranches, setPrevBranches] = useState(branches);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [deleting, setDeleting] = useState<BranchRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [pending, startTransition] = useTransition();

  // Sync local optimistic rows when server props change (render-time, not effect).
  if (branches !== prevBranches) {
    setPrevBranches(branches);
    setRows(branches);
  }

  const filtered = useMemo(
    () =>
      rows.filter((b) =>
        matchesTableSearch(query, [b.name, b.sapCode, b.branchArea?.name ?? ""]),
      ),
    [rows, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((b) => b.name),
        rows.map((b) => b.sapCode),
        rows.map((b) => b.branchArea?.name),
      ),
    [rows],
  );

  const selection = useTableSelection(filtered.map((branch) => branch.id));
  const sort = useClientTableSort(filtered, {
    sapCode: (b) => b.sapCode,
    name: (b) => b.name,
    area: (b) => b.branchArea?.name,
    status: (b) => b.status,
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

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteBranchAction(deleting.id);
      if (result.error) {
        toast.error("Could not delete branch", {
          description: typeof result.error === "string" ? result.error : undefined,
        });
        return;
      }
      toast.success("Branch removed");
      setRows((currentRows) => currentRows.filter((branch) => branch.id !== deleting.id));
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <>
      <GlobalDataTable
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search branches…",
          suggestions,
        }}
        toolbarLeading={
          <TableSelectionBadge
            count={selection.selectedCount}
            onClear={selection.clearSelection}
          />
        }
        toolbarActions={
          <>
              {/* DO NOT DELETE THIS BUTTON - IT IS USED FOR SAP SYNCING <SapSyncButton
                syncKey="branch"
                noun={{ one: "branch", many: "branches" }}
                onSync={syncBranchesFromSapAction}
              /> */}
              {/* Branches as SAP actually holds them: warehouses typed `Branch`. The
                  commented-out button above reads SAP's separate multi-branch (OBRA)
                  entity and is kept for whenever that source is wanted again. */}
              <SapSyncButton
                syncKey="branch-from-warehouse"
                noun={{ one: "branch", many: "branches" }}
                onSync={syncBranchesFromSapWarehousesAction}
              />
              <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
                <Upload className="mr-1 size-4" />
                Import
              </Button>
              <CreateBranchDialog
                onCreated={(branch) => {
                  setRows((currentRows) => [branch, ...currentRows]);
                  router.refresh();
                }}
              />
          </>
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "branch",
          onPageChange: setPage,
        }}
      >
            <TableHeader>
              <TableRow>
                <TableSelectAllCheckbox
                  isAllSelected={selection.isAllSelected}
                  isPartiallySelected={selection.isPartiallySelected}
                  onToggleAll={selection.toggleAll}
                  aria-label="Select all branches"
                />
                <TableIndexHead />
                <GlobalTableHead {...sort.sortProps("sapCode")}>SAP code</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("name")}>Name</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("area")}>Area</GlobalTableHead>
                <GlobalTableHead {...sort.sortProps("status")}>Status</GlobalTableHead>
                <GlobalTableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={COLUMN_COUNT} message="No branches found" />
              ) : (
                pageItems.map((branch, index) => (
                  <TableRow
                    key={branch.id}
                    data-state={selection.isRowSelected(branch.id) ? "selected" : undefined}
                    className={index % 2 === 1 ? "bg-table-stripe" : undefined}
                  >
                    <TableRowCheckbox
                      checked={selection.isRowSelected(branch.id)}
                      onCheckedChange={(checked) =>
                        selection.toggleRow(branch.id, checked)
                      }
                      aria-label={`Select branch ${branch.name}`}
                    />
                    <TableIndexCell index={indexOffset + index + 1} />
                    <TableCell className="font-mono text-sm">{branch.sapCode}</TableCell>
                    <TableCell>{branch.name}</TableCell>
                    <TableCell>{branch.branchArea?.name ?? "—"}</TableCell>
                    <TableCell>
                      <TableStatusBadge status={branch.status} />
                    </TableCell>
                    <TableRowActions
                      onEdit={() => setEditing(branch)}
                      onDelete={() => setDeleting(branch)}
                    >
                      <Button variant="ghost" size="icon" className="size-8" asChild title="Planogram">
                        <Link href={`/settings/branches/${branch.id}/planogram`}>
                          <LayoutGrid className="size-4" />
                        </Link>
                      </Button>
                    </TableRowActions>
                  </TableRow>
                ))
              )}
            </TableBody>
      </GlobalDataTable>
      {editing ? (
        <EditBranchDialog
          branch={editing}
          open
          onOpenChange={() => setEditing(null)}
          onUpdated={(branch) => {
            setRows((currentRows) =>
              currentRows.map((row) => (row.id === branch.id ? branch : row)),
            );
            router.refresh();
          }}
        />
      ) : null}
      <ImportBranchesDialog open={importing} onOpenChange={setImporting} />
      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={() => setDeleting(null)}
        title="Delete branch?"
        description={`Remove ${deleting?.name ?? "this branch"}?`}
        onConfirm={handleDelete}
        pending={pending}
      />
    </>
  );
}
