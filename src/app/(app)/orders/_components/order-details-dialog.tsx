"use client";

import { useMemo, useState } from "react";

import { EditOrderDialog } from "@/app/(app)/orders/_components/edit-order-dialog";
import { OrderAnalyticsDialog } from "@/app/(app)/orders/_components/order-analytics-dialog";
import { OrderApprovalTimeline } from "@/app/(app)/orders/_components/order-approval-timeline";
import { OrderWorksheet } from "@/app/(app)/orders/_components/order-worksheet";
import { useOrderWorksheet } from "@/app/(app)/orders/_components/use-order-worksheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import {
  formatOrderSapDocument,
  type OrderSapDocType,
} from "@/features/orders/constants/order-sap-doc-type";
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import {
  canEditOrderLines,
  getCurrentApproverLabel,
} from "@/features/orders/constants/order-workflow";
import { worksheetSummaryMode } from "@/features/orders/lib/order-review-snapshot";
import { worksheetLinesOnOrder } from "@/features/orders/lib/order-create-details";
import { draftsForOrderLines } from "@/features/orders/lib/order-worksheet-rows";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

export interface OrderDetailsLine {
  detailId: string;
  modelId: string;
  skuCode: string;
  name?: string;  
  quantity: number;
  approvedQty?: number | null;
  remarks?: string | null;
  spRemarks?: string | null;
}

export interface OrderDetailsApproval {
  level: number;
  roleSlug: string;
  approvedAt?: string | Date | null;
  rejectedAt?: string | Date | null;
  comment?: string | null;
  approvedBy?: { name: string | null; email: string } | null;
}

