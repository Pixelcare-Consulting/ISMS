"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
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
  initialSort?: string;
  initialSortDir?: string;
}

type PulloutSortField = "pulloutNo" | "branch" | "warehouse" | "reason" | "status";
type PulloutSortDir = "asc" | "desc";

export function PulloutsPanel({
  pullouts,
  initialSort = "",
  initialSortDir = "desc",
}: PulloutsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  function runAction(action: () => Promise<unknown>, message: string) {
    startTransition(async () => {
      await action();
      toast.success(message);
      router.refresh();
    });
  }

  return (
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
        {pulloutReasons.length > 0 ? (
          <SearchableSelect
            className="w-full sm:w-[200px]"
            options={pulloutReasons.map((r) => ({
              id: r.id,
              label: `${r.name} (${r.code})`,
            }))}
            value={selectedReasonId}
            onChange={setSelectedReasonId}
            placeholder="Pull-out reason"
            searchPlaceholder="Search reasons…"
          />
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
          <SearchableSelect
            className="w-full sm:w-[200px]"
            options={branches.map((b) => ({ id: b.id, label: b.name }))}
            value={selectedBranchId || branches[0]?.id || ""}
            onChange={async (next) => {
              setSelectedBranchId(next);
              const serials = await listStkSerialsForBranchAction(next);
              setPulloutSerials(serials);
              setSelectedPulloutSerialIds(serials.slice(0, 1).map((s) => s.id));
            }}
            placeholder="Branch"
            searchPlaceholder="Search branches…"
          />
        ) : null}
        {branches[0] && warehouses[0] ? (
          <Button
            size="sm"
            className="w-full sm:w-auto"
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
        </>
      }
      banner={pulloutSerials.length > 0 ? (
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
                <TableCell>{p.pulloutNo}</TableCell>
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
    </GlobalDataTable>
  );
}
