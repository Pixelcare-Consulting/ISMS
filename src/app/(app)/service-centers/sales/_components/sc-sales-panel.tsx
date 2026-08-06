"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  approveScReturnAction,
  completeScReturnRestoreAction,
  evaluateScReturnAction,
  listScSalesAction,
  rejectScReturnAction,
  requestScReturnAction,
} from "@/features/service-center-ops/actions/sc-sales.actions";
import type { ScSalesActionCapabilities } from "@/features/service-center-ops/constants/sc-permissions";
import {
  TableEmptyRow,
  TableIndexCell,
  TableIndexHead,
  useClientTablePagination,
} from "@/components/data-table";
import { GlobalDataTable, GlobalTableHead, useClientTableSort } from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { matchesTableSearch } from "@/utils/match-table-search";

type SaleRow = Awaited<ReturnType<typeof listScSalesAction>>["items"][number];

export function ScSalesPanel({
  items,
  capabilities,
}: {
  items: SaleRow[];
  capabilities: ScSalesActionCapabilities;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [reasonBySale, setReasonBySale] = useState<Record<string, string>>({});

  const filtered = useMemo(
    () =>
      items.filter((row) =>
        matchesTableSearch(query, [
          row.transactionNo,
          row.customerName ?? "",
          row.serviceCenter.name,
          row.serialNumber?.serialNo ?? "",
          row.atrStatus,
          row.returnRequest?.status ?? "",
        ]),
      ),
    [items, query],
  );

  const sort = useClientTableSort(filtered, {
    txn: (row) => row.transactionNo,
    center: (row) => row.serviceCenter.name,
    atr: (row) => row.atrStatus,
  });
  const {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    totalPages,
    pageItems,
    indexOffset,
  } = useClientTablePagination(sort.sorted, {
    resetKey: `${query}:${sort.sortKey}:${sort.sortDir}`,
  });

  function run(
    action: () => Promise<{ error?: string; success?: true }>,
    okMessage: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(okMessage);
      router.refresh();
    });
  }

  return (
    <GlobalDataTable
      stickyHeader
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search transaction, serial, or center…",
      }}
      toolbarActions={
        capabilities.canCreateSale ? (
          <Button asChild>
            <Link href="/service-centers/sales/new">
              <Plus className="size-4" />
              New sale
            </Link>
          </Button>
        ) : null
      }
      empty={items.length === 0}
      emptyMessage="No service center sales yet."
      pageSize={{ value: pageSize, onChange: setPageSize }}
      pagination={{
        total,
        page,
        totalPages,
        itemLabel: "sale",
        onPageChange: setPage,
      }}
    >
      <TableHeader>
        <TableRow>
          <TableIndexHead />
          <GlobalTableHead {...sort.sortProps("txn")}>Transaction</GlobalTableHead>
          <GlobalTableHead {...sort.sortProps("center")}>Center</GlobalTableHead>
          <GlobalTableHead>Serial</GlobalTableHead>
          <GlobalTableHead {...sort.sortProps("atr")}>ATR</GlobalTableHead>
          <GlobalTableHead>Return</GlobalTableHead>
          <GlobalTableHead className="w-56">Actions</GlobalTableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pageItems.length === 0 ? (
          <TableEmptyRow colSpan={7} message="No sales match your search." />
        ) : (
          pageItems.map((row, index) => {
            const rr = row.returnRequest;
            return (
              <TableRow key={row.id}>
                <TableIndexCell index={indexOffset + index + 1} />
                <TableCell>
                  <div className="font-medium">{row.transactionNo}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.customerName || "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.serviceCenter.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.serviceCenterLocation
                      ? `${row.serviceCenterLocation.name} (${row.serviceCenterLocation.code})`
                      : "—"}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {row.serialNumber?.serialNo ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.atrStatus}</Badge>
                </TableCell>
                <TableCell>
                  {rr ? (
                    <Badge variant="outline">{rr.status}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    {!rr &&
                    row.atrStatus === "open" &&
                    capabilities.canRequestReturn ? (
                      <>
                        <Input
                          placeholder="Return reason"
                          value={reasonBySale[row.id] ?? ""}
                          onChange={(e) =>
                            setReasonBySale((prev) => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                          disabled={pending}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () =>
                                requestScReturnAction(
                                  row.id,
                                  reasonBySale[row.id],
                                ),
                              "Return requested",
                            )
                          }
                        >
                          Request return
                        </Button>
                      </>
                    ) : null}
                    {rr?.status === "pending_cs" &&
                    capabilities.canEvaluateReturn ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => evaluateScReturnAction(rr.id),
                            "Evaluated — pending TL",
                          )
                        }
                      >
                        Evaluate
                      </Button>
                    ) : null}
                    {rr?.status === "pending_tl" &&
                    capabilities.canApproveReturn ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => approveScReturnAction(rr.id),
                            "Return approved",
                          )
                        }
                      >
                        Approve
                      </Button>
                    ) : null}
                    {rr &&
                    ["pending_cs", "pending_tl"].includes(rr.status) &&
                    (capabilities.canEvaluateReturn ||
                      capabilities.canApproveReturn) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => rejectScReturnAction(rr.id),
                            "Return rejected",
                          )
                        }
                      >
                        Reject
                      </Button>
                    ) : null}
                    {rr?.status === "approved" &&
                    capabilities.canCompleteReturn ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => completeScReturnRestoreAction(rr.id),
                            "Stock restored to STK",
                          )
                        }
                      >
                        Complete / restore
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </GlobalDataTable>
  );
}
