"use client";

import { useMemo, useState, useTransition } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { deleteCompetitorObservationAction } from "@/features/competitors/actions/competitor.actions";
import {
  CompetitorFormDialog,
  type CompetitorFormOption,
  type CompetitorModelOption,
} from "@/features/competitors/components/competitor-form-dialog";
import type { CompetitorObservationDto } from "@/features/competitors/services/competitor.service";
import {
  DeleteConfirmDialog,
  TablePageSizeSelect,
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
import { buildCsvContent } from "@/lib/shared/csv";
import { downloadCsvFile } from "@/lib/shared/download-csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatPeso } from "@/utils/format-currency";
import { matchesTableSearch } from "@/utils/match-table-search";

const observationColumn = createColumnHelper<DataTableFeatures, CompetitorObservationDto>();

interface CompetitorsTableProps {
  observations: CompetitorObservationDto[];
  canManage: boolean;
  competitors: CompetitorFormOption[];
  branches: CompetitorFormOption[];
  aorBranches: CompetitorFormOption[];
  brands: CompetitorFormOption[];
  models: CompetitorModelOption[];
}

function formatObservedDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

/** Local calendar day, matching the Observed column. */
function observedDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function brandDisplay(row: CompetitorObservationDto) {
  return row.competitorBrand?.name ?? row.brandName ?? null;
}

function modelDisplay(row: CompetitorObservationDto) {
  return row.competitorModel?.name ?? row.modelName ?? null;
}

export function CompetitorsTable({
  observations,
  canManage,
  competitors,
  branches,
  aorBranches,
  brands,
  models,
}: CompetitorsTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CompetitorObservationDto | null>(null);
  const [deleting, setDeleting] = useState<CompetitorObservationDto | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const filtered = useMemo(() => {
    return observations.filter((row) => {
      if (branchFilter && row.branchId !== branchFilter) return false;
      if (brandFilter && row.competitorBrandId !== brandFilter) return false;
      if (fromDate || toDate) {
        const day = observedDay(row.observedAt);
        if (!day) return false;
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
      }
      return matchesTableSearch(query, [
        row.competitorName,
        row.promotion ?? "",
        row.branch?.name ?? "",
        row.branch?.sapCode ?? "",
        brandDisplay(row) ?? "",
        modelDisplay(row) ?? "",
        row.notes ?? "",
        row.createdBy.name ?? "",
        row.createdBy.email,
      ]);
    });
  }, [observations, query, branchFilter, brandFilter, fromDate, toDate]);

  const selectedCount = filtered.filter((row) => rowSelection[row.id]).length;

  const sort = useClientTableSort(filtered, {
    competitor: (row) => row.competitorName,
    branch: (row) => row.branch?.name ?? null,
    price: (row) => row.price,
    promotion: (row) => row.promotion,
    observed: (row) => row.observedAt,
    loggedBy: (row) => row.createdBy.name ?? row.createdBy.email,
  });

  const {
    pageItems,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    indexOffset,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${query.trim()}:${branchFilter}:${brandFilter}:${fromDate}:${toDate}:${sort.sortKey}:${sort.sortDir}`,
  });

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        observations.map((row) => row.competitorName),
        observations.map((row) => row.promotion),
        observations.map((row) => row.branch?.name),
        observations.map((row) => row.branch?.sapCode),
        observations.map((row) => brandDisplay(row)),
        observations.map((row) => modelDisplay(row)),
        observations.map((row) => row.notes),
        observations.map((row) => row.createdBy.name),
        observations.map((row) => row.createdBy.email),
      ),
    [observations],
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: CompetitorObservationDto) {
    setEditing(row);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteCompetitorObservationAction(deleting.id);
      if (result.error) {
        toast.error(String(result.error));
        return;
      }
      toast.success("Observation deleted");
      setDeleting(null);
      router.refresh();
    });
  }

  const emptyMessage =
    observations.length === 0
      ? "No competitor observations yet."
      : "No observations match your filters.";

  function rowsForReport() {
    const selected = observations.filter((row) => rowSelection[row.id]);
    if (selected.length > 0) {
      const order = new Map(sort.sorted.map((row, index) => [row.id, index]));
      return [...selected].sort(
        (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    return observations.filter((row) => {
      if (!fromDate && !toDate) return true;
      const day = observedDay(row.observedAt);
      if (!day) return false;
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
  }

  function generateReport() {
    const rows = rowsForReport();
    const csv = buildCsvContent(
      ["Competitor", "Branch", "Brand", "Model", "Price", "Promotion", "Observed", "Notes", "Logged by"],
      rows.map((row) => [
        row.competitorName,
        row.branch ? `${row.branch.name} (${row.branch.sapCode})` : "",
        brandDisplay(row) ?? "",
        modelDisplay(row) ?? "",
        row.price ?? "",
        row.promotion ?? "",
        formatObservedDate(row.observedAt),
        row.notes ?? "",
        row.createdBy.name ?? row.createdBy.email,
      ]),
    );
    const stamp = observedDay(new Date().toISOString());
    downloadCsvFile(csv, `competitor-observations-${stamp}.csv`);
    toast.success(
      rows.length === 0
        ? "Report downloaded with no observations"
        : `Report downloaded (${rows.length} observation${rows.length === 1 ? "" : "s"})`,
    );
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<CompetitorObservationDto>[] = [
      observationColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "w-12 tabular-nums text-muted-foreground" },
      }),
      observationColumn.display({
        id: "competitor",
        header: "Competitor",
        enableSorting: true,
        cell: ({ row }) => row.original.competitorName,
        meta: { className: "font-medium" },
      }),
      observationColumn.display({
        id: "branch",
        header: "Branch",
        enableSorting: true,
        cell: ({ row }) =>
          row.original.branch
            ? `${row.original.branch.name} (${row.original.branch.sapCode})`
            : "—",
      }),
      observationColumn.display({
        id: "brandModel",
        header: "Brand / Model",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{brandDisplay(row.original) ?? "—"}</span>
            {modelDisplay(row.original) ? (
              <span className="text-xs text-muted-foreground">{modelDisplay(row.original)}</span>
            ) : null}
          </div>
        ),
      }),
      observationColumn.display({
        id: "price",
        header: "Price",
        enableSorting: true,
        cell: ({ row }) => formatPeso(row.original.price),
        meta: { align: "end", className: "tabular-nums" },
      }),
      observationColumn.display({
        id: "promotion",
        header: "Promotion",
        enableSorting: true,
        cell: ({ row }) => row.original.promotion ?? "—",
        meta: { className: "max-w-[12rem] truncate" },
      }),
      observationColumn.display({
        id: "observed",
        header: "Observed",
        enableSorting: true,
        cell: ({ row }) => formatObservedDate(row.original.observedAt),
      }),
      observationColumn.display({
        id: "notes",
        header: "Notes",
        enableSorting: false,
        cell: ({ row }) => row.original.notes ?? "—",
        meta: { className: "max-w-[14rem] truncate" },
      }),
      observationColumn.display({
        id: "loggedBy",
        header: "Logged by",
        enableSorting: true,
        cell: ({ row }) => row.original.createdBy.name ?? row.original.createdBy.email,
      }),
    ];
    if (canManage) {
      cols.push(
        observationColumn.display({
          id: "actions",
          header: "Actions",
          enableSorting: false,
          cell: ({ row }) => (
            <TableRowActions
              asCell={false}
              onEdit={() => openEdit(row.original)}
              onDelete={() => setDeleting(row.original)}
              editDisabled={pending}
              deleteDisabled={pending}
            />
          ),
          meta: { align: "end" },
        }),
      );
    }
    return cols;
  }, [canManage, pending, indexOffset]);

  return (
    <div className="space-y-4">
      <DataTable
        data={pageItems}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        enableSorting
        sorting={{
          sortKey: sort.sortKey,
          sortDir: sort.sortDir,
          onSort: sort.toggleSort,
        }}
        stickyHeader
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectAllLabel="Select all observations"
        getSelectionLabel={(row) => `Select observation ${row.competitorName}`}
        toolbarLeading={
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Observations</span>
            <TableSelectionBadge
              count={selectedCount}
              onClear={() => setRowSelection({})}
            />
          </div>
        }
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search competitor, promo, brand, model…",
          suggestions,
        }}
        toolbarActions={
          <>
            <Button size="sm" variant="outline" onClick={generateReport} className="shrink-0">
              Generate report
            </Button>
            {canManage ? (
              <Button size="sm" onClick={openCreate} className="shrink-0">
                <Plus className="size-4" /> Add observation
              </Button>
            ) : null}
          </>
        }
        banner={
          <div className="flex flex-wrap items-end gap-3 px-4 pb-3">
            <div className="[&_[data-slot=select-trigger]]:h-9">
              <TablePageSizeSelect value={pageSize} onChange={setPageSize} />
            </div>
            <SearchableSelect
              label="Branch"
              id="filter-branch"
              className="w-[14rem]"
              options={branches.map((b) => ({ id: b.id, label: b.label }))}
              value={branchFilter}
              onChange={setBranchFilter}
              allowClear
              placeholder="All branches"
              searchPlaceholder="Search branches…"
            />
            <SearchableSelect
              label="Brand"
              id="filter-brand"
              className="w-[12rem]"
              options={brands.map((b) => ({ id: b.id, label: b.label }))}
              value={brandFilter}
              onChange={setBrandFilter}
              allowClear
              placeholder="All brands"
              searchPlaceholder="Search brands…"
            />
            <div className="w-[11rem] space-y-1.5">
              <Label htmlFor="filter-from">From</Label>
              <Input
                id="filter-from"
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </div>
            <div className="w-[11rem] space-y-1.5">
              <Label htmlFor="filter-to">To</Label>
              <Input
                id="filter-to"
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </div>
          </div>
        }
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "observation",
          onPageChange: setPage,
        }}
        empty={pageItems.length === 0}
        emptyMessage={emptyMessage}
      />

      {canManage ? (
        <CompetitorFormDialog
          key={`${editing?.id ?? "create"}-${formOpen ? "open" : "closed"}`}
          open={formOpen}
          onOpenChange={setFormOpen}
          observation={editing}
          competitors={competitors}
          branches={aorBranches}
          brands={brands}
          models={models}
        />
      ) : null}

      <DeleteConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete observation?"
        description={
          deleting
            ? `Remove the observation for “${deleting.competitorName}”? This cannot be undone.`
            : "Remove this competitor observation? This cannot be undone."
        }
        onConfirm={confirmDelete}
        pending={pending}
      />
    </div>
  );
}
