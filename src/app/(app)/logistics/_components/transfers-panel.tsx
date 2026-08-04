"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approveTransferAction,
  createTransferAction,
  executeTransferAction,
  rejectTransferAction,
  receiveTransferAction,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { LogisticsLoadRefsButton } from "@/app/(app)/logistics/_components/logistics-load-refs-button";
import {
  buildLogisticsPageHref,
  LOGISTICS_TRANSFERS_PATH,
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

interface TransferRow {
  id: string;
  transferNo: string;
  statusCode: StatusCodeRef;
  fromBranch: { id: string; name: string };
  toBranch: { id: string; name: string };
  lines: { serialNumberId: string }[];
}

interface TransfersPanelProps {
  transfers: PaginatedList<TransferRow>;
  initialSort?: string;
  initialSortDir?: string;
}

type TransferSortField = "transferNo" | "fromBranch" | "toBranch" | "status";
type TransferSortDir = "asc" | "desc";

type PendingConfirm = {
  id: string;
  transferNo: string;
  route: string;
  fromBranchId: string;
  action: "approve" | "reject" | "execute" | "receive";
};

interface SerialOption {
  id: string;
  serialNo: string;
  skuCode: string;
}

export function TransfersPanel({
  transfers,
  initialSort = "",
  initialSortDir = "desc",
}: TransfersPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const { branches, loadRefs } = useLogisticsRefs();
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [executeSerials, setExecuteSerials] = useState<SerialOption[]>([]);
  const [selectedSerialIds, setSelectedSerialIds] = useState<string[]>([]);
  const pageSize = parseTablePageSize(transfers.limit);
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as TransferSortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildLogisticsPageHref(LOGISTICS_TRANSFERS_PATH, 1, limit, sort, sort ? sortDir : undefined),
    );
  }

  function toggleSort(field: TransferSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(
      buildLogisticsPageHref(LOGISTICS_TRANSFERS_PATH, 1, pageSize, next.sort, next.dir),
    );
  }

  const filtered = useMemo(
    () =>
      transfers.items.filter((t) =>
        matchesTableSearch(query, [
          t.transferNo,
          t.fromBranch.name,
          t.toBranch.name,
          t.statusCode.name,
          t.statusCode.code,
        ]),
      ),
    [transfers.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        transfers.items.map((t) => t.transferNo),
        transfers.items.map((t) => t.fromBranch.name),
        transfers.items.map((t) => t.toBranch.name),
        transfers.items.map((t) => t.statusCode.name),
        transfers.items.map((t) => t.statusCode.code),
      ),
    [transfers.items],
  );

  const selection = useTableSelection(filtered.map((t) => t.id));

  async function openExecuteConfirm(transfer: TransferRow) {
    const serials = await listStkSerialsForBranchAction(transfer.fromBranch.id);
    setExecuteSerials(serials);
    setSelectedSerialIds(serials.slice(0, 1).map((s) => s.id));
    setPendingConfirm({
      id: transfer.id,
      transferNo: transfer.transferNo,
      route: `${transfer.fromBranch.name} → ${transfer.toBranch.name}`,
      fromBranchId: transfer.fromBranch.id,
      action: "execute",
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm) return;
    startTransition(async () => {
      if (pendingConfirm.action === "approve") {
        await approveTransferAction(pendingConfirm.id);
        toast.success("Transfer endorsed by TL");
      } else if (pendingConfirm.action === "reject") {
        await rejectTransferAction(pendingConfirm.id);
        toast.success("Transfer rejected");
      } else if (pendingConfirm.action === "execute") {
        const result = await executeTransferAction(pendingConfirm.id, {
          serialNumberIds: selectedSerialIds,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Transfer dispatched — in transit");
      } else {
        const result = await receiveTransferAction(pendingConfirm.id);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Transfer received — stock updated");
      }
      setPendingConfirm(null);
      setExecuteSerials([]);
      setSelectedSerialIds([]);
      router.refresh();
    });
  }

  const confirmTitle =
    pendingConfirm?.action === "approve"
      ? "Approve transfer?"
      : pendingConfirm?.action === "reject"
        ? "Reject transfer?"
      : pendingConfirm?.action === "execute"
        ? "Execute transfer?"
        : "Receive transfer?";

  const confirmDescription =
    pendingConfirm?.action === "approve"
      ? "Team Lead approval routes the request to the releasing branch."
      : pendingConfirm?.action === "reject"
        ? "Rejected transfer requests are closed and excluded from dispatch."
      : pendingConfirm?.action === "execute"
        ? "Logistics will mark units in transit after serial selection at the releasing branch."
        : "Receiving branch confirms arrival and updates stock.";

  return (
    <>
      <GlobalDataTable
        stickyHeader
        scrollable
        search={{ value: query, onChange: setQuery, placeholder: "Search transfers…", suggestions }}
        toolbarActions={
          <>
            {selection.selectedCount > 0 ? (
              <Button variant="secondary" onClick={selection.clearSelection}>
                {selection.selectedCount} selected
              </Button>
            ) : null}
            <LogisticsLoadRefsButton onClick={loadRefs} />
          {branches.length >= 2 ? (
            <Button
              size="sm"
              className="w-full sm:w-auto"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await createTransferAction({
                    fromBranchId: branches[0].id,
                    toBranchId: branches[1].id,
                  });
                  router.refresh();
                })
              }
            >
              New transfer request
            </Button>
          ) : null}
          </>
        }
        pagination={{
          total: transfers.total,
          page: transfers.page,
          totalPages: transfers.totalPages,
          itemLabel: "transfer",
          buildHref: (page) =>
            buildLogisticsPageHref(
              LOGISTICS_TRANSFERS_PATH,
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
                    aria-label="Select all transfers"
                  />
                </GlobalTableHead>
                <TableIndexHead />
                <GlobalTableHead
                  sortKey="transferNo"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as TransferSortField)}
                >
                  No.
                </GlobalTableHead>
                <GlobalTableHead
                  sortKey="fromBranch"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as TransferSortField)}
                >
                  From → To
                </GlobalTableHead>
                <GlobalTableHead
                  sortKey="status"
                  activeSortKey={sort}
                  sortDirection={sortDir}
                  onSort={(key) => toggleSort(key as TransferSortField)}
                >
                  Status
                </GlobalTableHead>
                <GlobalTableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t, index) => (
                <TableRow key={t.id} data-state={selection.isRowSelected(t.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selection.isRowSelected(t.id)}
                      onCheckedChange={(checked) => selection.toggleRow(t.id, checked === true)}
                      aria-label={`Select transfer ${t.transferNo}`}
                    />
                  </TableCell>
                  <TableIndexCell
                    index={(transfers.page - 1) * transfers.limit + index + 1}
                  />
                  <TableCell>{t.transferNo}</TableCell>
                  <TableCell>
                    {t.fromBranch.name} → {t.toBranch.name}
                  </TableCell>
                  <TableCell>
                    <StatusCodeBadge
                      code={t.statusCode.code}
                      name={t.statusCode.name}
                      color={t.statusCode.color}
                    />
                  </TableCell>
                  <TableCell className="space-x-2">
                    {["requested", "pending_tl"].includes(t.statusCode.code) ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        className="bg-amber-600 text-white hover:bg-amber-700"
                        onClick={() =>
                          setPendingConfirm({
                            id: t.id,
                            transferNo: t.transferNo,
                            route: `${t.fromBranch.name} → ${t.toBranch.name}`,
                            fromBranchId: t.fromBranch.id,
                            action: "approve",
                          })
                        }
                      >
                        TL approve
                      </Button>
                    ) : null}
                    {["requested", "pending_tl"].includes(t.statusCode.code) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          setPendingConfirm({
                            id: t.id,
                            transferNo: t.transferNo,
                            route: `${t.fromBranch.name} → ${t.toBranch.name}`,
                            fromBranchId: t.fromBranch.id,
                            action: "reject",
                          })
                        }
                      >
                        Reject
                      </Button>
                    ) : null}
                    {["approved", "for_transfer"].includes(t.statusCode.code) ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => openExecuteConfirm(t)}
                      >
                        Execute
                      </Button>
                    ) : null}
                    {t.statusCode.code === "in_transit" ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() =>
                          setPendingConfirm({
                            id: t.id,
                            transferNo: t.transferNo,
                            route: `${t.fromBranch.name} → ${t.toBranch.name}`,
                            fromBranchId: t.fromBranch.id,
                            action: "receive",
                          })
                        }
                      >
                        Receive
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
      </GlobalDataTable>

      <AlertDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm ? (
                <>
                  Transfer{" "}
                  <span className="font-medium text-foreground">
                    {pendingConfirm.transferNo}
                  </span>{" "}
                  ({pendingConfirm.route}). {confirmDescription}
                </>
              ) : (
                "Confirm this transfer action."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingConfirm?.action === "execute" ? (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {executeSerials.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No STK serials at source branch.
                </p>
              ) : (
                executeSerials.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSerialIds.includes(s.id)}
                      onChange={(e) => {
                        setSelectedSerialIds((prev) =>
                          e.target.checked
                            ? [...prev, s.id]
                            : prev.filter((id) => id !== s.id),
                        );
                      }}
                    />
                    {s.serialNo} · {s.skuCode}
                  </label>
                ))
              )}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                pending ||
                (pendingConfirm?.action === "execute" && selectedSerialIds.length === 0)
              }
              onClick={(event) => {
                event.preventDefault();
                confirmPendingAction();
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
