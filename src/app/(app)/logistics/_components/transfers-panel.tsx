"use client";

import { useRouter } from "next/navigation";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  LOGISTICS_TRANSFERS_PATH,
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
}

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

export function TransfersPanel({ transfers }: TransfersPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const { branches, loadRefs } = useLogisticsRefs();
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [executeSerials, setExecuteSerials] = useState<SerialOption[]>([]);
  const [selectedSerialIds, setSelectedSerialIds] = useState<string[]>([]);

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
      <DataTableShell>
        <TableSearchToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search transfers…"
        >
          {selection.selectedCount > 0 ? (
            <Button variant="secondary" onClick={selection.clearSelection}>
              {selection.selectedCount} selected
            </Button>
          ) : null}
          <LogisticsLoadRefsButton onClick={loadRefs} />
          {branches.length >= 2 ? (
            <Button
              size="sm"
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
        </TableSearchToolbar>
        <DataTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                    aria-label="Select all transfers"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>No.</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
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
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>{t.transferNo}</TableCell>
                  <TableCell>
                    {t.fromBranch.name} → {t.toBranch.name}
                  </TableCell>
                  <TableCell>
                    <StatusCodeBadge code={t.statusCode.code} name={t.statusCode.name} />
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
          </Table>
        </DataTableScroll>
        <TablePagination
          meta={{
            total: transfers.total,
            page: transfers.page,
            totalPages: transfers.totalPages,
            itemLabel: "transfer",
          }}
          buildHref={(page) => buildLogisticsPageHref(LOGISTICS_TRANSFERS_PATH, page)}
        />
      </DataTableShell>

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
                  {pendingConfirm.action === "execute" ? (
                    <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                      {executeSerials.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No STK serials at source branch.</p>
                      ) : (
                        executeSerials.map((s) => (
                          <label key={s.id} className="flex items-center gap-2 text-sm">
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
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
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
