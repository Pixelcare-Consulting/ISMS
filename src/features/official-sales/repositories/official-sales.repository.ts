import { prisma } from "@/lib/database/client";
import type { OfficialSalesImportRowStatus, Prisma } from "@prisma/client";

export type OfficialSalesRowCreateInput = {
  serial: string;
  drDate: Date | null;
  drNo: string | null;
  siDate: Date | null;
  siNo: string | null;
  branchSold: string | null;
  action: string | null;
  dealer: string | null;
  brand: string | null;
  itemModel: string | null;
  saleAmount: Prisma.Decimal | number | string | null;
  packageName: string | null;
};

const OPEN_SALE_DETAIL_SELECT = {
  id: true,
  salesId: true,
  serialNumberId: true,
  statusCodeId: true,
  modelId: true,
  packageTypeId: true,
  modelPrice: true,
  sale: {
    select: {
      id: true,
      transactionNo: true,
      transactionDate: true,
      atrStatus: true,
      branchId: true,
      alternateBranchId: true,
      branch: { select: { id: true, name: true, sapCode: true } },
    },
  },
  statusCode: { select: { id: true, code: true, name: true } },
  serialNumber: {
    select: {
      id: true,
      serialNo: true,
      modelId: true,
      model: { select: { id: true, skuCode: true, name: true } },
    },
  },
} as const;

