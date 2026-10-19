"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { PulloutRequestDialog } from "@/app/(app)/logistics/_components/pullout-request-dialog";
import {
  approvePulloutTlAction,
  createPulloutAction,
  rejectPulloutAction,
} from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { TableIndexCell, TableIndexHead } from "@/components/data-table";
import {
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  buildLogisticsPageHref,
  LOGISTICS_PICKUPS_PATH,
} from "@/app/(app)/logistics/_components/logistics-paths";
import { matchesTableSearch } from "@/utils/match-table-search";

interface StatusCodeRef {
  id: string;
  code: string;
  name: string;
  color?: string | null;
}

interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PulloutRow {
  id: string;
  pulloutNo: string;
  statusCode: StatusCodeRef;
  reasonStatusCode: StatusCodeRef | null;
  branch: { name: string };
  warehouse: { name: string; code: string };
}

interface PulloutsPanelProps {
  pullouts: PaginatedList<PulloutRow>;
  capabilities: LogisticsActionCapabilities;
  initialSort?: string;
  initialSortDir?: string;
}

type PulloutSortField = "pulloutNo" | "branch" | "warehouse" | "reason" | "status";
type PulloutSortDir = "asc" | "desc";

export function PulloutsPanel({
  pullouts,
  capabilities,
  initialSort = "",
  initialSortDir = "desc",
}: PulloutsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const pageSize = parseTablePageSize(pullouts.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as PulloutSortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildLogisticsPageHref(LOGISTICS_PICKUPS_PATH, 1, limit, sort, sort ? sortDir : undefined),
    );
  }

  function toggleSort(field: PulloutSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(buildLogisticsPageHref(LOGISTICS_PICKUPS_PATH, 1, pageSize, next.sort, next.dir));
  }

  const filtered = useMemo(
    () =>
      pullouts.items.filter((p) =>
        matchesTableSearch(query, [
          p.pulloutNo,
          p.branch.name,
          p.warehouse.name,
          p.warehouse.code,
          p.reasonStatusCode?.name,
          p.reasonStatusCode?.code,
          p.statusCode.name,
          p.statusCode.code,
        ]),
      ),
    [pullouts.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        pullouts.items.map((p) => p.pulloutNo),
        pullouts.items.map((p) => p.branch.name),
        pullouts.items.map((p) => p.warehouse.name),
        pullouts.items.map((p) => p.warehouse.code),
        pullouts.items.map((p) => p.reasonStatusCode?.name),
        pullouts.items.map((p) => p.reasonStatusCode?.code),
        pullouts.items.map((p) => p.statusCode.name),
        pullouts.items.map((p) => p.statusCode.code),
      ),
    [pullouts.items],
  );

  const selection = useTableSelection(filtered.map((p) => p.id));

  function runAction(
    action: () => Promise<{ error: string } | { success: true }>,
    message: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      router.refresh();
    });
  }

  return (
    <>
    <GlobalDataTable
      stickyHeader
      scrollable
      search={{ value: query, onChange: setQuery, placeholder: "Search pull-outs…", suggestions }}
      toolbarActions={
        <>
          {selection.selectedCount > 0 ? (
            <Button variant="secondary" onClick={selection.clearSelection}>
              {selection.selectedCount} selected
            </Button>
          ) : null}
        {capabilities.canCreate ? (
          <Button
            size="sm"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() => setCreateOpen(true)}
          >
            New pull-out
          </Button>
        ) : null}
        </>
      }
      pagination={{
        total: pullouts.total,
        page: pullouts.page,
        totalPages: pullouts.totalPages,
        itemLabel: "pull-out",
        buildHref: (page) =>
          buildLogisticsPageHref(
            LOGISTICS_PICKUPS_PATH,
            page,
            pageSize,
            sort,
            sort ? sortDir : undefined,
          ),
      }}
      pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
    >
          <TableHeader>
            <TableRow>
              <GlobalTableHead className="w-10">
                <Checkbox
                  checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                  onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                  aria-label="Select all pull-outs"
                />
              </GlobalTableHead>
              <TableIndexHead />
              <GlobalTableHead
                sortKey="pulloutNo"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as PulloutSortField)}
              >
                No.
              </GlobalTableHead>
              <GlobalTableHead
                sortKey="branch"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as PulloutSortField)}
              >
                Branch
              </GlobalTableHead>
              <GlobalTableHead
                sortKey="warehouse"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as PulloutSortField)}
              >
                Warehouse
              </GlobalTableHead>
              <GlobalTableHead
                sortKey="reason"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as PulloutSortField)}
              >
                Reason
              </GlobalTableHead>
              <GlobalTableHead
                sortKey="status"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as PulloutSortField)}
              >
                Status
              </GlobalTableHead>
              <GlobalTableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p, index) => (
              <TableRow key={p.id} data-state={selection.isRowSelected(p.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selection.isRowSelected(p.id)}
                    onCheckedChange={(checked) => selection.toggleRow(p.id, checked === true)}
                    aria-label={`Select pull-out ${p.pulloutNo}`}
                  />
                </TableCell>
                <TableIndexCell
                  index={(pullouts.page - 1) * pullouts.limit + index + 1}
                />
                <TableCell>
                  <Link href={`/logistics/pickups/${p.id}`} className="font-medium hover:underline">
                    {p.pulloutNo}
                  </Link>
                </TableCell>
                <TableCell>{p.branch.name}</TableCell>
                <TableCell>{p.warehouse.name}</TableCell>
                <TableCell>
                  {p.reasonStatusCode ? (
                    <StatusCodeBadge
                      code={p.reasonStatusCode.code}
                      name={p.reasonStatusCode.name}
                      color={p.reasonStatusCode.color}
                    />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <StatusCodeBadge
                    code={p.statusCode.code}
                    name={p.statusCode.name}
                    color={p.statusCode.color}
                  />
                </TableCell>
                <TableCell className="space-x-2">
                  {p.statusCode.code === "pending_tl" && capabilities.canApproveTl ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      className="bg-amber-600 text-white hover:bg-amber-700"
                      onClick={() =>
                        runAction(() => approvePulloutTlAction(p.id), "Pull-out approved")
                      }
                    >
                      TL approve
                    </Button>
                  ) : null}
                  {p.statusCode.code === "pending_tl" && capabilities.canRejectTransfer ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        runAction(() => rejectPulloutAction(p.id), "Pull-out rejected")
                      }
                    >
                      Reject
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/logistics/pickups/${p.id}`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
    </GlobalDataTable>
    <PulloutRequestDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      onSubmit={createPulloutAction}
      onCreated={() => router.refresh()}
    />
    </>
  );
}
