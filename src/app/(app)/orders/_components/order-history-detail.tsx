import type { LogisticsActivity } from "@/app/(app)/logistics/_components/logistics-detail-ui";
import {
  OrderRecordPage,
  type OrderRecordLine,
} from "@/app/(app)/orders/_components/order-history-sections";
import { formatOrderSapDocument } from "@/features/orders/constants/order-sap-doc-type";
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import { ORDER_TYPE_ROUTE } from "@/features/orders/constants/order-type-route";
import {
  buildSubmittedOrderProgress,
  formatOrderHistoryWhen,
} from "@/features/orders/lib/order-history-tracker";
import type { OrderHistoryApproval, OrderHistoryDetail } from "@/features/orders/types/order-analytics";

function approvalActor(level: OrderHistoryApproval): string | null {
  const name = level.approvedBy?.name?.trim();
  if (name) return name;
  const email = level.approvedBy?.email?.trim();
  return email || null;
}

function closedLabel(status: OrderHistoryDetail["status"]): "Cancelled" | "Rejected" {
  return status === "cancelled" ? "Cancelled" : "Rejected";
}

function historyItems(order: OrderHistoryDetail): LogisticsActivity[] {
  const items: LogisticsActivity[] = [
    {
      id: "created",
      label: "Created",
      actor: order.createdByName,
      at: order.createdAt,
    },
  ];

  for (const level of order.approvalLevels) {
    const actor = approvalActor(level);
    const note = level.comment?.trim() || null;
    if (level.approvedAt) {
      items.push({
        id: `approved-${level.level}`,
        label: "Approved",
        actor,
        at: level.approvedAt,
        note,
      });
    }
    if (level.rejectedAt) {
      items.push({
        id: `closed-${level.level}`,
        label: closedLabel(order.status),
        actor,
        at: level.rejectedAt,
        note,
      });
    }
  }

  return items;
}

function orderLines(order: OrderHistoryDetail): OrderRecordLine[] {
  return order.lines.map((line) => ({
    id: line.detailId,
    modelId: line.modelId,
    skuCode: line.skuCode,
    name: line.name,
    quantity: line.quantity,
    amount: line.amount,
    unitCbm: line.unitCbm,
    note: line.remarks,
    spNote: line.spRemarks,
  }));
}

export function OrderHistoryDetailView({ order }: { order: OrderHistoryDetail }) {
  const steps = buildSubmittedOrderProgress({
    orderType: order.orderType,
    status: order.status,
    createdAt: order.createdAt,
    processedAt: order.processedAt,
    createdByName: order.createdByName,
    approvalLevels: order.approvalLevels.map((level) => ({
      level: level.level,
      approvedAt: level.approvedAt,
      rejectedAt: level.rejectedAt,
      actorName: approvalActor(level),
    })),
  });
  const deliveryNo = order.delivery?.deliveryNo.trim();

  return (
    <OrderRecordPage
      backHref={`${ORDER_TYPE_ROUTE[order.orderType]}?tab=history`}
      backLabel="Back to order history"
      context={BRANCH_ORDER_TYPE_LABELS[order.orderType]}
      orderId={order.id}
      orderNumber={order.orderNumber}
      orderType={order.orderType}
      status={order.status}
      branchId={order.branchId}
      dealerName={order.dealerName}
      branchName={order.branchName}
      paymentLabel={order.paymentLabel}
      sapLabel={formatOrderSapDocument({ sapDocType: order.sapDocType, sapDocNum: order.sapDocNum })}
      createdByName={order.createdByName}
      notes={order.notes}
      deliveryDueLabel={formatOrderHistoryWhen(order.deliveryDueDate)}
      reviewSnapshot={order.reviewSnapshot}
      steps={steps}
      lines={orderLines(order)}
      history={historyItems(order)}
      delivery={
        order.delivery
          ? {
              href: `/logistics/deliveries/${order.delivery.id}`,
              label: deliveryNo ? `Delivery ${deliveryNo}` : "Delivery",
            }
          : null
      }
    />
  );
}
