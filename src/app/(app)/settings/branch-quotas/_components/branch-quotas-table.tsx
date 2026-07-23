"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  createBranchQuotaAction,
  deleteBranchQuotaAction,
  listBranchQuotaFormOptionsAction,
  updateBranchQuotaAction,
} from "@/features/branch-quotas/actions/branch-quota.actions";
import {
  AppDataTable,
  AppDataTableBody,
  DeleteConfirmDialog,
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  TableRowActions,
  TableSearchBar,
  uniqueSearchSuggestions,
} from "@/components/data-table";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { matchesTableSearch } from "@/utils/match-table-search";

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

const COL_COUNT = 6;

export function BranchQuotasTable({ quotas }: { quotas: QuotaRow[] }) {
  const router = useRouter();
  const rows = quotas;
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
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

  return (
    <div className="space-y-4">
      <AppDataTable
        shellHeader={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TableSearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search quotas…"
              suggestions={suggestions}
              className="sm:max-w-sm"
            />
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Add quota
            </Button>
          </div>
        }
        empty={rows.length === 0}
        emptyMessage="No branch quotas yet."
      >
        <AppDataTableBody>
          <Table>
            <TableHeader>
              <TableRow>
                <TableIndexHead />
                <TableHead>Branch</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Quota</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow colSpan={COL_COUNT} message="No results match your search." />
              ) : (
                filtered.map((row, index) => (
                  <TableRow
                    key={row.id}
                    className={cn(index % 2 === 1 && "bg-table-stripe")}
                  >
                    <TableIndexCell index={index + 1} />
                    <TableCell className="font-medium">
                      {row.branch.name}
                      <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                        {row.branch.sapCode}
                      </span>
                    </TableCell>
                    <TableCell>{row.brand.name}</TableCell>
                    <TableCell>{formatMonth(row.quotaDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(row.quotaAmount).toLocaleString()}
                    </TableCell>
                    <TableRowActions
                      onEdit={() => openEdit(row)}
                      editDisabled={pending}
                      onDelete={() => setDeleting(row)}
                      deleteDisabled={pending}
                    />
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </AppDataTableBody>
      </AppDataTable>

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
    </div>
  );
}
