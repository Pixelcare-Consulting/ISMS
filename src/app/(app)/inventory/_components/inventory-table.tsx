"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateInventoryStatusAction } from "@/features/inventory/actions/inventory.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { TableIndexCell, TableIndexHead } from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";

interface StatusOption {
  id: string;
  code: string;
  name: string;
}

interface InventoryRow {
  id: string;
  onPlanogram: boolean;
  statusCode: { id: string; code: string; name: string };
  branch: { id: string; name: string; sapCode: string };
  serialNumber: {
    serialNo: string;
    model: { sku: string; name: string; brand: { name: string } };
  };
}

interface InventoryTableProps {
  result: {
    items: InventoryRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  statusOptions: StatusOption[];
  initialOffPlanogram?: boolean;
}

function buildInventoryHref(
  page: number,
  limit: number,
  offPlanogram: boolean,
  filters: { branch?: string; sku?: string } = {},
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (offPlanogram) params.set("offPlanogram", "1");
  if (filters.branch) params.set("branch", filters.branch);
  if (filters.sku) params.set("sku", filters.sku);
  const qs = params.toString();
  return qs ? `/inventory?${qs}` : "/inventory";
}

export function InventoryTable({
  result,
  statusOptions,
  initialOffPlanogram = false,
}: InventoryTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [offPlanogramOnly, setOffPlanogramOnly] = useState(initialOffPlanogram);
  const [pending, startTransition] = useTransition();
  const pageSize = parseTablePageSize(result.limit);

  const branchFilter = searchParams.get("branch") ?? "";
  const skuFilter = searchParams.get("sku") ?? "";
  const urlFilters = {
    branch: branchFilter || undefined,
    sku: skuFilter || undefined,
  };

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildInventoryHref(1, limit, offPlanogramOnly, urlFilters));
  }

  const filtered = useMemo(
    () =>
      result.items.filter((r) =>
        matchesTableSearch(query, [
          r.serialNumber.serialNo,
          r.serialNumber.model.sku,
          r.branch.name,
          r.statusCode.name,
          r.statusCode.code,
        ]),
      ),
    [result.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((r) => r.serialNumber.serialNo),
        result.items.map((r) => r.serialNumber.model.sku),
        result.items.map((r) => r.branch.name),
        result.items.map((r) => r.statusCode.name),
        result.items.map((r) => r.statusCode.code),
      ),
    [result.items],
  );

  const selection = useTableSelection(filtered.map((r) => r.id));

  function toggleOffPlanogram(checked: boolean) {
    setOffPlanogramOnly(checked);
    const params = new URLSearchParams(searchParams.toString());
    if (checked) params.set("offPlanogram", "1");
    else params.delete("offPlanogram");
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/inventory?${qs}` : "/inventory");
  }

  function changeStatus(id: string, statusCodeId: string) {
    startTransition(async () => {
      const updateResult = await updateInventoryStatusAction(id, statusCodeId);
      if (updateResult.error) {
        toast.error("Could not update status");
        return;
      }
      toast.success("Status updated");
      router.refresh();
    });
  }

  const filterBanner =
    branchFilter || skuFilter ? (
      <div className="border-b px-4 py-2 text-sm text-muted-foreground">
        Filtered
        {branchFilter ? " · branch" : ""}
        {skuFilter ? ` · SKU ${skuFilter}` : ""}
        <Button variant="link" className="ml-2 h-auto p-0" asChild>
          <Link href="/inventory">Clear</Link>
        </Button>
      </div>
    ) : null;

  return (
    <>
      <GlobalDataTable
        stickyHeader
        scrollable
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search serial, SKU, branch…",
          suggestions,
        }}
        toolbarActions={
          <>
            {selection.selectedCount > 0 ? (
              <Button variant="secondary" onClick={selection.clearSelection}>
                {selection.selectedCount} selected
              </Button>
            ) : null}
            <div className="flex items-center gap-2 text-sm">
              <input
                id="off-planogram"
                type="checkbox"
                checked={offPlanogramOnly}
                onChange={(e) => toggleOffPlanogram(e.target.checked)}
              />
              <Label htmlFor="off-planogram" className="font-normal">
                Off-planogram only
              </Label>
            </div>
          </>
        }
        banner={filterBanner}
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "unit",
          buildHref: (page) =>
            buildInventoryHref(page, pageSize, offPlanogramOnly, urlFilters),
        }}
        footer={
          filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No inventory rows</p>
          ) : null
        }
      >
        <TableHeader>
          <TableRow>
            <GlobalTableHead className="w-10">
              <Checkbox
                checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                aria-label="Select all inventory rows"
              />
            </GlobalTableHead>
            <TableIndexHead />
            <GlobalTableHead>Serial</GlobalTableHead>
            <GlobalTableHead>Model</GlobalTableHead>
            <GlobalTableHead>Branch</GlobalTableHead>
            <GlobalTableHead>Planogram</GlobalTableHead>
            <GlobalTableHead>Status</GlobalTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r, index) => (
            <TableRow key={r.id} data-state={selection.isRowSelected(r.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox
                  checked={selection.isRowSelected(r.id)}
                  onCheckedChange={(checked) => selection.toggleRow(r.id, checked === true)}
                  aria-label={`Select serial ${r.serialNumber.serialNo}`}
                />
              </TableCell>
              <TableIndexCell
                index={(result.page - 1) * result.limit + index + 1}
              />
              <TableCell className="font-mono text-sm">{r.serialNumber.serialNo}</TableCell>
              <TableCell>
                <Link
                  href={`/settings/branches/${r.branch.id}/planogram`}
                  className="font-mono text-sm underline"
                >
                  {r.serialNumber.model.sku}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {r.serialNumber.model.name}
                </span>
              </TableCell>
              <TableCell>
                <Link
                  href={`/settings/branches/${r.branch.id}/planogram`}
                  className="underline"
                >
                  {r.branch.name}
                </Link>
              </TableCell>
              <TableCell>
                {r.onPlanogram ? (
                  <Badge variant="outline" className="border-green-600 text-green-700">
                    On planogram
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-600 text-amber-700">
                    Off planogram
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <SearchableSelect
                  className="min-w-[10rem]"
                  options={statusOptions.map((s) => ({
                    id: s.id,
                    label: `${s.name} (${s.code})`,
                  }))}
                  value={r.statusCode.id}
                  disabled={pending}
                  searchPlaceholder="Search status…"
                  onChange={(next) => changeStatus(r.id, next)}
                />
                <div className="mt-1">
                  <StatusCodeBadge
                    code={r.statusCode.code}
                    name={r.statusCode.name}
                    showCode
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </GlobalDataTable>
    </>
  );
}
