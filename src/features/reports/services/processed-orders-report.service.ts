import { prisma } from "@/lib/database/client";
import { buildCsvContent } from "@/lib/shared/csv";

export interface ProcessedOrdersReportFilters {
  processedFrom?: Date;
  processedTo?: Date;
  branchId?: string;
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

export const processedOrdersReportService = {
  async generateCsv(tenantId: string, filters: ProcessedOrdersReportFilters = {}) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const orders = await prisma.branchOrder.findMany({
      where: {
        tenantId,
        status: "approved",
        processedAt: { not: null },
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
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
            branchArea: { select: { name: true, code: true } },
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

    const rows: (string | number | null | undefined)[][] = [];

    for (const order of orders) {
      const spLevel = spLevelByOrder.get(order.id);
      const spaUser = spLevel?.approvedById
        ? spaUserById.get(spLevel.approvedById)
        : order.approvedBy;
      const spaName = spaUser?.name ?? spaUser?.email ?? "";
      const areaName = order.branch.branchArea?.name ?? "";

      for (const detail of order.details) {
        const approvedQty = detail.approvedQty ?? detail.quantity;
        const cbmPerUnit = detail.model.cbm ? Number(detail.model.cbm) : 0;
        const totalCbm = cbmPerUnit > 0 ? (cbmPerUnit * approvedQty).toFixed(4) : "";

        rows.push([
          formatDate(order.processedAt),
          tenant?.name ?? "",
          order.branch.name,
          order.brand?.name ?? detail.model.brand?.name ?? "",
          order.orderNumber,
          detail.model.skuCode,
          detail.quantity,
          approvedQty,
          order.notes ?? "",
          order.spaRemarks ?? "",
          order.createdBy.name ?? order.createdBy.email,
          spaName,
          formatDateTime(spLevel?.approvedAt ?? order.processedAt),
          formatDate(order.deliveryDueDate),
          totalCbm,
          areaName,
          "",
          "",
        ]);
      }
    }

    return buildCsvContent(HEADERS, rows);
  },
};
