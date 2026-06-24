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
import { listStkSerialsForBranchAction } from "@/features/sales/actions/sales.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  DataTableScroll,
  DataTableShell,
} from "@/components/data-table/data-table-shell";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { TablePagination } from "@/components/data-table/table-pagination";
import { TableSearchToolbar } from "@/components/data-table/table-search-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [pulloutSerials, setPulloutSerials] = useState<
    { id: string; serialNo: string; skuCode: string }[]
  >([]);
  const [selectedPulloutSerialIds, setSelectedPulloutSerialIds] = useState<string[]>([]);

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
  const selection = useTableSelection(filtered.map((p) => p.id));

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
        {selection.selectedCount > 0 ? (
          <Button variant="secondary" onClick={selection.clearSelection}>
            {selection.selectedCount} selected
          </Button>
        ) : null}
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
        <LogisticsLoadRefsButton
          onClick={async () => {
            await loadRefs();
            if (branches[0]) {
              setSelectedBranchId(branches[0].id);
              const serials = await listStkSerialsForBranchAction(branches[0].id);
              setPulloutSerials(serials);
              setSelectedPulloutSerialIds(serials.slice(0, 1).map((s) => s.id));
            }
          }}
        />
        {branches.length > 0 ? (
          <select
            className="h-9 rounded-md border px-2 text-sm"
            value={selectedBranchId || branches[0]?.id || ""}
            onChange={async (e) => {
              setSelectedBranchId(e.target.value);
              const serials = await listStkSerialsForBranchAction(e.target.value);
              setPulloutSerials(serials);
              setSelectedPulloutSerialIds(serials.slice(0, 1).map((s) => s.id));
            }}
            aria-label="Branch"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : null}
        {branches[0] && warehouses[0] ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              runAction(
                () =>
                  createPulloutAction({
                    branchId: selectedBranchId || branches[0].id,
                    warehouseId: warehouses[0].id,
                    reasonStatusCodeId: selectedReasonId || undefined,
                    serialNumberIds:
                      selectedPulloutSerialIds.length > 0
                        ? selectedPulloutSerialIds
                        : undefined,
                  }),
                "Pull-out request submitted",
              )
            }
          >
            New pull-out
          </Button>
        ) : null}
      </TableSearchToolbar>
      {pulloutSerials.length > 0 ? (
        <div className="border-b px-4 py-2 text-sm">
          <span className="text-muted-foreground">Serials to pull out: </span>
          {pulloutSerials.map((s) => (
            <label key={s.id} className="mr-3 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={selectedPulloutSerialIds.includes(s.id)}
                onChange={(e) =>
                  setSelectedPulloutSerialIds((prev) =>
                    e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                  )
                }
              />
              {s.serialNo}
            </label>
          ))}
        </div>
      ) : null}
      <DataTableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                  onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                  aria-label="Select all pull-outs"
                />
              </TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>No.</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Warehouse</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
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
                <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
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
