"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { TransferRequestDialog } from "@/app/(app)/logistics/_components/transfer-request-dialog";
import {
  approveTransferAction,
  createTransferAction,
  rejectTransferAction,
} from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
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
import {
  buildLogisticsPageHref,
  LOGISTICS_TRANSFERS_PATH,
} from "@/app/(app)/logistics/_components/logistics-paths";
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
  capabilities: LogisticsActionCapabilities;
  initialSort?: string;
  initialSortDir?: string;
}

type TransferSortField = "transferNo" | "fromBranch" | "toBranch" | "status";
type TransferSortDir = "asc" | "desc";

type PendingConfirm = {
  id: string;
  transferNo: string;
  route: string;
  action: "approve" | "reject";
};

export function TransfersPanel({
  transfers,
  capabilities,
  initialSort = "",
  initialSortDir = "desc",
}: TransfersPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
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

  function confirmPendingAction() {
    if (!pendingConfirm) return;
    startTransition(async () => {
      const result =
        pendingConfirm.action === "approve"
          ? await approveTransferAction(pendingConfirm.id)
          : await rejectTransferAction(pendingConfirm.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(pendingConfirm.action === "approve" ? "Transfer approved" : "Transfer rejected");
      setPendingConfirm(null);
      router.refresh();
    });
  }

  const confirmTitle = pendingConfirm?.action === "reject" ? "Reject transfer?" : "Approve transfer?";
  const confirmDescription =
    pendingConfirm?.action === "reject"
      ? "Rejected requests release only the units reserved on this transfer."
      : "Team Lead approval keeps the units reserved and sends the request to the releasing branch. Stock at the receiving branch does not increase.";

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
          {capabilities.canCreate ? (
            <Button
              size="sm"
              className="w-full sm:w-auto"
              disabled={pending}
              onClick={() => setCreateOpen(true)}
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
                  <TableCell>
                    <Link href={`/logistics/transfers/${t.id}`} className="font-medium hover:underline">
                      {t.transferNo}
                    </Link>
                  </TableCell>
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
                    {["requested", "pending_tl"].includes(t.statusCode.code) &&
                    capabilities.canApproveTl ? (
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
                    {["requested", "pending_tl"].includes(t.statusCode.code) &&
                    capabilities.canRejectTransfer ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          setPendingConfirm({
                            id: t.id,
                            transferNo: t.transferNo,
                            route: `${t.fromBranch.name} → ${t.toBranch.name}`,
                            action: "reject",
                          })
                        }
                      >
                        Reject
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/logistics/transfers/${t.id}`}>Open</Link>
                    </Button>
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
      <TransferRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={createTransferAction}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
