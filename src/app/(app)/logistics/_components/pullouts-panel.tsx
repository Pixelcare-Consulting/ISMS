"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approvePulloutTlAction,
  completePulloutAction,
  createPulloutAction,
  releasePulloutAction,
  schedulePulloutAction,
} from "@/features/logistics/actions/logistics.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { TablePagination } from "@/components/data-table/table-pagination";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogisticsLoadRefsButton } from "@/app/(app)/logistics/_components/logistics-load-refs-button";
import {
  buildLogisticsPageHref,
  LOGISTICS_PICKUPS_PATH,
} from "@/app/(app)/logistics/_components/logistics-paths";
import { useLogisticsRefs } from "@/app/(app)/logistics/_components/use-logistics-refs";
import { matchesTableSearch } from "@/utils/match-table-search";

interface StatusCodeRef {
  id: string;
  code: string;
  name: string;
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
}

export function PulloutsPanel({ pullouts }: PulloutsPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const {
    branches,
    warehouses,
    pulloutReasons,
    selectedReasonId,
    setSelectedReasonId,
    loadRefs,
  } = useLogisticsRefs();

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

  function runAction(action: () => Promise<unknown>, message: string) {
    startTransition(async () => {
      await action();
      toast.success(message);
      router.refresh();
    });
  }

  return (
    <DataTableShell>
      <TableSearchToolbar
        value={query}
        onChange={setQuery}
        placeholder="Search pull-outs…"
      >
        {pulloutReasons.length > 0 ? (
          <select
            className="h-9 rounded-md border px-2 text-sm"
            value={selectedReasonId}
            onChange={(e) => setSelectedReasonId(e.target.value)}
            aria-label="Pull-out reason"
          >
            {pulloutReasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        ) : null}
        <LogisticsLoadRefsButton onClick={loadRefs} />
        {branches[0] && warehouses[0] ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              runAction(
                () =>
                  createPulloutAction({
                    branchId: branches[0].id,
                    warehouseId: warehouses[0].id,
                    reasonStatusCodeId: selectedReasonId || undefined,
                  }),
                "Pull-out request submitted",
              )
            }
          >
            New pull-out
          </Button>
        ) : null}
      </TableSearchToolbar>
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No.</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.pulloutNo}</TableCell>
                <TableCell>{p.branch.name}</TableCell>
                <TableCell>{p.warehouse.name}</TableCell>
                <TableCell>
                  {p.reasonStatusCode ? (
                    <StatusCodeBadge
                      code={p.reasonStatusCode.code}
                      name={p.reasonStatusCode.name}
                    />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <StatusCodeBadge code={p.statusCode.code} name={p.statusCode.name} />
                </TableCell>
                <TableCell className="space-x-2">
                  {p.statusCode.code === "pending_tl" ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      className="bg-amber-600 text-white hover:bg-amber-700"
                      onClick={() =>
                        runAction(
                          () => approvePulloutTlAction(p.id),
                          "TL approved — for pull-out",
                        )
                      }
                    >
                      TL approve
                    </Button>
                  ) : null}
                  {p.statusCode.code === "for_pullout" ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        runAction(
                          () => schedulePulloutAction(p.id),
                          "Logistics scheduled pick-up",
                        )
                      }
                    >
                      Schedule
                    </Button>
                  ) : null}
                  {p.statusCode.code === "pending_logistics" ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        runAction(
                          () => releasePulloutAction(p.id),
                          "Released — pull-out in transit",
                        )
                      }
                    >
                      Release
                    </Button>
                  ) : null}
                  {p.statusCode.code === "in_transit" ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() =>
                        runAction(
                          () => completePulloutAction(p.id),
                          "Pull-out validated and completed",
                        )
                      }
                    >
                      Complete
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableScroll>
      <TablePagination
        meta={{
          total: pullouts.total,
          page: pullouts.page,
          totalPages: pullouts.totalPages,
          itemLabel: "pull-out",
        }}
        buildHref={(page) => buildLogisticsPageHref(LOGISTICS_PICKUPS_PATH, page)}
      />
    </DataTableShell>
  );
}
