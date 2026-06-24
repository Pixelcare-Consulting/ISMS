"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OrderTypeBadge } from "@/features/orders/components/order-type-badge";
import { Button } from "@/components/ui/button";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TablePagination } from "@/components/data-table/table-pagination";
import { TableSearchBar } from "@/components/data-table/table-search-bar";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DraftOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  branch: { id: string; name: string };
  details: { quantity: number; model: { skuCode: string; name: string } }[];
}

interface DraftFilters {
  branch?: string;
  q?: string;
}

interface DraftSuggestedOrdersTableProps {
  basePath: string;
  pageParam?: string;
  result: {
    items: DraftOrderRow[];
    total: number;
    page: number;
    totalPages: number;
  };
  branches: { id: string; name: string }[];
  currentBranch?: string;
  currentQ?: string;
  preserveParams?: Record<string, string>;
}

function buildDraftsHref(
  basePath: string,
  page: number,
  pageParam: string,
  filters: DraftFilters = {},
  preserveParams: Record<string, string> = {},
): string {
  const params = new URLSearchParams(preserveParams);

  if (page > 1) params.set(pageParam, String(page));
  else params.delete(pageParam);

  if (filters.branch) params.set("draftBranch", filters.branch);
  else params.delete("draftBranch");

  if (filters.q) params.set("draftQ", filters.q);
  else params.delete("draftQ");

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function DraftSuggestedOrdersTable({
  basePath,
  pageParam = "page",
  result,
  branches,
  currentBranch,
  currentQ,
  preserveParams = {},
}: DraftSuggestedOrdersTableProps) {
  const router = useRouter();
  const [branch, setBranch] = useState(currentBranch ?? "");
  const [q, setQ] = useState(currentQ ?? "");
  const selection = useTableSelection(result.items.map((item) => item.id));

  const hasActiveFilters = Boolean(currentBranch || currentQ);

  function applyFilters() {
    router.push(
      buildDraftsHref(
        basePath,
        1,
        pageParam,
        { branch: branch || undefined, q: q.trim() || undefined },
        preserveParams,
      ),
    );
  }

  function clearFilters() {
    setBranch("");
    setQ("");
    router.push(buildDraftsHref(basePath, 1, pageParam, {}, preserveParams));
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Draft auto-replenish orders</h2>

      <DataTableShell>
        <div className="space-y-3 border-b px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="drafts-branch">Branch</Label>
                <Select
                  value={branch || "all"}
                  onValueChange={(value) => setBranch(value === "all" ? "" : value)}
                >
                  <SelectTrigger id="drafts-branch">
                    <SelectValue placeholder="All branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="drafts-q">Search</Label>
                <TableSearchBar
                  value={q}
                  onChange={setQ}
                  placeholder="Order #, branch, SKU…"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={applyFilters}>
                Apply
              </Button>
              {hasActiveFilters ? (
                <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {result.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No draft suggested orders. Run allocation then generate.
          </p>
        ) : (
          <>
            <DataTableScroll>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                        onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                        aria-label="Select all draft orders"
                      />
                    </TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((o, index) => (
                    <TableRow key={o.id} data-state={selection.isRowSelected(o.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selection.isRowSelected(o.id)}
                          onCheckedChange={(checked) => selection.toggleRow(o.id, checked === true)}
                          aria-label={`Select draft order ${o.orderNumber}`}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-mono text-sm">
                        <Link href="/orders" className="underline">
                          {o.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{o.branch.name}</TableCell>
                      <TableCell>
                        <OrderTypeBadge orderType="auto_replenish" />
                      </TableCell>
                      <TableCell>
                        {o.details.map((d) => `${d.model.skuCode}×${d.quantity}`).join(", ")}
                      </TableCell>
                      <TableCell>{o.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableScroll>
            <TablePagination
              meta={{
                total: result.total,
                page: result.page,
                totalPages: result.totalPages,
                itemLabel: "draft",
              }}
              buildHref={(page) =>
                buildDraftsHref(
                  basePath,
                  page,
                  pageParam,
                  { branch: currentBranch, q: currentQ },
                  preserveParams,
                )
              }
            />
          </>
        )}
      </DataTableShell>
    </section>
  );
}
