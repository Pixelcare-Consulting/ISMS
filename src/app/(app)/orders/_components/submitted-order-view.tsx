import type { LogisticsActivity } from "@/app/(app)/logistics/_components/logistics-detail-ui";
import {
  OrderRecordPage,
  type OrderRecordLine,
} from "@/app/(app)/orders/_components/order-history-sections";
import { formatOrderSapDocument } from "@/features/orders/constants/order-sap-doc-type";
import { BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import { buildSubmittedOrderProgress } from "@/features/orders/lib/order-history-tracker";
import type { SubmittedOrderSummary } from "@/features/orders/services/order-history-detail";

function submittedLines(order: SubmittedOrderSummary): OrderRecordLine[] {
  return order.lines.map((line) => ({
    id: line.id,
    modelId: line.modelId,
    skuCode: line.skuCode,
    name: line.name,
    quantity: line.quantity,
    amount: line.amount,
    unitCbm: line.unitCbm,
    note: line.note,
    spNote: line.spNote,
  }));
}

function submittedHistory(order: SubmittedOrderSummary): LogisticsActivity[] {
  const items: LogisticsActivity[] = [
    {
      id: "created",
      label: "Created",
      actor: order.createdByName,
      at: order.createdAt,
    },
  ];

  for (const level of order.approvalLevels) {
    if (level.approvedAt) {
      items.push({
        id: `approved-${level.level}`,
        label: "Approved",
        actor: level.actorName,
        at: level.approvedAt,
      });
    }
    if (level.rejectedAt) {
      items.push({
        id: `closed-${level.level}`,
        label: order.status === "cancelled" ? "Cancelled" : "Rejected",
        actor: level.actorName,
        at: level.rejectedAt,
      });
    }
  }

  return items;
}

export function SubmittedOrderView({ order }: { order: SubmittedOrderSummary }) {
  const steps = buildSubmittedOrderProgress({
    orderType: order.orderType,
    status: order.status,
    createdAt: order.createdAt,
    processedAt: order.processedAt,
    createdByName: order.createdByName,
    approvalLevels: order.approvalLevels,
  });
  const backHref =
    order.orderType === "special" ? "/orders/manual?type=special" : "/orders/manual?type=manual";

  return (
    <OrderRecordPage
      backHref={backHref}
      backLabel="Back to orders"
      context={BRANCH_ORDER_TYPE_LABELS[order.orderType]}
      orderId={order.id}
      orderNumber={order.orderNumber}
      orderType={order.orderType}
      status={order.status}
      branchId={order.branchId}
      dealerName={order.dealerName}
      branchName={order.branchName}
      paymentLabel={order.paymentLabel}
      sapLabel={formatOrderSapDocument({
        sapDocType: order.sapDocType,
        sapDocNum: order.sapDocNum,
      })}
      createdByName={order.createdByName}
      notes={order.notes}
      reviewSnapshot={order.reviewSnapshot}
      steps={steps}
      lines={submittedLines(order)}
      history={submittedHistory(order)}
    />
  );
}
