"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { LayoutGrid, Upload } from "lucide-react";

import { syncBranchesFromSapWarehousesAction } from "@/features/branches/actions/branch.actions";
import { SapSyncButton } from "@/features/sap/components/sap-sync-button";
import { EditBranchDialog } from "@/app/(app)/settings/branches/_components/edit-branch-dialog";
import { ImportBranchesDialog } from "@/app/(app)/settings/branches/_components/import-branches-dialog";
import {
  TableRowActions,
  TableStatusBadge,
  uniqueSearchSuggestions,
  useClientTablePagination,
} from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { matchesTableSearch } from "@/utils/match-table-search";

const branchColumn = createColumnHelper<DataTableFeatures, BranchRow>();

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

export function BranchesTable({
  branches,
  canSync,
}: {
  branches: BranchRow[];
  canSync: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(branches);
  const [prevBranches, setPrevBranches] = useState(branches);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [importing, setImporting] = useState(false);

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

  const columns = useMemo(() => {
    const cols: DataTableColumn<BranchRow>[] = [
      branchColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      branchColumn.display({
        id: "sapCode",
        header: "SAP Code",
        enableSorting: true,
        cell: ({ row }) => row.original.sapCode,
        meta: { className: "font-mono text-sm" },
      }),
      branchColumn.display({
        id: "name",
        header: "Branch Name",
        enableSorting: true,
        cell: ({ row }) => row.original.name,
      }),
      branchColumn.display({
        id: "area",
        header: "Area",
        enableSorting: true,
        cell: ({ row }) => row.original.branchArea?.name ?? "—",
      }),
      branchColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => <TableStatusBadge status={row.original.status} />,
      }),
      branchColumn.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <TableRowActions asCell={false} onEdit={() => setEditing(row.original)}>
            <Button variant="ghost" size="icon" className="size-8" asChild title="Planogram">
              <Link href={`/settings/planogram/${row.original.id}`}>
                <LayoutGrid className="size-4" />
              </Link>
            </Button>
          </TableRowActions>
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
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search branches…",
          suggestions,
        }}
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
              {canSync ? (
                <SapSyncButton
                  syncKey="branch-from-warehouse"
                  noun={{ one: "branch", many: "branches" }}
                  onSync={syncBranchesFromSapWarehousesAction}
                />
              ) : null}
              <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
                <Upload className="mr-1 size-4" />
                Import
              </Button>
          </>
        }
        empty={pageItems.length === 0}
        emptyMessage="No branches found"
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "branch",
          onPageChange: setPage,
        }}
      />
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
    </>
  );
}
