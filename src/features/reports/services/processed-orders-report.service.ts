import { prisma } from "@/lib/database/client";
import { buildCsvContent } from "@/lib/shared/csv";

export interface ProcessedOrdersReportFilters {
  processedFrom?: Date;
  processedTo?: Date;
  branchIds?: string[];
}

const HEADERS = [
  "DATE PROCESSED",
  "DEALER NAME",
  "BRANCH NAME",
  "BRAND",
  "SO",
  "MODEL",
  "BRANCH ORDER",
  "APPROVED QTY",
  "ORDER REMARKS",
  "SPA REMARKS",
  "LAST UPDATED BY",
  "SPA APPROVED BY",
  "SPA DATETIME APPROVED",
  "DELIVERY DUE DATE",
  "TOTAL CBM",
  "AREA",
  "REGION",
  "PROVINCE",
];

function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().replace("T", " ").slice(0, 19);
}

export interface ProcessedOrdersReportRow {
  dateProcessed: string;
  dealerName: string;
  branch: string;
  brand: string;
  soNumber: string;
  skuCode: string;
  orderedQty: number;
  approvedQty: number;
  orderRemarks: string;
  spaRemarks: string;
  lastUpdatedBy: string;
  spaApprovedBy: string;
  spaApprovedAt: string;
  deliveryDueDate: string;
  /** Null when the model has no CBM configured. */
  totalCbm: number | null;
  area: string;
}

export const processedOrdersReportService = {
  /** One row per approved order line; shared by the CSV export and the Stimulsoft dataset. */
  async listRows(
    tenantId: string,
    filters: ProcessedOrdersReportFilters = {},
  ): Promise<ProcessedOrdersReportRow[]> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const orders = await prisma.branchOrder.findMany({
      where: {
        tenantId,
        status: "approved",
        processedAt: { not: null },
        ...(filters.branchIds ? { branchId: { in: filters.branchIds } } : {}),
        ...(filters.processedFrom || filters.processedTo
          ? {
              processedAt: {
                ...(filters.processedFrom ? { gte: filters.processedFrom } : {}),
                ...(filters.processedTo ? { lte: filters.processedTo } : {}),
              },
            }
          : {}),
      },
      include: {
        branch: {
          include: {
            area: { select: { name: true, code: true } },
            branchArea: { select: { name: true } },
          },
        },
        brand: { select: { name: true } },
        approvedBy: { select: { name: true, email: true } },
        createdBy: { select: { name: true, email: true } },
        details: {
          include: {
            model: {
              select: {
                skuCode: true,
                name: true,
                cbm: true,
                brand: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { processedAt: "desc" },
    });

    const spLevels = await prisma.branchOrderApprovalLevel.findMany({
      where: {
        orderId: { in: orders.map((o) => o.id) },
        roleSlug: { in: ["sp", "spa"] },
        approvedAt: { not: null },
      },
      select: { orderId: true, approvedAt: true, approvedById: true },
    });

    const spLevelByOrder = new Map<string, { approvedAt: Date; approvedById: string | null }>();
    for (const level of spLevels) {
      const existing = spLevelByOrder.get(level.orderId);
      if (!existing || level.approvedAt! > existing.approvedAt) {
        spLevelByOrder.set(level.orderId, {
          approvedAt: level.approvedAt!,
          approvedById: level.approvedById,
        });
      }
    }

    const spaUserIds = [
      ...new Set(
        spLevels.map((l) => l.approvedById).filter((id): id is string => Boolean(id)),
      ),
    ];
    const spaUsers =
      spaUserIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: spaUserIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const spaUserById = new Map(spaUsers.map((u) => [u.id, u]));

    const rows: ProcessedOrdersReportRow[] = [];

    for (const order of orders) {
      const spLevel = spLevelByOrder.get(order.id);
      const spaUser = spLevel?.approvedById
        ? spaUserById.get(spLevel.approvedById)
        : order.approvedBy;
      const spaName = spaUser?.name ?? spaUser?.email ?? "";
      const areaName =
        order.branch.area?.name ?? order.branch.branchArea?.name ?? "";

      for (const detail of order.details) {
        const approvedQty = detail.approvedQty ?? detail.quantity;
        const cbmPerUnit = detail.model.cbm ? Number(detail.model.cbm) : 0;

        rows.push({
          dateProcessed: formatDate(order.processedAt),
          dealerName: tenant?.name ?? "",
          branch: order.branch.name,
          brand: order.brand?.name ?? detail.model.brand?.name ?? "",
          soNumber: order.orderNumber,
          skuCode: detail.model.skuCode,
          orderedQty: detail.quantity,
          approvedQty,
          orderRemarks: order.notes ?? "",
          spaRemarks: order.spaRemarks ?? "",
          lastUpdatedBy: order.createdBy.name ?? order.createdBy.email,
          spaApprovedBy: spaName,
          spaApprovedAt: formatDateTime(spLevel?.approvedAt ?? order.processedAt),
          deliveryDueDate: formatDate(order.deliveryDueDate),
          totalCbm: cbmPerUnit > 0 ? Number((cbmPerUnit * approvedQty).toFixed(4)) : null,
          area: areaName,
        });
      }
    }

    return rows;
  },

  async generateCsv(tenantId: string, filters: ProcessedOrdersReportFilters = {}) {
    const rows = await this.listRows(tenantId, filters);
    return buildCsvContent(
      HEADERS,
      rows.map((r) => [
        r.dateProcessed,
        r.dealerName,
        r.branch,
        r.brand,
        r.soNumber,
        r.skuCode,
        r.orderedQty,
        r.approvedQty,
        r.orderRemarks,
        r.spaRemarks,
        r.lastUpdatedBy,
        r.spaApprovedBy,
        r.spaApprovedAt,
        r.deliveryDueDate,
        r.totalCbm === null ? "" : r.totalCbm.toFixed(4),
        r.area,
        "",
        "",
      ]),
    );
  },
};
