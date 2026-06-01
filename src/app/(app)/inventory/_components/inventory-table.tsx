"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateInventoryStatusAction } from "@/features/inventory/actions/inventory.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { DataTableScroll, DataTableShell } from "@/components/data-table/data-table-shell";
import { TablePagination } from "@/components/data-table/table-pagination";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
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

function buildInventoryHref(page: number, offPlanogram: boolean): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (offPlanogram) params.set("offPlanogram", "1");
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

  const branchFilter = searchParams.get("branch") ?? "";
  const skuFilter = searchParams.get("sku") ?? "";

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

  return (
    <DataTableShell>
      <TableSearchToolbar
        value={query}
        onChange={setQuery}
        placeholder="Search serial, SKU, branch…"
      >
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
      </TableSearchToolbar>
      {(branchFilter || skuFilter) && (
        <div className="border-b px-4 py-2 text-sm text-muted-foreground">
          Filtered
          {branchFilter ? " · branch" : ""}
          {skuFilter ? ` · SKU ${skuFilter}` : ""}
          <Button variant="link" className="ml-2 h-auto p-0" asChild>
            <Link href="/inventory">Clear</Link>
          </Button>
        </div>
      )}
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serial</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Planogram</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
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
                  <select
                    className="rounded-md border px-2 py-1 text-sm"
                    value={r.statusCode.id}
                    disabled={pending}
                    onChange={(e) => changeStatus(r.id, e.target.value)}
                  >
                    {statusOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
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
        </Table>
      </DataTableScroll>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No inventory rows</p>
      ) : null}
      <TablePagination
        meta={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "unit",
        }}
        buildHref={(page) => buildInventoryHref(page, offPlanogramOnly)}
      />
    </DataTableShell>
  );
}
