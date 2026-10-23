import Link from "next/link";
import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";
import type { ReactNode } from "react";

import { OrderHistoryTracker } from "@/app/(app)/orders/_components/order-history-tracker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatOrderSapDocument } from "@/features/orders/constants/order-sap-doc-type";
import { BRANCH_ORDER_STATUS_LABELS, BRANCH_ORDER_TYPE_LABELS } from "@/features/orders/constants/order-status";
import { ORDER_TYPE_ROUTE } from "@/features/orders/constants/order-permissions";
import { getOrderApprovalChain } from "@/features/orders/constants/order-workflow";
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
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
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

export function OrderHistoryDetailView({ order }: { order: OrderHistoryDetail }) {
  const tracker = buildOrderHistoryTracker({
    orderType: order.orderType,
    status: order.status,
    createdAt: order.createdAt,
    processedAt: order.processedAt,
    approvalLevels: order.approvalLevels,
  });
  const decisions = order.approvalLevels.filter(
    (level) => level.approvedAt || level.rejectedAt,
  );
  const backHref = `${ORDER_TYPE_ROUTE[order.orderType]}?tab=history`;

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-muted-foreground hover:underline">
          Back to order history
        </Link>
        <div className="mt-1 min-w-0 space-y-2">
          <h2 className="text-xl font-semibold">{order.orderNumber}</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status</span>
            <StatusCodeBadge
              code={order.status}
              name={BRANCH_ORDER_STATUS_LABELS[order.status]}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <OrderHistoryTracker items={tracker} />
      </div>

      <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="font-medium">Order</h3>
        <dl className="grid gap-3 sm:grid-cols-2">
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
            <span className="whitespace-pre-wrap">{textOrDash(order.notes)}</span>
          </Field>
        </dl>
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="font-medium">Lines</h3>
        {order.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lines.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Order qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Approved qty</TableHead>
                <TableHead className="text-right">Approved amount</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>SP note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.detailId}>
                  <TableCell className="font-mono">{line.skuCode}</TableCell>
                  <TableCell>{textOrDash(line.name)}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                  <TableCell className="text-right font-mono">{formatPeso(line.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.approvedQty == null ? "—" : line.approvedQty}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {line.approvedAmount == null ? "—" : formatPeso(line.approvedAmount)}
                  </TableCell>
                  <TableCell className="whitespace-pre-wrap">{textOrDash(line.remarks)}</TableCell>
                  <TableCell className="whitespace-pre-wrap">{textOrDash(line.spRemarks)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="font-medium">Approvals</h3>
        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approval has been recorded.</p>
        ) : (
          <ul className="space-y-3">
            {decisions.map((level) => {
              const outcome = recordedOutcome(level, order.status);
              const stepLabel = chainStatusLabel(order.orderType, level.level);
              const when = decisionWhen(level);
              return (
                <li key={`${level.level}-${level.roleSlug}`}>
                  <p className="text-sm">{personLabel(level)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[stepLabel, outcome, when].filter(Boolean).join(" · ")}
                  </p>
                  {level.comment?.trim() ? (
                    <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                      {level.comment.trim()}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
