"use client";

import { useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
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
  TableRowActions,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import {
  DataTable,
  useClientTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatPeso } from "@/utils/format-currency";
import { matchesTableSearch } from "@/utils/match-table-search";

const observationColumn = createColumnHelper<DataTableFeatures, CompetitorObservationDto>();

interface CompetitorsTableProps {
  observations: CompetitorObservationDto[];
  canManage: boolean;
  competitors: CompetitorFormOption[];
  branches: CompetitorFormOption[];
  brands: CompetitorFormOption[];
  models: CompetitorModelOption[];
}

function formatObservedDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
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
  brands,
  models,
}: CompetitorsTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CompetitorObservationDto | null>(null);
  const [deleting, setDeleting] = useState<CompetitorObservationDto | null>(null);

  const filtered = useMemo(() => {
    return observations.filter((row) => {
      if (branchFilter && row.branchId !== branchFilter) return false;
      if (brandFilter && row.competitorBrandId !== brandFilter) return false;
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
  }, [observations, query, branchFilter, brandFilter]);

  const sort = useClientTableSort(filtered, {
    competitor: (row) => row.competitorName,
    branch: (row) => row.branch?.name ?? null,
    price: (row) => row.price,
    promotion: (row) => row.promotion,
    observed: (row) => row.observedAt,
    loggedBy: (row) => row.createdBy.name ?? row.createdBy.email,
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

  const columns = useMemo(() => {
    const cols: DataTableColumn<CompetitorObservationDto>[] = [
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
  }, [canManage, pending]);

  return (
    <div className="space-y-4">
      <DataTable
        data={sort.sorted}
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
        toolbarLeading={<span className="text-sm font-medium">Observations</span>}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search competitor, promo, brand, model…",
          suggestions,
        }}
        toolbarActions={
          canManage ? (
            <Button size="sm" onClick={openCreate} className="shrink-0">
              <Plus className="size-4" /> Add observation
            </Button>
          ) : null
        }
        banner={
          <div className="flex flex-wrap gap-3 px-4 pb-3">
            <SearchableSelect
              label="Branch"
              id="filter-branch"
              className="min-w-[10rem]"
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
              className="min-w-[10rem]"
              options={brands.map((b) => ({ id: b.id, label: b.label }))}
              value={brandFilter}
              onChange={setBrandFilter}
              allowClear
              placeholder="All brands"
              searchPlaceholder="Search brands…"
            />
          </div>
        }
        empty={sort.sorted.length === 0}
        emptyMessage={emptyMessage}
      />

      {canManage ? (
        <CompetitorFormDialog
          key={`${editing?.id ?? "create"}-${formOpen ? "open" : "closed"}`}
          open={formOpen}
          onOpenChange={setFormOpen}
          observation={editing}
          competitors={competitors}
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
