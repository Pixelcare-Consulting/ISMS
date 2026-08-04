"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createStockCountSessionAction,
  listBranchesForStockCountAction,
} from "@/features/stock-audit/actions/stock-audit.actions";
import { StockCountPermissionDialog } from "@/app/(app)/inventory/stock-count/_components/stock-count-permission-dialog";
import { STOCK_COUNT_PERMISSION_MESSAGE } from "@/features/stock-audit/constants/stock-count-permissions";
import {
  STOCK_COUNT_SESSION_LABELS,
} from "@/features/stock-audit/constants/stock-count-workflow";
import { TableIndexCell, TableIndexHead } from "@/components/data-table";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { GlobalDataTable, GlobalTableHead, nextTableSort } from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";

interface SessionRow {
  id: string;
  sessionNo: string;
  status: keyof typeof STOCK_COUNT_SESSION_LABELS;
  branch: { name: string; sapCode: string };
  createdBy: { name: string | null; email: string };
  _count: { lines: number; variances: number };
  createdAt: Date;
}

interface PaginatedList<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface StockCountListPanelProps {
  sessions: PaginatedList<SessionRow>;
  initialSort?: string;
  initialSortDir?: string;
}

type StockCountSortField = "session" | "branch" | "status" | "createdBy";
type StockCountSortDir = "asc" | "desc";

function buildStockCountHref(
  page: number,
  limit: number,
  sort?: string,
  sortDir?: string,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (sort) params.set("sort", sort);
  if (sort && sortDir) params.set("dir", sortDir);
  const query = params.toString();
  return query ? `/inventory/stock-count?${query}` : "/inventory/stock-count";
}

export function StockCountListPanel({
  sessions,
  initialSort = "",
  initialSortDir = "desc",
}: StockCountListPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [refsLoaded, setRefsLoaded] = useState(false);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const selection = useTableSelection(sessions.items.map((session) => session.id));
  const pageSize = parseTablePageSize(sessions.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as StockCountSortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildStockCountHref(1, limit, sort, sort ? sortDir : undefined));
  }

  function toggleSort(field: StockCountSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(buildStockCountHref(1, pageSize, next.sort, next.dir));
  }

  async function loadBranches() {
    if (refsLoaded) return;
    const result = await listBranchesForStockCountAction();
    if ("error" in result && result.error) {
      if (result.error === STOCK_COUNT_PERMISSION_MESSAGE) {
        setPermissionDialogOpen(true);
      } else {
        toast.error(result.error);
      }
      return;
    }
    const rows = ("branches" in result ? result.branches : []) ?? [];
    setBranches(rows);
    if (rows[0]) setSelectedBranchId(rows[0].id);
    setRefsLoaded(true);
  }

  function createSession() {
    if (!selectedBranchId) {
      toast.error("Select a branch");
      return;
    }
    startTransition(async () => {
      const result = await createStockCountSessionAction({ branchId: selectedBranchId });
      if ("error" in result && result.error) {
        if (result.error === STOCK_COUNT_PERMISSION_MESSAGE) {
          setPermissionDialogOpen(true);
        } else {
          toast.error(result.error);
        }
        return;
      }
      toast.success("Count session created");
      if ("sessionId" in result && result.sessionId) {
        router.push(`/inventory/stock-count/${result.sessionId}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <GlobalDataTable
      stickyHeader
      scrollable
      toolbarActions={
        <>
          <SearchableSelect
            className="w-full sm:w-[200px]"
            options={branches.map((b) => ({ id: b.id, label: b.name }))}
            value={selectedBranchId}
            onChange={setSelectedBranchId}
            placeholder="Branch"
            searchPlaceholder="Search branches…"
            emptyMessage="Load branches first."
            onOpenChange={(open) => {
              if (open) void loadBranches();
            }}
          />
          <Button className="w-full sm:w-auto" disabled={pending} onClick={createSession}>
            New count session
          </Button>
        </>
      }
      pagination={{
        total: sessions.total,
        page: sessions.page,
        totalPages: sessions.totalPages,
        itemLabel: "session",
        buildHref: (page) =>
          buildStockCountHref(page, pageSize, sort, sort ? sortDir : undefined),
      }}
      pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
    >
          <TableHeader>
            <TableRow>
              <GlobalTableHead className="w-10">
                <Checkbox
                  checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                  onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                  aria-label="Select all stock count sessions"
                />
              </GlobalTableHead>
              <TableIndexHead />
              <GlobalTableHead
                sortKey="session"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as StockCountSortField)}
              >
                Session
              </GlobalTableHead>
              <GlobalTableHead
                sortKey="branch"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as StockCountSortField)}
              >
                Branch
              </GlobalTableHead>
              <GlobalTableHead
                sortKey="status"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as StockCountSortField)}
              >
                Status
              </GlobalTableHead>
              <GlobalTableHead className="text-right">Lines</GlobalTableHead>
              <GlobalTableHead className="text-right">Variances</GlobalTableHead>
              <GlobalTableHead
                sortKey="createdBy"
                activeSortKey={sort}
                sortDirection={sortDir}
                onSort={(key) => toggleSort(key as StockCountSortField)}
              >
                Created by
              </GlobalTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground text-center">
                  No count sessions yet.
                </TableCell>
              </TableRow>
            ) : (
              sessions.items.map((row, index) => (
                <TableRow key={row.id} data-state={selection.isRowSelected(row.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selection.isRowSelected(row.id)}
                      onCheckedChange={(checked) => selection.toggleRow(row.id, checked === true)}
                      aria-label={`Select session ${row.sessionNo}`}
                    />
                  </TableCell>
                  <TableIndexCell
                    index={(sessions.page - 1) * sessions.limit + index + 1}
                  />
                  <TableCell>
                    <Link
                      href={`/inventory/stock-count/${row.id}`}
                      className="font-medium hover:underline"
                    >
                      {row.sessionNo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {row.branch.name}
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({row.branch.sapCode})
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {STOCK_COUNT_SESSION_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{row._count.lines}</TableCell>
                  <TableCell className="text-right">{row._count.variances}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {row.createdBy.name ?? row.createdBy.email}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
      </GlobalDataTable>
      <StockCountPermissionDialog
        open={permissionDialogOpen}
        onOpenChange={setPermissionDialogOpen}
      />
    </>
  );
}
