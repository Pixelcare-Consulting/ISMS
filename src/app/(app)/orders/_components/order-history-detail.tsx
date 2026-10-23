import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";
import type { ReactNode } from "react";

import {
  LogisticsDocumentHeader,
  LogisticsProgressCard,
} from "@/app/(app)/logistics/_components/logistics-detail-ui";
import { OrderHistoryLinesTable } from "@/app/(app)/orders/_components/order-history-lines-table";
import {
  OrderHistoryApprovals,
  OrderHistoryFactsCard,
  type OrderApprovalTimelineItem,
} from "@/app/(app)/orders/_components/order-history-sections";
import { OrderHistoryTracker } from "@/app/(app)/orders/_components/order-history-tracker";
import { formatOrderSapDocument } from "@/features/orders/constants/order-sap-doc-type";
import { BRANCH_ORDER_STATUS_LABELS, BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import { ORDER_TYPE_ROUTE } from "@/features/orders/constants/order-permissions";
import { getOrderApprovalChain, type OrderApprovalStep } from "@/features/orders/constants/order-workflow";
import {
  buildOrderHistoryTracker,
  formatOrderHistoryWhen,
} from "@/features/orders/lib/order-history-tracker";
import type { OrderHistoryApproval, OrderHistoryDetail } from "@/features/orders/types/order-analytics";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { formatPeso } from "@/utils/format-currency";
import { cn } from "@/utils/cn";

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function textOrDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function chainStatusLabel(orderType: BranchOrderType, level: number): string | null {
  const step = getOrderApprovalChain(orderType).find((item) => item.level === level);
  return step ? BRANCH_ORDER_STATUS_LABELS[step.status] : null;
}

function recordedOutcome(level: OrderHistoryApproval, status: BranchOrderStatus): string | null {
  if (level.rejectedAt) return status === "cancelled" ? "Cancelled" : "Rejected";
  if (level.approvedAt) return "Approved";
  return null;
}

function personLabel(level: OrderHistoryApproval): string {
  const name = level.approvedBy?.name?.trim();
  if (name) return name;
  return level.approvedBy?.email?.trim() || "—";
}

function decisionWhen(level: OrderHistoryApproval): string | null {
  return formatOrderHistoryWhen(level.rejectedAt ?? level.approvedAt);
}

function firstWaitingIndex(status: BranchOrderStatus, chain: readonly OrderApprovalStep[]): number {
  switch (status) {
    case "draft":
    case "pending_ps":
      return 0;
    case "pending_tl":
    case "pending_sp": {
      const index = chain.findIndex((step) => step.status === status);
      return index === -1 ? chain.length : index;
    }
    case "pending_logistics":
    case "approved":
    case "rejected":
    case "cancelled":
      return chain.length;
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

function approvalItems(order: OrderHistoryDetail): OrderApprovalTimelineItem[] {
  const chain = getOrderApprovalChain(order.orderType);
  const waitingFrom = firstWaitingIndex(order.status, chain);
  const rows: OrderApprovalTimelineItem[] = [];
  const seen = new Set<number>();

  chain.forEach((step, index) => {
    const level = order.approvalLevels.find((item) => item.level === step.level);
    const decided = Boolean(level && (level.approvedAt || level.rejectedAt));
    if (decided && level) {
      rows.push(recordedItem(order, level, BRANCH_ORDER_STATUS_LABELS[step.status]));
      seen.add(step.level);
      return;
    }
    if (index >= waitingFrom) {
      rows.push({
        id: `pending-${step.level}`,
        title: BRANCH_ORDER_STATUS_LABELS[step.status],
        pending: true,
        subtitle: null,
        note: null,
      });
    }
  });

  for (const level of order.approvalLevels) {
    if (seen.has(level.level)) continue;
    if (!level.approvedAt && !level.rejectedAt) continue;
    rows.push(recordedItem(order, level, chainStatusLabel(order.orderType, level.level)));
  }

  return rows;
}

function recordedItem(
  order: OrderHistoryDetail,
  level: OrderHistoryApproval,
  stepLabel: string | null,
): OrderApprovalTimelineItem {
  const subtitle = [stepLabel, recordedOutcome(level, order.status), decisionWhen(level)]
    .filter(Boolean)
    .join(" · ");
  return {
    id: `${level.level}-${level.roleSlug}`,
    title: personLabel(level),
    pending: false,
    subtitle: subtitle || null,
    note: level.comment?.trim() || null,
  };
}

export function OrderHistoryDetailView({ order }: { order: OrderHistoryDetail }) {
  const tracker = buildOrderHistoryTracker({
    orderType: order.orderType,
    status: order.status,
    createdAt: order.createdAt,
    processedAt: order.processedAt,
    approvalLevels: order.approvalLevels,
  });
  const backHref = `${ORDER_TYPE_ROUTE[order.orderType]}?tab=history`;

  return (
    <div className="space-y-6">
      <LogisticsDocumentHeader
        plain
        backHref={backHref}
        backLabel="Back to order history"
        context={BRANCH_ORDER_TYPE_LABELS[order.orderType]}
        title={order.orderNumber}
        statusCode={order.status}
        badges={
          <StatusCodeBadge code={order.status} name={BRANCH_ORDER_STATUS_LABELS[order.status]} />
        }
      />

      <LogisticsProgressCard>
        <OrderHistoryTracker items={tracker} />
      </LogisticsProgressCard>

      <OrderHistoryFactsCard>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Branch">{order.branchName}</Field>
          <Field label="Type">{BRANCH_ORDER_TYPE_LABELS[order.orderType]}</Field>
          <Field label="Created by">{textOrDash(order.createdByName)}</Field>
          <Field label="Created">{textOrDash(formatOrderHistoryWhen(order.createdAt))}</Field>
          <Field label="Last updated by">{textOrDash(order.lastUpdatedBy)}</Field>
          <Field label="Delivery due">{textOrDash(formatOrderHistoryWhen(order.deliveryDueDate))}</Field>
          <Field label="SAP document">
            {formatOrderSapDocument({ sapDocType: order.sapDocType, sapDocNum: order.sapDocNum })}
          </Field>
          <Field label="Order qty">{order.orderQty}</Field>
          <Field label="Total amount">{formatPeso(order.totalAmt)}</Field>
          <Field label="Approved qty">{order.appQty}</Field>
          <Field label="Approved amount">{formatPeso(order.appAmt)}</Field>
          <Field label="Notes" className="sm:col-span-2">
            <span className="font-normal whitespace-pre-wrap">{textOrDash(order.notes)}</span>
          </Field>
        </dl>
      </OrderHistoryFactsCard>

      <OrderHistoryLinesTable lines={order.lines} />

      <OrderHistoryApprovals items={approvalItems(order)} />
    </div>
  );
}
