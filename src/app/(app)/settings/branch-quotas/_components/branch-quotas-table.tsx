"use client";

import { useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import { ImportBranchQuotasDialog } from "@/app/(app)/settings/branch-quotas/_components/import-branch-quotas-dialog";
import {
  createBranchQuotaAction,
  deleteBranchQuotaAction,
  listBranchQuotaFormOptionsAction,
  updateBranchQuotaAction,
} from "@/features/branch-quotas/actions/branch-quota.actions";
import {
  DeleteConfirmDialog,
  TableRowActions,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { matchesTableSearch } from "@/utils/match-table-search";

const quotaColumn = createColumnHelper<DataTableFeatures, QuotaRow>();

interface QuotaRow {
  id: string;
  branchId: string;
  brandId: string;
  quotaDate: Date | string;
  quotaAmount: string | number;
  branch: { id: string; name: string; sapCode: string };
  brand: { id: string; name: string };
}

type Options = {
  branches: { id: string; name: string; sapCode: string }[];
  brands: { id: string; name: string }[];
};

function toMonthInput(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonth(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function BranchQuotasTable({ quotas }: { quotas: QuotaRow[] }) {
  const router = useRouter();
  const rows = quotas;
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<QuotaRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<QuotaRow | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [branchId, setBranchId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [quotaMonth, setQuotaMonth] = useState(() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [quotaAmount, setQuotaAmount] = useState("100");

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesTableSearch(query, [
          row.branch.name,
          row.branch.sapCode,
          row.brand.name,
          formatMonth(row.quotaDate),
          String(row.quotaAmount),
        ]),
      ),
    [rows, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        rows.map((r) => r.branch.name),
        rows.map((r) => r.brand.name),
      ),
    [rows],
  );

  const sort = useClientTableSort(filtered, {
    branch: (row) => row.branch.name,
    brand: (row) => row.brand.name,
    month: (row) => new Date(row.quotaDate),
    quotaAmount: (row) => Number(row.quotaAmount),
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

  async function ensureOptions() {
    if (options) return;
    setOptions(await listBranchQuotaFormOptionsAction());
  }

  function openCreate() {
    setEditing(null);
    setBranchId("");
    setBrandId("");
    const now = new Date();
    setQuotaMonth(
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    );
    setQuotaAmount("100");
    setSheetOpen(true);
    void ensureOptions();
  }

  function openEdit(row: QuotaRow) {
    setEditing(row);
    setBranchId(row.branchId);
    setBrandId(row.brandId);
    setQuotaMonth(toMonthInput(row.quotaDate));
    setQuotaAmount(String(row.quotaAmount));
    setSheetOpen(true);
    void ensureOptions();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      branchId,
      brandId,
      quotaDate: quotaMonth,
      quotaAmount: Number(quotaAmount),
    };
    startTransition(async () => {
      const result = editing
        ? await updateBranchQuotaAction({ id: editing.id, ...payload })
        : await createBranchQuotaAction(payload);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Quota updated" : "Quota created");
      setSheetOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteBranchQuotaAction(deleting.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Quota deleted");
      setDeleting(null);
      router.refresh();
    });
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<QuotaRow>[] = [
      quotaColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      quotaColumn.display({
        id: "branch",
        header: "Branch",
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.branch.name}</div>
            <div className="mt-0.5 font-mono text-xs text-muted-foreground">
              {row.original.branch.sapCode}
            </div>
          </div>
        ),
        meta: { wrap: true },
      }),
      quotaColumn.display({
        id: "brand",
        header: "Brand",
        enableSorting: true,
        cell: ({ row }) => row.original.brand.name,
      }),
      quotaColumn.display({
        id: "month",
        header: "Month",
        enableSorting: true,
        cell: ({ row }) => formatMonth(row.original.quotaDate),
      }),
      quotaColumn.display({
        id: "quotaAmount",
        header: "Quota",
        enableSorting: true,
        cell: ({ row }) => Number(row.original.quotaAmount).toLocaleString(),
        meta: { align: "end", className: "tabular-nums" },
      }),
      quotaColumn.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <TableRowActions
            asCell={false}
            onEdit={() => openEdit(row.original)}
            editDisabled={pending}
            onDelete={() => setDeleting(row.original)}
            deleteDisabled={pending}
          />
        ),
        meta: { align: "end" },
      }),
    ];
    return cols;
  }, [indexOffset, pending]);

  return (
    <div className="space-y-4">
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
          placeholder: "Search quotas…",
          suggestions,
        }}
        toolbarActions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
              <Upload className="size-4" />
              Import
            </Button>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Add quota
            </Button>
          </div>
        }
        empty={pageItems.length === 0}
        emptyMessage={
          rows.length === 0 ? "No branch quotas yet." : "No results match your search."
        }
        pageSize={{ value: pageSize, onChange: setPageSize }}
        pagination={{
          total,
          page,
          totalPages,
          itemLabel: "quota",
          onPageChange: setPage,
        }}
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle>{editing ? "Edit quota" : "Add quota"}</SheetTitle>
            <SheetDescription>
              Monthly order quota by branch and brand (first day of month).
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {options ? (
                <>
                  <SearchableSelect
                    label="Branch"
                    options={options.branches.map((b) => ({
                      id: b.id,
                      label: `${b.sapCode} — ${b.name}`,
                    }))}
                    value={branchId}
                    onChange={setBranchId}
                    placeholder="Select branch…"
                    searchPlaceholder="Search branches…"
                    disabled={pending}
                  />
                  <SearchableSelect
                    label="Brand"
                    options={options.brands.map((b) => ({
                      id: b.id,
                      label: b.name,
                    }))}
                    value={brandId}
                    onChange={setBrandId}
                    placeholder="Select brand…"
                    searchPlaceholder="Search brands…"
                    disabled={pending}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Loading options…</p>
              )}
              <div className="space-y-2">
                <Label htmlFor="quota-month">Month</Label>
                <Input
                  id="quota-month"
                  type="month"
                  value={quotaMonth}
                  onChange={(e) => setQuotaMonth(e.target.value)}
                  required
                  disabled={pending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quota-amount">Quota amount</Label>
                <Input
                  id="quota-amount"
                  type="number"
                  min={1}
                  step={1}
                  value={quotaAmount}
                  onChange={(e) => setQuotaAmount(e.target.value)}
                  required
                  disabled={pending}
                />
              </div>
            </div>
            <SheetFooter className="border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !branchId || !brandId}>
                {pending ? "Saving…" : editing ? "Save" : "Create"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete quota?"
        description={
          deleting
            ? `Remove ${deleting.brand.name} quota for ${deleting.branch.name}?`
            : "Remove this quota?"
        }
        onConfirm={handleDelete}
        pending={pending}
      />

      <ImportBranchQuotasDialog open={importing} onOpenChange={setImporting} />
    </div>
  );
}
