"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { listBranchesForPcountReportAction } from "@/features/stock-audit/actions/stock-audit.actions";
import {
  DataTableEmpty,
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { TablePagination } from "@/components/data-table/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";

interface ClosedSessionRow {
  id: string;
  sessionNo: string;
  closedAt: Date | string | null;
  createdAt: Date | string;
  branch: { id: string; name: string; sapCode: string };
  createdBy: { name: string | null; email: string };
  lineCount: number;
  countedCount: number;
  varianceCount: number;
}

interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PcountReportPanelProps {
  sessions: PaginatedList<ClosedSessionRow>;
  currentBranchId?: string;
  currentFrom?: string;
  currentTo?: string;
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function buildHref(
  page: number,
  filters: { branchId?: string; from?: string; to?: string },
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const query = params.toString();
  return query ? `/reports/pcount?${query}` : "/reports/pcount";
}

export function PcountReportPanel({
  sessions,
  currentBranchId,
  currentFrom,
  currentTo,
}: PcountReportPanelProps) {
  const router = useRouter();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [branchId, setBranchId] = useState(currentBranchId ?? "");
  const [from, setFrom] = useState(currentFrom ?? "");
  const [to, setTo] = useState(currentTo ?? "");
  const [refsLoaded, setRefsLoaded] = useState(false);

  const activeFilters = {
    branchId: currentBranchId,
    from: currentFrom,
    to: currentTo,
  };
  const hasActiveFilters = Boolean(
    currentBranchId || currentFrom || currentTo,
  );

  const totalLines = sessions.items.reduce((sum, row) => sum + row.lineCount, 0);
  const totalCounted = sessions.items.reduce(
    (sum, row) => sum + row.countedCount,
    0,
  );
  const totalVariances = sessions.items.reduce(
    (sum, row) => sum + row.varianceCount,
    0,
  );

  async function loadBranches() {
    if (refsLoaded) return;
    const rows = await listBranchesForPcountReportAction();
    setBranches(rows);
    setRefsLoaded(true);
  }

  function applyFilters() {
    router.push(
      buildHref(1, {
        branchId: branchId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
    );
  }

  function clearFilters() {
    setBranchId("");
    setFrom("");
    setTo("");
    router.push("/reports/pcount");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Lines (page)</p>
          <p className="text-2xl font-semibold tabular-nums">{totalLines}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Counted (page)</p>
          <p className="text-2xl font-semibold tabular-nums">{totalCounted}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Variances (page)</p>
          <p className="text-2xl font-semibold tabular-nums">{totalVariances}</p>
        </div>
      </div>

      <DataTableShell>
        <div className="space-y-4 border-b px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-3">
            <SearchableSelect
              label="Branch"
              id="pcount-branch"
              className="lg:w-56"
              options={[
                ...branches.map((b) => ({ id: b.id, label: b.name })),
                ...(currentBranchId &&
                !branches.some((b) => b.id === currentBranchId)
                  ? [{ id: currentBranchId, label: "Selected branch" }]
                  : []),
              ]}
              value={branchId}
              onChange={setBranchId}
              allowClear
              placeholder="All branches"
              searchPlaceholder="Search branches…"
              onOpenChange={(open) => {
                if (open) void loadBranches();
              }}
            />
            <div className="space-y-2 lg:w-40">
              <Label htmlFor="pcount-from">Closed from</Label>
              <Input
                id="pcount-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2 lg:w-40">
              <Label htmlFor="pcount-to">Closed to</Label>
              <Input
                id="pcount-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear
              </Button>
              <Button type="button" onClick={applyFilters}>
                Apply filters
              </Button>
            </div>
          </div>
        </div>

        {sessions.items.length === 0 ? (
          <DataTableEmpty
            message={
              hasActiveFilters
                ? "No closed P-Count sessions match your filters."
                : "No closed P-Count sessions yet."
            }
          />
        ) : (
          <>
            <DataTableScroll>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Closed</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Variances</TableHead>
                    <TableHead>Created by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.items.map((row, index) => (
                    <TableRow
                      key={row.id}
                      className={cn(index % 2 === 1 && "bg-table-stripe")}
                    >
                      <TableCell className="tabular-nums text-muted-foreground">
                        {(sessions.page - 1) * sessions.limit + index + 1}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/inventory/stock-count/${row.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.sessionNo}
                        </Link>
                        <Badge variant="outline" className="ml-2">
                          Closed
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {row.branch.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({row.branch.sapCode})
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(row.closedAt)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.lineCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.countedCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.varianceCount}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.createdBy.name ?? row.createdBy.email}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableScroll>
            <TablePagination
              meta={{
                total: sessions.total,
                page: sessions.page,
                totalPages: sessions.totalPages,
                itemLabel: "session",
              }}
              buildHref={(page) => buildHref(page, activeFilters)}
            />
          </>
        )}
      </DataTableShell>
    </div>
  );
}