export const officialSalesRepository = {
  countByStatus(tenantId: string) {
    return prisma.officialSalesImportRow.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { id: true },
    });
  },

  countAll(tenantId: string) {
    return prisma.officialSalesImportRow.count({ where: { tenantId } });
  },

  listStagingRows(tenantId: string) {
    return prisma.officialSalesImportRow.findMany({
      where: { tenantId },
      include: {
        batch: {
          select: {
            id: true,
            fileName: true,
            createdAt: true,
            uploadedBy: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 500,
    });
  },

  createBatchWithRows(
    tenantId: string,
    uploadedById: string,
    fileName: string | null,
    rows: OfficialSalesRowCreateInput[],
  ) {
    return prisma.officialSalesImportBatch.create({
      data: {
        tenantId,
        uploadedById,
        fileName,
        rows: {
          create: rows.map((row) => ({
            tenantId,
            serial: row.serial,
            drDate: row.drDate,
            drNo: row.drNo,
            siDate: row.siDate,
            siNo: row.siNo,
            branchSold: row.branchSold,
            action: row.action,
            dealer: row.dealer,
            brand: row.brand,
            itemModel: row.itemModel,
            saleAmount: row.saleAmount,
            packageName: row.packageName,
          })),
        },
      },
      include: { rows: true },
    });
  },

  findRow(tenantId: string, id: string) {
    return prisma.officialSalesImportRow.findFirst({
      where: { id, tenantId },
    });
  },

  /**
   * Oldest-first pending rows. `limit` lets the caller process a bounded batch:
   * processed rows leave the pending set, so repeating the call walks the queue
   * without an offset to track.
   */
  findPendingRows(tenantId: string, ids?: string[], limit?: number) {
    return prisma.officialSalesImportRow.findMany({
      where: {
        tenantId,
        status: "pending",
        ...(ids?.length ? { id: { in: ids } } : {}),
      },
      orderBy: { createdAt: "asc" },
      ...(limit != null ? { take: limit } : {}),
    });
  },

  findDeletableRows(tenantId: string, ids: string[]) {
    return prisma.officialSalesImportRow.findMany({
      where: {
        tenantId,
        id: { in: ids },
        status: { in: ["pending", "error"] },
      },
      select: { id: true, status: true, serial: true, batchId: true },
    });
  },

  countRowsByIds(tenantId: string, ids: string[]) {
    return prisma.officialSalesImportRow.count({
      where: { tenantId, id: { in: ids } },
    });
  },

  deleteDeletableRows(tenantId: string, ids: string[]) {
    return prisma.officialSalesImportRow.deleteMany({
      where: {
        tenantId,
        id: { in: ids },
        status: { in: ["pending", "error"] },
      },
    });
  },

  updateRowResult(
    id: string,
    data: {
      status: OfficialSalesImportRowStatus;
      result: string;
      processedAt?: Date;
    },
  ) {
    return prisma.officialSalesImportRow.update({
      where: { id },
      data: {
        status: data.status,
        result: data.result,
        processedAt: data.processedAt ?? new Date(),
      },
    });
  },

  clearTemp(tenantId: string, onlyPending = true) {
    return prisma.officialSalesImportRow.deleteMany({
      where: {
        tenantId,
        ...(onlyPending ? { status: "pending" } : {}),
      },
    });
  },

  findInventoryBySerial(tenantId: string, serialNo: string) {
    return prisma.branchInventory.findFirst({
      where: {
        tenantId,
        serialNumber: { serialNo },
      },
      include: {
        branch: { select: { id: true, name: true, sapCode: true } },
        serialNumber: {
          select: {
            id: true,
            serialNo: true,
            modelId: true,
            model: { select: { id: true, skuCode: true, name: true } },
          },
        },
        statusCode: { select: { id: true, code: true, name: true } },
      },
    });
  },

  findWarehouseInventoryBySerial(tenantId: string, serialNo: string) {
    return prisma.warehouseInventory.findFirst({
      where: {
        tenantId,
        serialNumber: { serialNo },
      },
      include: {
        warehouseLocation: {
          select: {
            id: true,
            code: true,
            name: true,
            warehouse: { select: { id: true, code: true, name: true } },
          },
        },
        serialNumber: {
          select: {
            id: true,
            serialNo: true,
            modelId: true,
            model: { select: { id: true, skuCode: true, name: true } },
          },
        },
      },
    });
  },

  /**
   * Resolve tenant branch by name, SAP code, or exact id (case-insensitive for name/code).
   */
  async resolveBranch(tenantId: string, branchSold: string) {
    const trimmed = branchSold.trim();
    if (!trimmed) return null;

    const byId = await prisma.branch.findFirst({
      where: { tenantId, id: trimmed, deletedAt: null },
      select: { id: true, name: true, sapCode: true },
    });
    if (byId) return byId;

    const rows = await prisma.branch.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { name: { equals: trimmed, mode: "insensitive" } },
          { sapCode: { equals: trimmed, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, sapCode: true },
      take: 2,
    });
    return rows[0] ?? null;
  },

  /**
   * Open (non-closed) sale detail for a serial with frozen Sold/Reserved/Official Sold STATUS.
   */
  findOpenSaleDetailBySerial(
    tenantId: string,
    serialNo: string,
    statusCodes: string[] = ["SLD", "RSV", "OFS"],
  ) {
    return prisma.branchSalesTransactionDetail.findFirst({
      where: {
        serialNumber: { tenantId, serialNo },
        sale: {
          tenantId,
          atrStatus: { not: "closed" },
        },
        statusCode: {
          code: { in: statusCodes },
        },
      },
      select: OPEN_SALE_DETAIL_SELECT,
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Match a TO-FOLLOW sale line (null serial) by Trans # and sold branch.
   * Used by Official Sales DEL cleanup — no inventory restore.
   */
  findToFollowSaleDetailByTransBranch(
    tenantId: string,
    transactionNo: string,
    branchId: string,
    statusCodes: string[] = ["FW", "SLD", "OFS"],
  ) {
    const txn = transactionNo.trim();
    return prisma.branchSalesTransactionDetail.findFirst({
      where: {
        serialNumberId: null,
        statusCode: { code: { in: statusCodes } },
        sale: { tenantId, branchId },
        OR: [
          { deliveryNo: txn },
          { sale: { transactionNo: txn } },
          { sale: { siTrans: txn } },
        ],
      },
      select: OPEN_SALE_DETAIL_SELECT,
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Match sale detail by serial + Trans # (sale transactionNo / siTrans, or the
   * line's own deliveryNo) and sold branch. Used by DEL and ADD matching.
   */
  findSaleDetailBySerialTransBranch(
    tenantId: string,
    serialNo: string,
    transactionNo: string,
    branchId: string,
    statusCodes?: string[],
  ) {
    const txn = transactionNo.trim();
    return prisma.branchSalesTransactionDetail.findFirst({
      where: {
        serialNumber: { tenantId, serialNo },
        ...(statusCodes?.length
          ? { statusCode: { code: { in: statusCodes } } }
          : {}),
        sale: { tenantId, branchId },
        OR: [
          { deliveryNo: txn },
          { sale: { transactionNo: txn } },
          { sale: { siTrans: txn } },
        ],
      },
      select: OPEN_SALE_DETAIL_SELECT,
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Prefer match by serial + Trans # + branch + optional date; fall back to serial-only open SLD.
   */
  async findSaleDetailForRetag(
    tenantId: string,
    serialNo: string,
    opts: {
      transactionNo?: string | null;
      branchId?: string | null;
      transactionDate?: Date | null;
      statusCodes?: string[];
    },
  ) {
    const statusCodes = opts.statusCodes ?? ["SLD", "RSV", "OFS"];
    const txn = opts.transactionNo?.trim();

    if (txn && opts.branchId) {
      const matched = await this.findSaleDetailBySerialTransBranch(
        tenantId,
        serialNo,
        txn,
        opts.branchId,
        statusCodes,
      );
      if (matched) return matched;
    }

    if (txn) {
      const byTxn = await prisma.branchSalesTransactionDetail.findFirst({
        where: {
          serialNumber: { tenantId, serialNo },
          statusCode: { code: { in: statusCodes } },
          sale: {
            tenantId,
            atrStatus: { not: "closed" },
            ...(opts.transactionDate
              ? { transactionDate: opts.transactionDate }
              : {}),
          },
          OR: [
            { deliveryNo: txn },
            { sale: { transactionNo: txn } },
            { sale: { siTrans: txn } },
          ],
        },
        select: OPEN_SALE_DETAIL_SELECT,
        orderBy: { createdAt: "desc" },
      });
      if (byTxn) return byTxn;
    }

    return this.findOpenSaleDetailBySerial(tenantId, serialNo, statusCodes);
  },

  /**
   * True when inventory is FPO or the serial is on an open pullout that is
   * for_pullout / in_transit (mid-pullout hold — do not force inventory to OFS).
   */
  async isPulloutHold(
    tenantId: string,
    serialNumberId: string,
    inventoryStatusCode?: string | null,
  ): Promise<boolean> {
    if ((inventoryStatusCode ?? "").toUpperCase() === "FPO") return true;

    const openPullout = await prisma.branchPulloutLine.findFirst({
      where: {
        serialNumberId,
        pullout: {
          tenantId,
          statusCode: {
            code: { in: ["for_pullout", "in_transit", "pending_logistics", "scheduled"] },
          },
        },
      },
      select: { id: true },
    });
    return Boolean(openPullout);
  },
};
