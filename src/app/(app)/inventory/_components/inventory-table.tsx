"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { updateInventoryStatusAction } from "@/features/inventory/actions/inventory.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { DataTableScroll, DataTableShell } from "@/components/data-table/data-table-shell";
import { TablePagination } from "@/components/data-table/table-pagination";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
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
  statusCode: { id: string; code: string; name: string };
  branch: { name: string; sapCode: string };
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
}

function buildInventoryHref(page: number): string {
  return page > 1 ? `/inventory?page=${page}` : "/inventory";
}

export function InventoryTable({ result, statusOptions }: InventoryTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

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
      />
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serial</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.serialNumber.serialNo}</TableCell>
                <TableCell>
                  {r.serialNumber.model.sku}
                  <span className="block text-xs text-muted-foreground">
                    {r.serialNumber.model.name}
                  </span>
                </TableCell>
                <TableCell>{r.branch.name}</TableCell>
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
        buildHref={buildInventoryHref}
      />
    </DataTableShell>
  );
}
