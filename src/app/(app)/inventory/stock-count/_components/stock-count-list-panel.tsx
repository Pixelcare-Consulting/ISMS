"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
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
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import {
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";

const sessionColumn = createColumnHelper<DataTableFeatures, SessionRow>();

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
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const indexOffset = (sessions.page - 1) * sessions.limit;
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

  const columns = useMemo(() => {
    const cols: DataTableColumn<SessionRow>[] = [
      sessionColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => indexOffset + row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      sessionColumn.display({
        id: "session",
        header: "Session",
        enableSorting: true,
        cell: ({ row }) => (
          <Link href={`/inventory/stock-count/${row.original.id}`} className="font-medium hover:underline">
            {row.original.sessionNo}
          </Link>
        ),
      }),
      sessionColumn.display({
        id: "branch",
        header: "Branch",
        enableSorting: true,
        cell: ({ row }) => (
          <>
            {row.original.branch.name}
            <span className="ml-1 text-xs text-muted-foreground">({row.original.branch.sapCode})</span>
          </>
        ),
      }),
      sessionColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <Badge variant="outline">{STOCK_COUNT_SESSION_LABELS[row.original.status]}</Badge>
        ),
      }),
      sessionColumn.display({
        id: "lines",
        header: "Lines",
        enableSorting: false,
        cell: ({ row }) => row.original._count.lines,
        meta: { align: "end" },
      }),
      sessionColumn.display({
        id: "variances",
        header: "Variances",
        enableSorting: false,
        cell: ({ row }) => row.original._count.variances,
        meta: { align: "end" },
      }),
      sessionColumn.display({
        id: "createdBy",
        header: "Created by",
        enableSorting: true,
        cell: ({ row }) => row.original.createdBy.name ?? row.original.createdBy.email,
        meta: { className: "text-sm text-muted-foreground" },
      }),
    ];
    return cols;
  }, [indexOffset]);

  return (
    <>
      <DataTable
        data={sessions.items}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort,
          sortDir,
          onSort: (key) => toggleSort(key as StockCountSortField),
        }}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectAllLabel="Select all stock count sessions"
        getSelectionLabel={(row) => `Select session ${row.sessionNo}`}
        stickyHeader
        empty={sessions.items.length === 0}
        emptyMessage="No count sessions yet."
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
      />
      <StockCountPermissionDialog
        open={permissionDialogOpen}
        onOpenChange={setPermissionDialogOpen}
      />
    </>
  );
}
