import { prisma } from "@/lib/database/client";

interface ProcessedOrdersFilters {
  branchId?: string;
  from?: Date;
  to?: Date;
  q?: string;
}

interface DailyStockFilters {
  date: Date;
  branchId?: string;
}

interface TransferFilters {
  branchId?: string;
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
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
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
        branch: { include: { branchArea: true } },
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
          area: order.branch.branchArea?.name ?? "",
          region: "",
          province: "",
          dealerType: "",
          modeOfPayment: "",
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
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
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

    const [stockRows, soldRows] = await Promise.all([
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
      prisma.branchSalesTransaction.groupBy({
        by: ["branchId", "serialNumberId"],
        where: {
          tenantId,
          branchId: { in: branchIds },
          createdAt: { gte: dateStart, lte: dateEnd },
          serialNumber: { modelId: { in: modelIds } },
        },
        _count: { id: true },
      }),
    ]);

    const soldSerialIds = soldRows.map((row) => row.serialNumberId).filter((id): id is string => Boolean(id));
    const serials = soldSerialIds.length
      ? await prisma.serialNumber.findMany({
          where: { id: { in: soldSerialIds } },
          select: { id: true, modelId: true },
        })
      : [];
    const modelBySerial = new Map(serials.map((row) => [row.id, row.modelId]));
    const soldByBranchModel = new Map<string, number>();
    for (const row of soldRows) {
      if (!row.serialNumberId) continue;
      const modelId = modelBySerial.get(row.serialNumberId);
      if (!modelId) continue;
      const key = `${row.branchId}:${modelId}`;
      soldByBranchModel.set(key, (soldByBranchModel.get(key) ?? 0) + row._count.id);
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
        ...(filters.branchId
          ? {
              OR: [{ fromBranchId: filters.branchId }, { toBranchId: filters.branchId }],
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
