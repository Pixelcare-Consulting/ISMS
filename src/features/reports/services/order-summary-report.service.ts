import type { BranchOrderStatus, Prisma } from "@prisma/client";

import {
  BRANCH_ORDER_SOURCE_LABELS,
  BRANCH_ORDER_STATUS_LABELS,
  BRANCH_ORDER_TYPE_LABELS,
} from "@/features/orders/constants/order-status";
import { prisma } from "@/lib/database/client";

export interface OrderSummaryReportFilters {
  /** Status date on or after (inclusive). See `orderStatusDate`. */
  from: Date;
  /** Status date on or before (inclusive). */
  to: Date;
  statuses: BranchOrderStatus[];
  /** Undefined: every branch. */
  branchIds?: string[];
}

/** One row per order: what was asked for, what was approved, and where it stands. */
export interface OrderSummaryReportRow {
  /** Status date, YYYY-MM-DD, Manila. */
  date: string;
  /** Status date, YYYY-MM-DD HH:mm, Manila. */
  statusDate: string;
  /** YYYY-MM-DD HH:mm, Manila. */
  createdAt: string;
  orderNumber: string;
  source: string;
  orderType: string;
  branch: string;
  brand: string;
  status: string;
  lineCount: number;
  requestedQty: number;
  approvedQty: number;
  requestedAmount: number;
  approvedAmount: number;
  /** Approved quantity × CBM once approved; requested quantity × CBM before that. */
  totalCbm: number;
  createdBy: string;
  /** "SO 97580" / "ITR 12345", or blank before SAP has the document. */
  sapDocument: string;
}

const MANILA_DATE_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function manilaDateTime(value: Date): { date: string; dateTime: string } {
  const parts = Object.fromEntries(MANILA_DATE_TIME.formatToParts(value).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, dateTime: `${date} ${parts.hour}:${parts.minute}` };
}

function toNumber(value: { toString(): string } | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

interface OrderDates {
  status: BranchOrderStatus;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
  approvalLevels: readonly { rejectedAt: Date | null }[];
}

/**
 * The date an order is listed under: created while pending, approved once approved, and the
 * day it was rejected or cancelled. An SO closed in SAP has no rejecting level, and a
 * cancelled order changes no further, so its last update is the cancellation.
 */
export function orderStatusDate(order: OrderDates): Date {
  switch (order.status) {
    case "approved":
      return order.processedAt ?? order.createdAt;
    case "rejected":
    case "cancelled": {
      const decided = order.approvalLevels.flatMap((level) => level.rejectedAt ?? []);
      if (decided.length === 0) return order.updatedAt;
      return new Date(Math.max(...decided.map((date) => date.getTime())));
    }
    default:
      return order.createdAt;
  }
}

/** The same rule as `orderStatusDate`, as a query. Keep the two in step. */
function statusDateWhere(
  statuses: readonly BranchOrderStatus[],
  window: Prisma.DateTimeFilter,
): Prisma.BranchOrderWhereInput[] {
  const closed = statuses.filter((status) => status === "rejected" || status === "cancelled");
  const open = statuses.filter(
    (status) => status !== "approved" && status !== "rejected" && status !== "cancelled",
  );
  const where: Prisma.BranchOrderWhereInput[] = [];
  if (open.length > 0) where.push({ status: { in: open }, createdAt: window });
  if (statuses.includes("approved")) where.push({ status: "approved", processedAt: window });
  if (closed.length > 0) {
    where.push(
      { status: { in: closed }, approvalLevels: { some: { rejectedAt: window } } },
      {
        status: { in: closed },
        updatedAt: window,
        approvalLevels: { none: { rejectedAt: { not: null } } },
      },
    );
  }
  return where;
}

export const orderSummaryReportService = {
  /** Orders by status date, oldest first; the Stimulsoft dataset reads these rows. */
  async listRows(tenantId: string, filters: OrderSummaryReportFilters): Promise<OrderSummaryReportRow[]> {
    if (filters.statuses.length === 0 || (filters.branchIds && filters.branchIds.length === 0)) return [];
    const orders = await prisma.branchOrder.findMany({
      where: {
        tenantId,
        OR: statusDateWhere(filters.statuses, { gte: filters.from, lte: filters.to }),
        ...(filters.branchIds ? { branchId: { in: filters.branchIds } } : {}),
      },
      select: {
        orderNumber: true,
        source: true,
        orderType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        processedAt: true,
        approvalLevels: { select: { rejectedAt: true } },
        sapDocType: true,
        sapDocNum: true,
        branch: { select: { name: true } },
        brand: { select: { name: true } },
        createdBy: { select: { name: true, email: true } },
        details: {
          select: {
            quantity: true,
            approvedQty: true,
            model: { select: { srp: true, cbm: true, brand: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const dated = orders
      .map((order) => ({ order, statusDate: orderStatusDate(order) }))
      .sort((a, b) => a.statusDate.getTime() - b.statusDate.getTime());

    return dated.map(({ order, statusDate }) => {
      const approved = order.status === "approved";
      let requestedQty = 0;
      let approvedQty = 0;
      let requestedAmount = 0;
      let approvedAmount = 0;
      let totalCbm = 0;
      const brands = new Set<string>();
      for (const line of order.details) {
        const srp = toNumber(line.model.srp);
        const cbm = toNumber(line.model.cbm);
        const lineApproved = approved ? (line.approvedQty ?? line.quantity) : 0;
        requestedQty += line.quantity;
        requestedAmount += line.quantity * srp;
        approvedQty += lineApproved;
        approvedAmount += lineApproved * srp;
        totalCbm += (approved ? lineApproved : line.quantity) * cbm;
        if (line.model.brand?.name) brands.add(line.model.brand.name);
      }
      const listed = manilaDateTime(statusDate);
      return {
        date: listed.date,
        statusDate: listed.dateTime,
        createdAt: manilaDateTime(order.createdAt).dateTime,
        orderNumber: order.orderNumber,
        source: BRANCH_ORDER_SOURCE_LABELS[order.source],
        orderType: BRANCH_ORDER_TYPE_LABELS[order.orderType],
        branch: order.branch.name,
        brand: order.brand?.name ?? [...brands].sort().join(", "),
        status: BRANCH_ORDER_STATUS_LABELS[order.status],
        lineCount: order.details.length,
        requestedQty,
        approvedQty,
        requestedAmount: round(requestedAmount, 2),
        approvedAmount: round(approvedAmount, 2),
        totalCbm: round(totalCbm, 4),
        createdBy: order.createdBy.name?.trim() || order.createdBy.email,
        sapDocument:
          order.sapDocType && order.sapDocNum != null ? `${order.sapDocType} ${order.sapDocNum}` : "",
      };
    });
  },
};
