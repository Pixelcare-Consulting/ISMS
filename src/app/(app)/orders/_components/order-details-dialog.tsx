"use client";

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
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import {
  getCurrentApproverLabel,
  getOrderApprovalChain,
} from "@/features/orders/constants/order-workflow";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

export interface OrderDetailsLine {
  detailId: string;
  skuCode: string;
  quantity: number;
  approvedQty?: number | null;
  remarks?: string | null;
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
  orderNumber: string;
  orderType: BranchOrderType;
  branchName: string;
  status: BranchOrderStatus;
  notes?: string | null;
  deliveryDueDate?: string | Date | null;
  createdByName?: string | null;
  lines: OrderDetailsLine[];
  approvalLevels?: OrderDetailsApproval[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_LABELS: Record<string, string> = {
  ps: "Product Specialist",
  tl: "Team Leader",
  sp: "Supply Planning",
  spa: "Supply Planning",
  logistics: "Logistics",
};

function formatOptionalDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function roleLabelForApproval(
  roleSlug: string,
  orderType: BranchOrderType,
  level: number,
): string {
  const chainStep = getOrderApprovalChain(orderType).find((step) => step.level === level);
  if (chainStep) return chainStep.label;
  return ROLE_LABELS[roleSlug] ?? roleSlug;
}

function actorNameForApproval(level: OrderDetailsApproval): string | null {
  const name = level.approvedBy?.name?.trim();
  if (name) return name;
  const email = level.approvedBy?.email?.trim();
  return email || null;
}

function approvalOutcome(level: OrderDetailsApproval): "approved" | "rejected" | "pending" {
  if (level.rejectedAt) return "rejected";
  if (level.approvedAt) return "approved";
  return "pending";
}

export function OrderDetailsDialog({
  orderNumber,
  orderType,
  branchName,
  status,
  notes,
  deliveryDueDate,
  createdByName,
  lines,
  approvalLevels = [],
  open,
  onOpenChange,
}: OrderDetailsDialogProps) {
  const currentApprover = getCurrentApproverLabel(status, orderType);
  const totalLines = lines.length;
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const hasApprovedQty = lines.some((line) => line.approvedQty != null);
  const deliveryDueLabel = formatOptionalDate(deliveryDueDate);
  const historyWithActivity = approvalLevels.filter(
    (level) => level.approvedAt || level.rejectedAt || level.comment,
  );
  const lineRemarks = lines.filter((line) => line.remarks?.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Order details {orderNumber}</DialogTitle>
          <DialogDescription>
            Read-only view of order details, lines, and remarks.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[calc(90svh-9.5rem)] min-h-0 gap-4 overflow-hidden md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="min-h-0 space-y-4 overflow-y-auto pl-1 pr-2">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Type</dt>
                <dd>{BRANCH_ORDER_TYPE_LABELS[orderType] ?? orderType}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Branch</dt>
                <dd>{branchName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <OrderStatusBadge status={status} />
                </dd>
              </div>
              {createdByName ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Created by</dt>
                  <dd>{createdByName}</dd>
                </div>
              ) : null}
              {currentApprover ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Approver</dt>
                  <dd>{currentApprover}</dd>
                </div>
              ) : null}
              {deliveryDueLabel ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Delivery due</dt>
                  <dd>{deliveryDueLabel}</dd>
                </div>
              ) : null}
            </dl>

            <div className="space-y-2">
              <Label>Order notes</Label>
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
                {notes?.trim() ? notes : "No order notes."}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Approval history</Label>
              {historyWithActivity.length === 0 ? (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  No approval comments yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {historyWithActivity.map((level) => {
                    const outcome = approvalOutcome(level);
                    const when =
                      formatOptionalDate(level.rejectedAt) ??
                      formatOptionalDate(level.approvedAt);
                    const actorName = actorNameForApproval(level);
                    const roleLabel = roleLabelForApproval(
                      level.roleSlug,
                      orderType,
                      level.level,
                    );
                    return (
                      <li
                        key={`${level.level}-${level.roleSlug}`}
                        className="rounded-md border px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {actorName ?? roleLabel}
                            {actorName ? (
                              <span className="ml-1.5 font-normal text-muted-foreground">
                                · {roleLabel}
                              </span>
                            ) : null}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {outcome === "rejected"
                              ? "Rejected"
                              : outcome === "approved"
                                ? "Approved"
                                : "Pending"}
                            {when ? ` · ${when}` : ""}
                          </span>
                        </div>
                        {level.comment?.trim() ? (
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                            {level.comment}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">No comment.</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {lineRemarks.length > 0 ? (
              <div className="space-y-2">
                <Label>Line remarks</Label>
                <ul className="space-y-2">
                  {lineRemarks.map((line) => (
                    <li
                      key={line.detailId}
                      className="rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-mono">{line.skuCode}</span>
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                        {line.remarks}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Order lines</Label>
              <span className="text-xs text-muted-foreground">Total {totalLines}</span>
            </div>
            <div className="min-h-0 max-h-105 flex-1 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                    <th className="px-3 py-2 text-left font-medium">SKU</th>
                    <th className="w-24 px-3 py-2 text-right font-medium">Qty</th>
                    {hasApprovedQty ? (
                      <th className="w-28 px-3 py-2 text-right font-medium">Approved</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr key={line.detailId} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                      <td className="px-3 py-2 font-mono">{line.skuCode}</td>
                      <td className="px-3 py-2 text-right">×{line.quantity}</td>
                      {hasApprovedQty ? (
                        <td className="px-3 py-2 text-right">
                          {line.approvedQty != null ? `×${line.approvedQty}` : "—"}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Total lines: <span className="font-medium text-foreground">{totalLines}</span>
              {" • "}
              Total qty: <span className="font-medium text-foreground">{totalQuantity}</span>
            </div>
          </div>
        </div>
        <DialogFooter className="mt-1 gap-2 border-t pt-3 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
