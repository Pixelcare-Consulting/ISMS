import type { BranchOrderStatus } from "@prisma/client";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { OrderHistoryTracker } from "@/app/(app)/orders/_components/order-history-tracker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildSubmittedOrderProgress,
  formatOrderHistoryWhen,
} from "@/features/orders/lib/order-history-tracker";
import {
  BRANCH_ORDER_STATUS_LABELS,
  BRANCH_ORDER_TYPE_LABELS,
} from "@/features/orders/constants/order-status";
import type { SubmittedOrderSummary } from "@/features/orders/services/order-history-detail";
import { StatusCodeBadge } from "@/features/reason-status/components/status-code-badge";
import { formatPeso } from "@/utils/format-currency";

function submittedHeadline(status: BranchOrderStatus): string {
  switch (status) {
    case "pending_sp":
      return "This order was submitted and is waiting for Supply Planning.";
    case "pending_tl":
      return "This order was submitted and is waiting for the Team Leader.";
    case "pending_ps":
      return "This order was submitted and is waiting for the Product Specialist.";
    case "pending_logistics":
      return "This order is waiting for Logistics.";
    case "approved":
      return "This order is approved.";
    case "rejected":
      return "This order was rejected.";
    case "cancelled":
      return "This order was cancelled.";
    case "draft":
      return "This order is still a draft.";
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 break-words rounded-lg bg-muted/70 px-3 py-2.5 text-sm font-medium leading-5">
        {value}
      </p>
    </div>
  );
}

export function SubmittedOrderView({ order }: { order: SubmittedOrderSummary }) {
  const progress = buildSubmittedOrderProgress({
    orderType: order.orderType,
    status: order.status,
    createdAt: order.createdAt,
    processedAt: order.processedAt,
    createdByName: order.createdByName,
    approvalLevels: order.approvalLevels,
  });
  const showAmount = order.lines.some((line) => line.amount != null);
  const totalAmount =
    showAmount && order.lines.every((line) => line.amount != null)
      ? order.lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
      : null;
  const backHref = `/orders/manual?type=${order.orderType}`;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Back to orders
        </Link>
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{order.orderNumber}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {submittedHeadline(order.status)}
            </h1>
            <StatusCodeBadge
              code={order.status}
              name={BRANCH_ORDER_STATUS_LABELS[order.status]}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {BRANCH_ORDER_TYPE_LABELS[order.orderType]}
            {formatOrderHistoryWhen(order.createdAt)
              ? ` · ${formatOrderHistoryWhen(order.createdAt)}`
              : ""}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Progress</h2>
        <div className="mt-4">
          <OrderHistoryTracker items={progress} />
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-foreground">Order</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {order.dealerName ? <SummaryField label="Dealer" value={order.dealerName} /> : null}
          <SummaryField label="Branch" value={order.branchName} />
          <SummaryField label="Order type" value={BRANCH_ORDER_TYPE_LABELS[order.orderType]} />
          {order.paymentLabel ? (
            <SummaryField label="Mode of payment" value={order.paymentLabel} />
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card shadow-sm">
        <div className="border-b border-border/70 px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold text-foreground">Models</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              {showAmount ? <TableHead className="text-right">Amount</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  <p className="font-medium">{line.skuCode}</p>
                  {line.name.trim() && line.name.trim() !== line.skuCode ? (
                    <p className="text-sm text-muted-foreground">{line.name}</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.quantity.toLocaleString()}
                </TableCell>
                {showAmount ? (
                  <TableCell className="text-right tabular-nums">
                    {line.amount == null ? "—" : formatPeso(line.amount)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {totalAmount != null ? (
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell />
                <TableCell className="text-right font-medium tabular-nums">
                  {formatPeso(totalAmount)}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
