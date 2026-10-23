"use client";

import { createColumnHelper, type RowSelectionState } from "@tanstack/react-table";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { useOrdersCreateWorkspace } from "@/app/(app)/orders/_components/orders-create-workspace-context";
import {
  adminBulkCancelOrdersAction,
  approveOrderAction,
  deleteDraftOrderAction,
  rejectOrderAction,
  submitDraftOrderAction,
} from "@/features/orders/actions/order.actions";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";
import {
  canApproveOrder,
  canEditOrderLines,
  isOrderPendingApproval,
  isSuperAdminOrderOverride,
} from "@/features/orders/constants/order-workflow";
import { OrderDetailsDialog } from "@/app/(app)/orders/_components/order-details-dialog";
import { SuggestedOrdersDialog } from "@/app/(app)/orders/_components/suggested-orders-dialog";
import { OrderWorkflowDialog } from "@/app/(app)/orders/_components/order-workflow-dialog";
import {
  EditOrderDialog,
  type EditableOrder,
} from "@/app/(app)/orders/_components/edit-order-dialog";
import { Button } from "@/components/ui/button";
import { BRANCH_ORDER_STATUS_LABELS } from "@/features/orders/constants/order-status";
import { OrderTypeBadge } from "@/features/orders/components/order-type-badge";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTablePageSize,
  type TablePageSize,
} from "@/components/data-table/table-page-size";
import { uniqueSearchSuggestions } from "@/components/data-table/table-search-bar";
import {
  DataTable,
  nextTableSort,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { DeleteConfirmDialog } from "@/components/data-table/delete-confirm-dialog";
import { LoadingModal } from "@/components/ui/loading-modal";
import {
  formatOrderModeOfPayment,
  formatOrderSapDocument,
  type OrderSapDocType,
} from "@/features/orders/constants/order-sap-doc-type";
import { matchesTableSearch } from "@/utils/match-table-search";

interface OrderRow {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  branchId: string;
  brandId?: string | null;
  notes?: string | null;
  spaRemarks?: string | null;
  updatedAt?: string | Date | null;
  reviewSnapshot?: unknown;
  reviewSnapshotAt?: string | Date | null;
  sapDocType?: OrderSapDocType | null;
  sapDocNum?: number | null;
  deliveryDueDate?: string | Date | null;
  modeOfPayment?: { name: string } | null;
  branch: {
    name: string;
    deliverySchedule?: unknown;
    dealer?: { modeOfPayment: { name: string } | null } | null;
  };
  createdBy: { name: string | null; email: string };
  details: {
    id: string;
    quantity: number;
    approvedQty?: number | null;
    remarks?: string | null;
    spRemarks?: string | null;
    model: { id: string; skuCode: string; name?: string; brandId?: string | null };
  }[];
  approvalLevels?: {
    level: number;
    roleSlug: string;
    approvedAt?: string | Date | null;
    rejectedAt?: string | Date | null;
    comment?: string | null;
    approvedBy?: { name: string | null; email: string } | null;
  }[];
}

const orderColumn = createColumnHelper<DataTableFeatures, OrderRow>();

type OrderSortField = "orderNumber" | "branch" | "orderType" | "status";
type OrderSortDir = "asc" | "desc";

interface OrdersTableProps {
  result: {
    items: OrderRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  viewerRoleSlugs: string[];
  canEdit?: boolean;
  /** When set, list is type-scoped and create dialog locks this type. */
  fixedOrderType?: BranchOrderType;
  /** Base path for pagination links (defaults to `/orders`). */
  basePath?: string;
  initialSort?: string;
  initialSortDir?: string;
}

const ORDER_APPROVE_FEED = [
  { atSecond: 0, label: "Recording approval", hint: "Saving your decision to the order." },
  { atSecond: 1, label: "Updating workflow status", hint: "Applying the next step in the chain." },
  { atSecond: 2, label: "Syncing logistics queue", hint: "Preparing fulfillment handoff when applicable." },
  { atSecond: 3, label: "Refreshing orders list" },
] as const;

const ORDER_REJECT_FEED = [
  { atSecond: 0, label: "Recording rejection", hint: "Saving your comment and status." },
  { atSecond: 1, label: "Updating order record" },
  { atSecond: 2, label: "Refreshing orders list" },
] as const;

/** Keep loading modal open until feed steps can play out (even if API is fast). */
function getMinLoadingDurationMs(feed: readonly { atSecond: number }[]): number {
  const lastAt = feed.reduce((max, item) => Math.max(max, item.atSecond), 0);
  return (lastAt + 2) * 1000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildOrdersHref(
  basePath: string,
  page: number,
  limit: number,
  sort?: string,
  sortDir?: string,
): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (limit !== DEFAULT_TABLE_PAGE_SIZE) params.set("limit", String(limit));
  if (sort) params.set("sort", sort);
  if (sort && sortDir) params.set("dir", sortDir);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function buildOrdersHrefWithTab(
  basePath: string,
  page: number,
  limit: number,
  sort?: string,
  sortDir?: string,
  tab?: string | null,
): string {
  const href = buildOrdersHref(basePath, page, limit, sort, sortDir);
  if (!tab || tab === "orders") return href;
  const join = href.includes("?") ? "&" : "?";
  return `${href}${join}tab=${tab}`;
}

export function OrdersTable({
  result,
  viewerRoleSlugs,
  canEdit = false,
  fixedOrderType,
  basePath = "/orders",
  initialSort = "",
  initialSortDir = "desc",
}: OrdersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [workflowOrder, setWorkflowOrder] = useState<OrderRow | null>(null);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<EditableOrder | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<OrderRow | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [processingAction, setProcessingAction] = useState<"approve" | "reject" | null>(
    null,
  );
  const createWorkspace = useOrdersCreateWorkspace();
  const pageSize = parseTablePageSize(result.limit);
  const pageTab = searchParams.get("tab");
  const sort = (searchParams.get("sort") ?? initialSort) || "";
  const sortDir = (
    (searchParams.get("dir") ?? initialSortDir) === "asc" ? "asc" : "desc"
  ) as OrderSortDir;

  function handlePageSizeChange(limit: TablePageSize) {
    router.push(
      buildOrdersHrefWithTab(basePath, 1, limit, sort, sort ? sortDir : undefined, pageTab),
    );
  }

  function toggleSort(field: OrderSortField) {
    const next = nextTableSort(field, sort, sortDir);
    router.push(
      buildOrdersHrefWithTab(basePath, 1, pageSize, next.sort, next.dir, pageTab),
    );
  }

  const filtered = useMemo(
    () =>
      result.items.filter((o) =>
        matchesTableSearch(query, [o.id, o.orderNumber, o.branch.name, o.status]),
      ),
    [result.items, query],
  );

  const suggestions = useMemo(
    () =>
      uniqueSearchSuggestions(
        result.items.map((o) => o.orderNumber),
        result.items.map((o) => o.branch.name),
        result.items.map((o) => o.status),
      ),
    [result.items],
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const detailsOrder = useMemo(
    () => result.items.find((item) => item.id === detailsOrderId) ?? null,
    [detailsOrderId, result.items],
  );
  const canSuperAdminBulkCancel = isSuperAdminOrderOverride(viewerRoleSlugs);
  const selectedOrderIds = useMemo(
    () => filtered.map((order) => order.id).filter((id) => rowSelection[id]),
    [filtered, rowSelection],
  );
  const selectedCount = selectedOrderIds.length;

  function handleApprove(input?: {
    comment?: string;
    lineAdjustments?: {
      detailId: string;
      approvedQty: number;
      spRemarks?: string | null;
    }[];
    deliveryDueDate?: string;
    expectedUpdatedAt?: string;
    reviewSnapshot?: {
      kind: "order-review-snapshot";
      version: 1;
    };
  }) {
    if (!workflowOrder) return;
    setProcessingAction("approve");
    startTransition(async () => {
      const feed = ORDER_APPROVE_FEED;
      const minMs = getMinLoadingDurationMs(feed);
      const started = Date.now();
      const result = await approveOrderAction(workflowOrder.id, input);
      const waitMs = minMs - (Date.now() - started);
      if (waitMs > 0) await delay(waitMs);
      setProcessingAction(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Approval recorded");
      setWorkflowOrder(null);
      router.refresh();
    });
  }

  function handleReject(comment?: string) {
    if (!workflowOrder) return;
    setProcessingAction("reject");
    startTransition(async () => {
      const feed = ORDER_REJECT_FEED;
      const minMs = getMinLoadingDurationMs(feed);
      const started = Date.now();
      const result = await rejectOrderAction(workflowOrder.id, comment);
      const waitMs = minMs - (Date.now() - started);
      if (waitMs > 0) await delay(waitMs);
      setProcessingAction(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Order rejected");
      setWorkflowOrder(null);
      router.refresh();
    });
  }

  const columns = useMemo(() => {
    const cols: DataTableColumn<OrderRow>[] = [
      orderColumn.display({
        id: "index",
        header: "#",
        enableSorting: false,
        cell: ({ row }) => row.index + 1,
        meta: { className: "tabular-nums text-muted-foreground" },
      }),
      orderColumn.accessor((row) => row.orderNumber, {
        id: "orderNumber",
        header: "Order #",
        enableSorting: true,
        meta: { className: "font-mono" },
      }),
      orderColumn.accessor((row) => row.branch.name, {
        id: "branch",
        header: "Branch",
        enableSorting: true,
      }),
      orderColumn.display({
        id: "orderType",
        header: "Type",
        enableSorting: true,
        cell: ({ row }) => <OrderTypeBadge orderType={row.original.orderType} />,
      }),
      orderColumn.display({
        id: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => (
          <StatusCodeBadge
            code={row.original.status}
            name={
              BRANCH_ORDER_STATUS_LABELS[row.original.status as BranchOrderStatus] ??
              row.original.status
            }
          />
        ),
      }),
      orderColumn.display({
        id: "sapDocument",
        header: "SAP document",
        enableSorting: false,
        cell: ({ row }) =>
          formatOrderSapDocument({
            sapDocType: row.original.sapDocType ?? null,
            sapDocNum: row.original.sapDocNum ?? null,
          }),
      }),
      orderColumn.display({
        id: "lines",
        header: "Lines",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.details
            .map((detail) => `${detail.model.skuCode}×${detail.quantity}`)
            .join(", "),
      }),
      orderColumn.display({
        id: "actions",
        header: "Actions",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const order = row.original;
          return (
            <div className="flex justify-end gap-2">
              {isOrderPendingApproval(order.status as BranchOrderStatus) ? (
                <OrderReviewButton
                  order={order}
                  viewerRoleSlugs={viewerRoleSlugs}
                  onReview={() => setWorkflowOrder(order)}
                />
              ) : null}
              {canEdit && order.status === "draft" ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await submitDraftOrderAction(order.id);
                      if ("error" in result && result.error) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Submitted for review", {
                        description: draftSubmitDescription(order.orderType),
                      });
                      router.refresh();
                    });
                  }}
                >
                  Submit for review
                </Button>
              ) : null}
              {canEdit && order.status === "draft" ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => setDraftToDelete(order)}
                >
                  Delete
                </Button>
              ) : null}
              {canEditOrderLines({
                status: order.status as BranchOrderStatus,
                orderType: order.orderType as BranchOrderType,
                roleSlugs: viewerRoleSlugs,
                hasCreatePermission: canEdit,
              }) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditingOrder({
                      id: order.id,
                      orderNumber: order.orderNumber,
                      branchId: order.branchId,
                      branchName: order.branch.name,
                      orderType: order.orderType as EditableOrder["orderType"],
                      lines: order.details.map((detail) => ({
                        modelId: detail.model.id,
                        skuCode: detail.model.skuCode,
                        quantity: detail.quantity,
                      })),
                    })
                  }
                >
                  Edit
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setDetailsOrderId(order.id)}>
                View details
              </Button>
            </div>
          );
        },
      }),
    ];
    return cols;
  }, [canEdit, pending, router, viewerRoleSlugs]);

  return (
    <>
      <DataTable
        data={filtered}
        columns={columns}
        getRowId={(row) => row.id}
        manualSorting
        manualPagination
        enableSorting
        sorting={{
          sortKey: sort,
          sortDir,
          onSort: (columnId) => toggleSort(columnId as OrderSortField),
        }}
        // Selection only feeds Super Admin bulk cancel; other roles have nothing to do with it.
        enableRowSelection={canSuperAdminBulkCancel}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        selectAllLabel="Select all orders"
        getSelectionLabel={(row) => `Select order ${row.orderNumber}`}
        stickyHeader
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search orders…",
          suggestions,
        }}
        pageSize={{ value: pageSize, onChange: handlePageSizeChange }}
        toolbarActions={
          <>
            {selectedCount > 0 ? (
              <>
                <Button variant="secondary" onClick={() => setRowSelection({})}>
                  {selectedCount} selected
                </Button>
                {canSuperAdminBulkCancel ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => setBulkCancelOpen(true)}
                  >
                    Cancel selected
                  </Button>
                ) : null}
              </>
            ) : null}
            {canEdit && fixedOrderType ? (
              <Button type="button" variant="outline" onClick={() => setSuggestionsOpen(true)}>
                Suggested orders
              </Button>
            ) : null}
            {canEdit && fixedOrderType !== "auto_replenish" ? (
              <Button onClick={() => createWorkspace.openCreate()}>Create order</Button>
            ) : null}
          </>
        }
        pagination={{
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          itemLabel: "order",
          buildHref: (page) =>
            buildOrdersHrefWithTab(
              basePath,
              page,
              pageSize,
              sort,
              sort ? sortDir : undefined,
              pageTab,
            ),
        }}
        empty={filtered.length === 0}
        emptyMessage={
          query.trim() ? "No orders match your search." : "No orders."
        }
      />
      {detailsOrder ? (
        <OrderDetailsDialog
          orderId={detailsOrder.id}
          orderNumber={detailsOrder.orderNumber}
          orderType={detailsOrder.orderType as BranchOrderType}
          branchId={detailsOrder.branchId}
          branchName={detailsOrder.branch.name}
          status={detailsOrder.status as BranchOrderStatus}
          notes={detailsOrder.notes}
          deliveryDueDate={detailsOrder.deliveryDueDate}
          createdByName={detailsOrder.createdBy.name ?? detailsOrder.createdBy.email}
          reviewSnapshot={detailsOrder.reviewSnapshot}
          reviewSnapshotAt={detailsOrder.reviewSnapshotAt}
          sapDocType={detailsOrder.sapDocType}
          sapDocNum={detailsOrder.sapDocNum}
          modeOfPaymentLabel={formatOrderModeOfPayment({
            orderModeOfPayment: detailsOrder.modeOfPayment?.name ?? null,
            dealerModeOfPayment: detailsOrder.branch.dealer?.modeOfPayment?.name ?? null,
          })}
          lines={detailsOrder.details.map((d) => ({
            detailId: d.id,
            modelId: d.model.id,
            skuCode: d.model.skuCode,
            name: d.model.name,
            quantity: d.quantity,
            approvedQty: d.approvedQty,
            remarks: d.remarks,
            spRemarks: d.spRemarks,
          }))}
          approvalLevels={detailsOrder.approvalLevels}
          roleSlugs={viewerRoleSlugs}
          hasCreatePermission={canEdit}
          open
          onOpenChange={(open) => {
            if (!open) setDetailsOrderId(null);
          }}
        />
      ) : null}
      {workflowOrder ? (
        <OrderWorkflowDialog
          orderId={workflowOrder.id}
          orderNumber={workflowOrder.orderNumber}
          orderType={workflowOrder.orderType as "auto_replenish" | "manual" | "special"}
          branchId={workflowOrder.branchId}
          branchName={workflowOrder.branch.name}
          updatedAt={workflowOrder.updatedAt}
          deliverySchedule={workflowOrder.branch.deliverySchedule}
          lines={workflowOrder.details.map((d) => ({
            detailId: d.id,
            modelId: d.model.id,
            skuCode: d.model.skuCode,
            quantity: d.quantity,
            remarks: d.remarks,
            spRemarks: d.spRemarks,
          }))}
          approvalLevels={workflowOrder.approvalLevels}
          status={workflowOrder.status as BranchOrderStatus}
          open
          pending={pending}
          onOpenChange={() => setWorkflowOrder(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ) : null}
      {editingOrder ? (
        <EditOrderDialog order={editingOrder} onClose={() => setEditingOrder(null)} />
      ) : null}
      {draftToDelete ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDraftToDelete(null);
          }}
          title="Delete draft order"
          description={`Discard unsubmitted draft ${draftToDelete.orderNumber}? This cannot be undone. Orders already submitted for review cannot be deleted — use Review to reject or cancel instead.`}
          pending={pending}
          confirmLabel="Discard draft"
          onConfirm={() => {
            const orderId = draftToDelete.id;
            startTransition(async () => {
              const result = await deleteDraftOrderAction(orderId);
              if ("error" in result && result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Draft discarded");
              setDraftToDelete(null);
              router.refresh();
            });
          }}
        />
      ) : null}
      {bulkCancelOpen ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !pending) setBulkCancelOpen(false);
          }}
          title="Cancel selected orders?"
          description={`This applies to ${selectedCount} selected order${selectedCount === 1 ? "" : "s"}. Unsubmitted drafts are discarded permanently. Pending orders are marked Cancelled and move to Order History. Approved, rejected, cancelled, or delivery-linked orders are skipped.`}
          pending={pending}
          confirmLabel="Cancel selected"
          onConfirm={() => {
            const orderIds = selectedOrderIds;
            if (orderIds.length === 0) return;
            startTransition(async () => {
              const result = await adminBulkCancelOrdersAction(orderIds);
              if (!("success" in result)) {
                toast.error(result.error);
                return;
              }
              const parts: string[] = [];
              if (result.discarded > 0) {
                parts.push(
                  `Discarded ${result.discarded} draft${result.discarded === 1 ? "" : "s"}`,
                );
              }
              if (result.cancelled > 0) {
                parts.push(
                  `Cancelled ${result.cancelled} order${result.cancelled === 1 ? "" : "s"}`,
                );
              }
              const summary = parts.join("; ");
              if (result.skipped.length > 0) {
                const skipDetail = result.skipped
                  .slice(0, 3)
                  .map((s) => `${s.orderNumber}: ${s.reason}`)
                  .join(" · ");
                const more =
                  result.skipped.length > 3
                    ? ` (+${result.skipped.length - 3} more)`
                    : "";
                toast.success(summary, {
                  description: `Skipped: ${skipDetail}${more}`,
                });
              } else {
                toast.success(summary);
              }
              setBulkCancelOpen(false);
              setRowSelection({});
              router.refresh();
            });
          }}
        />
      ) : null}
      {suggestionsOpen && fixedOrderType ? (
        <SuggestedOrdersDialog
          orderType={fixedOrderType}
          onClose={() => setSuggestionsOpen(false)}
        />
      ) : null}
      <LoadingModal
        open={pending && processingAction !== null}
        title={
          processingAction === "reject" ? "Rejecting order" : "Processing approval"
        }
        description="Please wait while the order is saved."
        feedItems={
          processingAction === "reject" ? [...ORDER_REJECT_FEED] : [...ORDER_APPROVE_FEED]
        }
      />
    </>
  );
}

interface OrderReviewButtonProps {
  order: OrderRow;
  viewerRoleSlugs: string[];
  onReview: () => void;
}

function draftSubmitDescription(orderType: string): string {
  if (orderType === "auto_replenish") {
    return "Team Leader can review this order now.";
  }
  return "Supply Planning can review this order now.";
}

function OrderReviewButton({ order, viewerRoleSlugs, onReview }: OrderReviewButtonProps) {
  const status = order.status as BranchOrderStatus;
  const orderType = order.orderType as BranchOrderType;
  if (!canApproveOrder(status, orderType, viewerRoleSlugs)) {
    return null;
  }

  return (
    <Button size="sm" variant="outline" onClick={onReview}>
      Review
    </Button>
  );
}

