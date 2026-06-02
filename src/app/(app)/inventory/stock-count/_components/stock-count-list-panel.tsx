"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createStockCountSessionAction,
  listBranchesForStockCountAction,
} from "@/features/stock-audit/actions/stock-audit.actions";
import {
  STOCK_COUNT_SESSION_LABELS,
} from "@/features/stock-audit/constants/stock-count-workflow";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TablePagination } from "@/components/data-table/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
}

export function StockCountListPanel({ sessions }: StockCountListPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [refsLoaded, setRefsLoaded] = useState(false);
  const selection = useTableSelection(sessions.items.map((session) => session.id));

  async function loadBranches() {
    if (refsLoaded) return;
    const rows = await listBranchesForStockCountAction();
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
        toast.error(result.error);
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
    <DataTableShell>
      <div className="flex flex-wrap items-center justify-end gap-2 border-b p-4">
        <Select
          value={selectedBranchId}
          onValueChange={setSelectedBranchId}
          onOpenChange={(open) => {
            if (open) void loadBranches();
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={pending} onClick={createSession}>
          New count session
        </Button>
      </div>
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                  onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                  aria-label="Select all stock count sessions"
                />
              </TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Variances</TableHead>
              <TableHead>Created by</TableHead>
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
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
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
        </Table>
      </DataTableScroll>
      <TablePagination
        meta={{
          total: sessions.total,
          page: sessions.page,
          totalPages: sessions.totalPages,
          itemLabel: "session",
        }}
        buildHref={(page) => `/inventory/stock-count?page=${page}`}
      />
    </DataTableShell>
  );
}
