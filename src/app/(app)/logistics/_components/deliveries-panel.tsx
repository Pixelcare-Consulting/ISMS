"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  acceptDeliveryAction,
  rejectDeliveryAction,
} from "@/features/logistics/actions/logistics.actions";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { TableIndexCell, TableIndexHead } from "@/components/data-table";
import {
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { useTableSelection } from "@/components/data-table/use-table-selection";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import { GlobalDataTable, GlobalTableHead } from "@/lib/data-table";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  buildLogisticsPageHref,
  LOGISTICS_DELIVERIES_PATH,
} from "@/app/(app)/logistics/_components/logistics-paths";
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

interface DeliveryRow {
  id: string;
  deliveryNo: string;
  statusCode: StatusCodeRef;
  branch: { name: string };
  order: { orderNumber: string } | null;
}

interface DeliveriesPanelProps {
  deliveries: PaginatedList<DeliveryRow>;
}

type PendingConfirm = {
  id: string;
  deliveryNo: string;
  branchName: string;
  orderNumber?: string;
  action: "accept" | "reject";
};

export function DeliveriesPanel({ deliveries }: DeliveriesPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const pageSize = parseTablePageSize(deliveries.limit);

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(buildLogisticsPageHref(LOGISTICS_DELIVERIES_PATH, 1, limit));
  }

  const filtered = useMemo(
    () =>
      deliveries.items.filter((d) =>
        matchesTableSearch(query, [
          d.deliveryNo,
          d.branch.name,
          d.order?.orderNumber,
          d.statusCode.name,
          d.statusCode.code,
        ]),
      ),
    [deliveries.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        deliveries.items.map((d) => d.deliveryNo),
        deliveries.items.map((d) => d.branch.name),
        deliveries.items.map((d) => d.order?.orderNumber),
        deliveries.items.map((d) => d.statusCode.name),
        deliveries.items.map((d) => d.statusCode.code),
      ),
    [deliveries.items],
  );

  const selection = useTableSelection(filtered.map((d) => d.id));

  function confirmPendingAction() {
    if (!pendingConfirm) return;
    const { action, id } = pendingConfirm;
    startTransition(async () => {
      if (action === "accept") {
        await acceptDeliveryAction(id);
        toast.success("Delivery accepted — DIT moved to Stock");
      } else {
        await rejectDeliveryAction(id);
        toast.success("Delivery rejected");
      }
      setPendingConfirm(null);
      router.refresh();
    });
  }

  return (
    <>
      <GlobalDataTable
        stickyHeader
        scrollable
        search={{ value: query, onChange: setQuery, placeholder: "Search deliveries…", suggestions }}
        toolbarActions={
          selection.selectedCount > 0 ? (
            <Button variant="secondary" onClick={selection.clearSelection}>
              {selection.selectedCount} selected
            </Button>
          ) : null
        }
        pagination={{
          total: deliveries.total,
          page: deliveries.page,
          totalPages: deliveries.totalPages,
          itemLabel: "delivery",
          buildHref: (page) =>
            buildLogisticsPageHref(LOGISTICS_DELIVERIES_PATH, page, pageSize),
        }}
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
      >
            <TableHeader>
              <TableRow>
                <GlobalTableHead className="w-10">
                  <Checkbox
                    checked={selection.isAllSelected || (selection.isPartiallySelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                    aria-label="Select all deliveries"
                  />
                </GlobalTableHead>
                <TableIndexHead />
                <GlobalTableHead>No.</GlobalTableHead>
                <GlobalTableHead>Order</GlobalTableHead>
                <GlobalTableHead>Branch</GlobalTableHead>
                <GlobalTableHead>Status</GlobalTableHead>
                <GlobalTableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d, index) => (
                <TableRow key={d.id} data-state={selection.isRowSelected(d.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selection.isRowSelected(d.id)}
                      onCheckedChange={(checked) => selection.toggleRow(d.id, checked === true)}
                      aria-label={`Select delivery ${d.deliveryNo}`}
                    />
                  </TableCell>
                  <TableIndexCell
                    index={(deliveries.page - 1) * deliveries.limit + index + 1}
                  />
                  <TableCell>{d.deliveryNo}</TableCell>
                  <TableCell>{d.order?.orderNumber ?? "—"}</TableCell>
                  <TableCell>{d.branch.name}</TableCell>
                  <TableCell>
                    <StatusCodeBadge code={d.statusCode.code} name={d.statusCode.name} />
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {d.statusCode.code === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            setPendingConfirm({
                              id: d.id,
                              deliveryNo: d.deliveryNo,
                              branchName: d.branch.name,
                              orderNumber: d.order?.orderNumber,
                              action: "reject",
                            })
                          }
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={pending}
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() =>
                            setPendingConfirm({
                              id: d.id,
                              deliveryNo: d.deliveryNo,
                              branchName: d.branch.name,
                              orderNumber: d.order?.orderNumber,
                              action: "accept",
                            })
                          }
                        >
                          Accept DIT
                        </Button>
                      </>
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
            <AlertDialogTitle>
              {pendingConfirm?.action === "reject" ? "Reject delivery?" : "Accept delivery?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm ? (
                pendingConfirm.action === "reject" ? (
                  <>
                    Reject{" "}
                    <span className="font-medium text-foreground">
                      {pendingConfirm.deliveryNo}
                    </span>
                    {pendingConfirm.orderNumber ? (
                      <> (order {pendingConfirm.orderNumber})</>
                    ) : null}{" "}
                    at {pendingConfirm.branchName}. DIT inventory is unchanged.
                  </>
                ) : (
                  <>
                    Confirm acceptance of{" "}
                    <span className="font-medium text-foreground">
                      {pendingConfirm.deliveryNo}
                    </span>
                    {pendingConfirm.orderNumber ? (
                      <> (order {pendingConfirm.orderNumber})</>
                    ) : null}{" "}
                    at {pendingConfirm.branchName}. DIT inventory will move to Stock.
                  </>
                )
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className={
                pendingConfirm?.action === "reject"
                  ? undefined
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }
              onClick={(event) => {
                event.preventDefault();
                confirmPendingAction();
              }}
            >
              {pendingConfirm?.action === "reject" ? "Reject" : "Accept"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