interface OrderDetailsDialogProps {
  orderId: string;
  orderNumber: string;
  orderType: BranchOrderType;
  branchId: string;
  branchName: string;
  status: BranchOrderStatus;
  notes?: string | null;
  deliveryDueDate?: string | Date | null;
  createdByName?: string | null;
  reviewSnapshot?: unknown;
  reviewSnapshotAt?: string | Date | null;
  sapDocType?: OrderSapDocType | null;
  sapDocNum?: number | null;
  /** Shown as given; build it with formatOrderModeOfPayment. */
  modeOfPaymentLabel?: string | null;
  lines: OrderDetailsLine[];
  approvalLevels?: OrderDetailsApproval[];
  roleSlugs?: string[];
  hasCreatePermission?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatOptionalDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OrderDetailsDialog({
  orderId,
  orderNumber,
  orderType,
  branchId,
  branchName,
  status,
  notes,
  deliveryDueDate,
  createdByName,
  reviewSnapshot,
  reviewSnapshotAt,
  sapDocType = null,
  modeOfPaymentLabel = null,
  sapDocNum = null,
  lines,
  approvalLevels = [],
  roleSlugs = [],
  hasCreatePermission = false,
  open,
  onOpenChange,
}: OrderDetailsDialogProps) {
  const [editing, setEditing] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const modelIds = useMemo(() => lines.map((line) => line.modelId), [lines]);
  const worksheet = useOrderWorksheet({
    enabled: open,
    branchId,
    orderType,
    existingModelIds: modelIds,
    excludeOrderId: orderId,
  });
  const orderModelIds = useMemo(() => new Set(lines.map((line) => line.modelId)), [lines]);
  const orderSheetLines = useMemo(
    () => worksheetLinesOnOrder(worksheet.payload?.lines ?? [], orderModelIds),
    [orderModelIds, worksheet.payload],
  );
  const drafts = useMemo(() => {
    if (!worksheet.payload) return {};
    return draftsForOrderLines(orderSheetLines, lines.map((line) => ({
        modelId: line.modelId,
        quantity: line.quantity,
        remarks: line.remarks,
        spRemarks: line.spRemarks,
        approvedQty: line.approvedQty,
      })),
    );
  }, [lines, orderSheetLines, worksheet.payload]);
  const planByModel = useMemo(() => {
    const map = new Map<string, { qty: number | null; unavailable: boolean }>();
    for (const line of worksheet.payload?.lines ?? []) {
      map.set(line.modelId, {
        qty: line.sugQty,
        unavailable: line.sugQty == null,
      });
    }
    return map;
  }, [worksheet.payload]);
  const summaryChoice = worksheetSummaryMode(status, reviewSnapshot);
  const currentApprover = getCurrentApproverLabel(status, orderType);
  const deliveryDueLabel = formatOptionalDate(deliveryDueDate);
  const snapshotAtLabel = formatOptionalDate(reviewSnapshotAt);
  const showApprovedQty =
    status === "approved" || lines.some((line) => line.approvedQty != null);
  const showEdit = canEditOrderLines({
    status,
    orderType,
    roleSlugs,
    hasCreatePermission,
  });

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEditing(false);
      setAnalyticsOpen(false);
    }
    onOpenChange(nextOpen);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-w-90rem flex-col gap-0 overflow-hidden p-0 sm:max-w-[90rem] sm:p-0">
          <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
            <DialogTitle>Order details {orderNumber}</DialogTitle>
            <DialogDescription className="max-w-3xl">
              Read-only view of the worksheet, notes, and approval history.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto xl:flex-row xl:overflow-hidden">
            <aside className="flex w-full shrink-0 flex-col gap-4 border-b px-4 py-4 sm:px-6 xl:w-80 xl:overflow-y-auto xl:border-b-0 xl:border-r xl:px-5">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-sm">
                <dt className="whitespace-nowrap text-muted-foreground">Type</dt>
                <dd className="min-w-0 break-words">
                  {BRANCH_ORDER_TYPE_LABELS[orderType] ?? orderType}
                </dd>
                <dt className="whitespace-nowrap text-muted-foreground">Branch</dt>
                <dd className="min-w-0 break-words">{branchName}</dd>
                <dt className="whitespace-nowrap text-muted-foreground">Status</dt>
                <dd className="min-w-0">
                  <OrderStatusBadge status={status} />
                </dd>
                {modeOfPaymentLabel ? (
                  <>
                    <dt className="whitespace-nowrap text-muted-foreground">Mode of payment</dt>
                    <dd className="min-w-0 break-words">{modeOfPaymentLabel}</dd>
                  </>
                ) : null}
                <dt className="whitespace-nowrap text-muted-foreground">SAP document</dt>
                <dd className="min-w-0 break-words">
                  {formatOrderSapDocument({ sapDocType, sapDocNum })}
                </dd>
                <dt className="whitespace-nowrap text-muted-foreground">Created by</dt>
                <dd className="min-w-0 break-words">{createdByName?.trim() || "—"}</dd>
                <dt className="whitespace-nowrap text-muted-foreground">Next approver</dt>
                <dd className="min-w-0 break-words">{currentApprover || "—"}</dd>
              </dl>
              {deliveryDueLabel ? (
                <div className="space-y-1.5">
                  <Label htmlFor="order-details-delivery-due">Delivery due date</Label>
                  <p id="order-details-delivery-due" className="text-sm break-words">
                    {deliveryDueLabel}
                  </p>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="order-details-notes">Order notes</Label>
                <Textarea
                  id="order-details-notes"
                  readOnly
                  value={notes?.trim() ?? ""}
                  placeholder="No order notes."
                  rows={4}
                  className="min-h-24 resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-details-history">Approval history</Label>
                <OrderApprovalTimeline
                  id="order-details-history"
                  orderType={orderType}
                  levels={approvalLevels}
                />
              </div>
              {worksheet.error ? (
                <div className="space-y-1.5">
                  <Label htmlFor="order-details-line-notes">Line notes</Label>
                  <ul
                    id="order-details-line-notes"
                    className="max-h-40 space-y-3 overflow-y-auto rounded-md border border-input px-3 py-2 text-sm shadow-sm"
                  >
                    {lines.map((line) => (
                      <li key={line.detailId}>
                        <p className="font-medium">{line.skuCode}</p>
                        <p className="mt-1 break-words whitespace-pre-wrap text-muted-foreground">
                          Note: {line.remarks?.trim() || "—"}
                        </p>
                        <p className="mt-1 break-words whitespace-pre-wrap text-muted-foreground">
                          SP note: {line.spRemarks?.trim() || "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
            <div className="flex min-h-[24rem] min-w-0 flex-1 flex-col px-4 py-3 sm:px-6 xl:min-h-0 xl:overflow-hidden">
              <OrderWorksheet
                lines={orderSheetLines}
                brands={worksheet.payload?.brands ?? []}
                drafts={drafts}
                mode="view"
                orderType={orderType}
                loading={worksheet.loading}
                error={worksheet.error}
                summary={worksheet.payload?.summary ?? null}
                summaryMode={summaryChoice.mode}
                snapshot={summaryChoice.snapshot}
                snapshotAtLabel={snapshotAtLabel}
                showApprovedQty={showApprovedQty}
                approvedQtyEditable={false}
                showSpRemarks
                spRemarksEditable={false}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t px-4 py-4 sm:justify-end sm:px-6">
            {showEdit ? (
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setAnalyticsOpen(true)}>
              Order analytics
            </Button>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {showEdit && editing ? (
        <EditOrderDialog
          stacked
          order={{
            id: orderId,
            orderNumber,
            branchId,
            branchName,
            orderType,
            lines: lines.map((line) => ({
              modelId: line.modelId,
              skuCode: line.skuCode,
              quantity: line.quantity,
            })),
          }}
          onClose={() => setEditing(false)}
        />
      ) : null}
      <OrderAnalyticsDialog
        open={analyticsOpen}
        onOpenChange={setAnalyticsOpen}
        branchId={branchId}
        branchName={branchName}
        orderType={orderType}
        planByModel={planByModel}
      />
    </>
  );
}
