import { prisma } from "@/lib/database/client";

interface ProcessedOrdersFilters {
  branchIds?: string[];
  from?: Date;
  to?: Date;
  q?: string;
}

interface DailyStockFilters {
  date: Date;
  branchIds?: string[];
}

interface TransferFilters {
  branchIds?: string[];
  from?: Date;
  to?: Date;
}

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replaceAll("\"", "\"\"")}"`;
  }
  return raw;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(","));
  return [header, ...body].join("\n");
}

function toDateOnly(value?: Date | null): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function decimalToNumber(value: { toString(): string } | number | null | undefined): number {
  if (value == null) return 0;
  return Number(typeof value === "number" ? value : value.toString()) || 0;
}

function mapDateRange(filters: { from?: Date; to?: Date }, field: "processedAt" | "createdAt") {
  if (!filters.from && !filters.to) return {};
  return {
    [field]: {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    },
  };
}

export const reportsService = {
  async listProcessedOrders(tenantId: string, filters: ProcessedOrdersFilters = {}) {
    const rows = await prisma.branchOrder.findMany({
      where: {
        tenantId,
        status: "approved",
        ...(filters.branchIds ? { branchId: { in: filters.branchIds } } : {}),
        ...mapDateRange(filters, "processedAt"),
        ...(filters.q
          ? {
              OR: [
                { orderNumber: { contains: filters.q, mode: "insensitive" } },
                { branch: { name: { contains: filters.q, mode: "insensitive" } } },
                { details: { some: { model: { skuCode: { contains: filters.q, mode: "insensitive" } } } } },
              ],
            }
          : {}),
      },
      include: {
        branch: {
          include: {
            area: true,
            branchArea: true,
            region: true,
            province: true,
            dealer: { include: { dealerType: true, modeOfPayment: true } },
          },
        },
        brand: true,
        approvedBy: { select: { name: true, email: true } },
        details: { include: { model: { include: { brand: true } } } },
      },
      orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    return rows.flatMap((order) =>
      order.details.map((line) => {
        const approvedQty = line.approvedQty ?? line.quantity;
        const cbm = decimalToNumber(line.model.cbm);
        return {
          dateProcessed: toDateOnly(order.processedAt),
          soNumber: order.orderNumber,
          branch: order.branch.name,
          model: line.model.name,
          skuCode: line.model.skuCode,
          orderedQty: line.quantity,
          approvedQty,
          orderRemarks: order.notes ?? "",
          spaRemarks: order.spaRemarks ?? "",
          spaApprovedBy: order.approvedBy?.name ?? order.approvedBy?.email ?? "",
          spaDatetime: order.processedAt?.toISOString() ?? "",
          deliveryDueDate: toDateOnly(order.deliveryDueDate),
          cbmPerUnit: cbm.toFixed(4),
          totalCbm: (approvedQty * cbm).toFixed(4),
          brand: order.brand?.name ?? line.model.brand?.name ?? "",
          area: order.branch.area?.name ?? order.branch.branchArea?.name ?? "",
          region: order.branch.region?.name ?? "",
          province: order.branch.province?.name ?? "",
          dealerType: order.branch.dealer?.dealerType?.name ?? "",
          modeOfPayment: order.branch.dealer?.modeOfPayment?.name ?? "",
          asm: "",
          ae: "",
          tl: "",
          spa: order.approvedBy?.name ?? "",
        };
      }),
    );
  },

  async exportProcessedOrdersCsv(tenantId: string, filters: ProcessedOrdersFilters = {}) {
    const rows = await this.listProcessedOrders(tenantId, filters);
    const columns = [
      "dateProcessed",
      "soNumber",
      "branch",
      "model",
      "skuCode",
      "orderedQty",
      "approvedQty",
      "orderRemarks",
      "spaRemarks",
      "spaApprovedBy",
      "spaDatetime",
      "deliveryDueDate",
      "cbmPerUnit",
      "totalCbm",
      "brand",
      "area",
      "region",
      "province",
      "dealerType",
      "modeOfPayment",
      "asm",
      "ae",
      "tl",
      "spa",
    ];
    return toCsv(rows, columns);
  },

  async listDailyStock(tenantId: string, filters: DailyStockFilters) {
    const dateEnd = new Date(filters.date);
    dateEnd.setHours(23, 59, 59, 999);
    const dateStart = new Date(filters.date);
    dateStart.setHours(0, 0, 0, 0);

    const planogramRows = await prisma.branchPlanogram.findMany({
      where: {
        tenantId,
        ...(filters.branchIds ? { branchId: { in: filters.branchIds } } : {}),
      },
      include: {
        branch: true,
        model: true,
      },
      orderBy: [{ branch: { name: "asc" } }, { model: { skuCode: "asc" } }],
      take: 2000,
    });

    const modelIds = [...new Set(planogramRows.map((row) => row.modelId))];
    const branchIds = [...new Set(planogramRows.map((row) => row.branchId))];

    const stkCode = await prisma.reasonStatusCode.findFirst({
      where: {
        tenantId,
        code: "STK",
        reasonStatus: { category: "inventory_system" },
      },
      select: { id: true },
    });

    const [stockRows, soldDetails] = await Promise.all([
      stkCode
        ? prisma.branchInventory.groupBy({
            by: ["branchId", "statusCodeId"],
            where: {
              tenantId,
              branchId: { in: branchIds },
              statusCodeId: stkCode.id,
              updatedAt: { lte: dateEnd },
              serialNumber: { modelId: { in: modelIds } },
            },
            _count: { id: true },
          })
        : Promise.resolve([]),
      prisma.branchSalesTransactionDetail.findMany({
        where: {
          sale: {
            tenantId,
            branchId: { in: branchIds },
            createdAt: { gte: dateStart, lte: dateEnd },
          },
          OR: [
            { modelId: { in: modelIds } },
            { serialNumber: { modelId: { in: modelIds } } },
          ],
        },
        select: {
          modelId: true,
          sale: { select: { branchId: true } },
          serialNumber: { select: { modelId: true } },
        },
      }),
    ]);

    const soldByBranchModel = new Map<string, number>();
    for (const row of soldDetails) {
      const modelId = row.modelId ?? row.serialNumber?.modelId;
      if (!modelId || !modelIds.includes(modelId)) continue;
      const key = `${row.sale.branchId}:${modelId}`;
      soldByBranchModel.set(key, (soldByBranchModel.get(key) ?? 0) + 1);
    }

    const stockByBranch = new Map<string, number>();
    for (const row of stockRows) {
      stockByBranch.set(row.branchId, (stockByBranch.get(row.branchId) ?? 0) + row._count.id);
    }

    return planogramRows.map((row) => {
      const key = `${row.branchId}:${row.modelId}`;
      return {
        date: toDateOnly(filters.date),
        branch: row.branch.name,
        skuCode: row.model.skuCode,
        model: row.model.name,
        invQty: stockByBranch.get(row.branchId) ?? 0,
        soldQty: soldByBranchModel.get(key) ?? 0,
      };
    });
  },

  async exportDailyStockCsv(tenantId: string, filters: DailyStockFilters) {
    const rows = await this.listDailyStock(tenantId, filters);
    return toCsv(rows, ["date", "branch", "skuCode", "model", "invQty", "soldQty"]);
  },

  async listTransfers(tenantId: string, filters: TransferFilters = {}) {
    const rows = await prisma.branchTransfer.findMany({
      where: {
        tenantId,
        ...(filters.branchIds
          ? {
              OR: [
                { fromBranchId: { in: filters.branchIds } },
                { toBranchId: { in: filters.branchIds } },
              ],
            }
          : {}),
        ...mapDateRange(filters, "createdAt"),
      },
      include: {
        fromBranch: true,
        toBranch: true,
        statusCode: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return rows.map((row) => ({
      date: toDateOnly(row.createdAt),
      transferNo: row.transferNo,
      fromBranch: row.fromBranch.name,
      toBranch: row.toBranch.name,
      statusCode: row.statusCode.code,
      status: row.statusCode.name,
      notes: row.notes ?? "",
    }));
  },

  async exportTransfersCsv(tenantId: string, filters: TransferFilters = {}) {
    const rows = await this.listTransfers(tenantId, filters);
    return toCsv(rows, [
      "date",
      "transferNo",
      "fromBranch",
      "toBranch",
      "statusCode",
      "status",
      "notes",
    ]);
  },
};
