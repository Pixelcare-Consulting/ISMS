"use client";

import { useMemo, useState, useTransition } from "react";
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
  AppDataTable,
  AppDataTableBody,
  DeleteConfirmDialog,
  TableEmptyRow,
  TableRowActions,
  TableSearchBar,
  uniqueSearchSuggestions,
} from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPeso } from "@/utils/format-currency";
import { matchesTableSearch } from "@/utils/match-table-search";
import { cn } from "@/utils/cn";

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
      if (brandFilter && row.brandId !== brandFilter) return false;
      return matchesTableSearch(query, [
        row.competitorName,
        row.promotion ?? "",
        row.branch?.name ?? "",
        row.branch?.sapCode ?? "",
        row.brand?.name ?? "",
        row.model?.name ?? "",
        row.model?.skuCode ?? "",
        row.notes ?? "",
        row.createdBy.name ?? "",
        row.createdBy.email,
      ]);
    });
  }, [observations, query, branchFilter, brandFilter]);

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        observations.map((row) => row.competitorName),
        observations.map((row) => row.promotion),
        observations.map((row) => row.branch?.name),
        observations.map((row) => row.branch?.sapCode),
        observations.map((row) => row.brand?.name),
        observations.map((row) => row.model?.name),
        observations.map((row) => row.model?.skuCode),
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

  const colSpan = canManage ? 9 : 8;
  const emptyMessage =
    observations.length === 0
      ? "No competitor observations yet."
      : "No observations match your filters.";

  return (
    <div className="space-y-4">
      <AppDataTable
        title="Observations"
        shellHeader={
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <TableSearchBar
                value={query}
                onChange={setQuery}
                placeholder="Search competitor, promo, brand, model…"
                suggestions={suggestions}
                className="sm:max-w-sm"
              />
              {canManage ? (
                <Button size="sm" onClick={openCreate} className="shrink-0">
                  <Plus className="size-4" /> Add observation
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
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
          </div>
        }
        empty={observations.length === 0}
        emptyMessage="No competitor observations yet."
      >
        <AppDataTableBody>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competitor</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Brand / Model</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Promotion</TableHead>
                <TableHead>Observed</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Logged by</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={colSpan} message={emptyMessage} />
              ) : (
                filtered.map((row, index) => (
                  <TableRow
                    key={row.id}
                    className={cn(index % 2 === 1 && "bg-table-stripe")}
                  >
                    <TableCell className="font-medium">{row.competitorName}</TableCell>
                    <TableCell>
                      {row.branch
                        ? `${row.branch.name} (${row.branch.sapCode})`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{row.brand?.name ?? "—"}</span>
                        {row.model ? (
                          <span className="text-xs text-muted-foreground">
                            {row.model.skuCode} — {row.model.name}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPeso(row.price)}
                    </TableCell>
                    <TableCell
                      className="max-w-[12rem] truncate"
                      title={row.promotion ?? undefined}
                    >
                      {row.promotion ?? "—"}
                    </TableCell>
                    <TableCell>{formatObservedDate(row.observedAt)}</TableCell>
                    <TableCell className="max-w-[14rem] truncate" title={row.notes ?? undefined}>
                      {row.notes ?? "—"}
                    </TableCell>
                    <TableCell>
                      {row.createdBy.name ?? row.createdBy.email}
                    </TableCell>
                    {canManage ? (
                      <TableRowActions
                        onEdit={() => openEdit(row)}
                        onDelete={() => setDeleting(row)}
                        editDisabled={pending}
                        deleteDisabled={pending}
                      />
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </AppDataTableBody>
      </AppDataTable>

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
