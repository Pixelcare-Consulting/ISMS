"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approveTransferAction,
  createTransferAction,
  executeTransferAction,
  receiveTransferAction,
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
  fromBranch: { name: string };
  toBranch: { name: string };
}

interface TransfersPanelProps {
  transfers: PaginatedList<TransferRow>;
}

type PendingConfirm = {
  id: string;
  transferNo: string;
  route: string;
  action: "approve" | "execute" | "receive";
};

export function TransfersPanel({ transfers }: TransfersPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const { branches, loadRefs } = useLogisticsRefs();
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

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

  function confirmPendingAction() {
    if (!pendingConfirm) return;
    startTransition(async () => {
      if (pendingConfirm.action === "approve") {
        await approveTransferAction(pendingConfirm.id);
        toast.success("Transfer endorsed by TL");
      } else if (pendingConfirm.action === "execute") {
        await executeTransferAction(pendingConfirm.id);
        toast.success("Transfer dispatched — in transit");
      } else {
        await receiveTransferAction(pendingConfirm.id);
        toast.success("Transfer received — stock updated");
      }
      setPendingConfirm(null);
      router.refresh();
    });
  }

  const confirmTitle =
    pendingConfirm?.action === "approve"
      ? "Approve transfer?"
      : pendingConfirm?.action === "execute"
        ? "Execute transfer?"
        : "Receive transfer?";

  const confirmDescription =
    pendingConfirm?.action === "approve"
      ? "Team Lead approval routes the request to the releasing branch."
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
                <TableHead>No.</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.transferNo}</TableCell>
                  <TableCell>
                    {t.fromBranch.name} → {t.toBranch.name}
                  </TableCell>
                  <TableCell>
                    <StatusCodeBadge code={t.statusCode.code} name={t.statusCode.name} />
                  </TableCell>
                  <TableCell className="space-x-2">
                    {t.statusCode.code === "pending_tl" ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        className="bg-amber-600 text-white hover:bg-amber-700"
                        onClick={() =>
                          setPendingConfirm({
                            id: t.id,
                            transferNo: t.transferNo,
                            route: `${t.fromBranch.name} → ${t.toBranch.name}`,
                            action: "approve",
                          })
                        }
                      >
                        TL approve
                      </Button>
                    ) : null}
                    {t.statusCode.code === "for_transfer" ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          setPendingConfirm({
                            id: t.id,
                            transferNo: t.transferNo,
                            route: `${t.fromBranch.name} → ${t.toBranch.name}`,
                            action: "execute",
                          })
                        }
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
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
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
