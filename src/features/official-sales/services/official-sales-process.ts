import { auditService } from "@/features/audit/services/audit.service";
import {
  markSerialSoldFromStockSource,
  restoreSerialToStockSource,
} from "@/features/inventory/services/inventory-serial-moves";
import { OFFICIAL_SALES_TRANSACTION_PREFIX } from "@/features/official-sales/constants/official-sales-import";
import { officialSalesRepository } from "@/features/official-sales/repositories/official-sales.repository";
import { isToFollowSerial } from "@/features/sales/constants/to-follow-serial";
import { resolveModelPriceForSales } from "@/features/sales/services/model-price";
import { prisma } from "@/lib/database/client";

export type OfficialSalesProcessCodes = {
  stkCodeId: string;
  sldCodeId: string;
  rsvCodeId: string;
  ofsCodeId: string;
};

export type OfficialSalesProcessAction = "WHSE_ADD" | "ADD" | "DEL" | "UPD";

export type OfficialSalesProcessRow = {
  id: string;
  serial: string;
  /** Delivery receipt pair — lands on the sale line, not the sale header. */
  drDate: Date | null;
  drNo: string | null;
  /** Invoice pair — drives the sale transaction no. and date. */
  siDate: Date | null;
  siNo: string | null;
  branchSold: string | null;
  action: string | null;
  itemModel: string | null;
  brand: string | null;
  saleAmount: unknown;
  packageName: string | null;
};

type OfficialSalesCommercialFields = {
  packageTypeId: string | null;
  brandId: string | null;
  saleAmount: number;
  modelPrice: number;
  amount: number;
};

function assertNever(value: never): never {
  throw new Error(`Unhandled official sales action: ${String(value)}`);
}

/** Normalize staging Action Key to flowchart actions (WHSE_ADD / ADD / DEL / UPD). */
export function normalizeProcessAction(
  value: string | null | undefined,
): OfficialSalesProcessAction | null {
  if (value == null || value === "") return null;
  const text = String(value).trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!text) return null;

  switch (text) {
    case "WHSE_ADD":
    case "WHSE_ADJ":
    case "WHSEADD":
    case "WHSEADJ":
      return "WHSE_ADD";
    case "ADD":
      return "ADD";
    case "DEL":
    case "DELETE":
      return "DEL";
    case "UPD":
    case "UPDATE":
      return "UPD";
    default:
      return null;
  }
}

function requireBranchSold(branchSold: string | null): string {
  const trimmed = branchSold?.trim() ?? "";
  if (!trimmed) {
    throw new Error("Branch Sold / BRANCH NAME is required");
  }
  return trimmed;
}

function requireModelId(modelId: string | null | undefined, itemModel: string | null) {
  if (modelId) return modelId;
  if (itemModel?.trim()) {
    throw new Error("Serial has no model linked — fix the serial catalog before processing");
  }
  throw new Error("Model is required");
}

/**
 * SI/TRANS NO. identifies the sale. DR NO. is the fallback for rows staged
 * before the two columns were split apart.
 */
function resolveTransMatchNo(row: OfficialSalesProcessRow): string | null {
  return row.siNo?.trim() || row.drNo?.trim() || null;
}

/** Invoice date drives the sale; DR date is the fallback for pre-split rows. */
function resolveTransactionDate(row: OfficialSalesProcessRow): Date | null {
  return row.siDate ?? row.drDate;
}

function resolveTransactionNo(row: OfficialSalesProcessRow): string {
  const fromCsv = resolveTransMatchNo(row);
  if (fromCsv) return fromCsv;
  return `${OFFICIAL_SALES_TRANSACTION_PREFIX}${Date.now().toString(36).toUpperCase()}-${row.id.slice(-4)}`;
}

function buildSaleNotes(row: OfficialSalesProcessRow, action: string): string {
  return [
    "Official sales import",
    row.siNo ? `SI/Trans # ${row.siNo}` : null,
    row.siDate ? `SI Date ${row.siDate.toISOString().slice(0, 10)}` : null,
    row.drNo ? `DR # ${row.drNo}` : null,
    row.drDate ? `DR Date ${row.drDate.toISOString().slice(0, 10)}` : null,
    row.branchSold ? `Branch Sold ${row.branchSold}` : null,
    `Action ${action}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

type OfficialSalesTrailAction =
  | "official_sales.add"
  | "official_sales.del"
  | "official_sales.whse_add";

const OFFICIAL_SALES_ACTION_KEY: Record<
  OfficialSalesTrailAction,
  "ADD" | "DEL" | "WHSE_ADD"
> = {
  "official_sales.add": "ADD",
  "official_sales.del": "DEL",
  "official_sales.whse_add": "WHSE_ADD",
};

/** Append-only Serial Number Logs trail for every successful ADD / DEL / WHSE_ADD. */
async function logOfficialSalesTrail(input: {
  tenantId: string;
  userId: string;
  action: OfficialSalesTrailAction;
  entityType: string;
  entityId: string;
  serial: string;
  transactionNo?: string | null;
  soldBranch?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await auditService.log({
    tenantId: input.tenantId,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: {
      serial: input.serial.trim(),
      actionKey: OFFICIAL_SALES_ACTION_KEY[input.action],
      ...(input.transactionNo?.trim()
        ? { transactionNo: input.transactionNo.trim() }
        : {}),
      ...(input.soldBranch?.trim()
        ? { soldBranch: input.soldBranch.trim() }
        : {}),
      ...input.metadata,
    },
  });
}

async function resolveSoldBranch(tenantId: string, branchSold: string) {
  const branch = await officialSalesRepository.resolveBranch(tenantId, branchSold);
  if (!branch) {
    throw new Error(`Unknown branch: ${branchSold}`);
  }
  return branch;
}

async function setInventoryOfficialSold(
  tx: Pick<typeof prisma, "branchInventory">,
  input: {
    tenantId: string;
    inventoryId: string;
    expectedStatusCodeId?: string;
    soldBranchId: string;
    currentBranchId: string;
    ofsCodeId: string;
    updatedById: string;
  },
) {
  const updated = await tx.branchInventory.updateMany({
    where: {
      id: input.inventoryId,
      tenantId: input.tenantId,
      ...(input.expectedStatusCodeId
        ? { statusCodeId: input.expectedStatusCodeId }
        : {}),
    },
    data: {
      statusCodeId: input.ofsCodeId,
      updatedById: input.updatedById,
      ...(input.currentBranchId !== input.soldBranchId
        ? { branchId: input.soldBranchId }
        : {}),
    },
  });
  if (updated.count === 0) {
    throw new Error("Inventory status changed during processing");
  }
}

async function retagDetailToOfficialSold(
  tx: Pick<typeof prisma, "branchSalesTransactionDetail">,
  detailId: string,
  ofsCodeId: string,
) {
  await tx.branchSalesTransactionDetail.update({
    where: { id: detailId },
    data: { statusCodeId: ofsCodeId },
  });
}

function parseRowSaleAmount(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(value.toString());
  if (!Number.isFinite(n)) return 0;
  return n;
}

/**
 * Resolve CSV package / brand / sale amount and PriceList model price for new
 * Official Sales detail lines. Errors when a provided name is not in master data.
 */
async function resolveCommercialFieldsForCreate(
  tenantId: string,
  row: OfficialSalesProcessRow,
  modelId: string,
  transactionDate: Date | null,
): Promise<OfficialSalesCommercialFields> {
  const packageName = row.packageName?.trim() ?? "";
  let packageTypeId: string | null = null;
  if (packageName) {
    const pkg = await prisma.packageType.findFirst({
      where: {
        tenantId,
        name: { equals: packageName, mode: "insensitive" },
        recordStatus: "active",
      },
      select: { id: true },
    });
    if (!pkg) {
      throw new Error(`Unknown package: ${packageName}`);
    }
    packageTypeId = pkg.id;
  }

  const brandName = row.brand?.trim() ?? "";
  let brandId: string | null = null;
  if (brandName) {
    const brand = await prisma.brand.findFirst({
      where: {
        tenantId,
        name: { equals: brandName, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!brand) {
      throw new Error(`Unknown brand: ${brandName}`);
    }
    brandId = brand.id;
  }

  const saleAmount = parseRowSaleAmount(row.saleAmount);
  const resolved = await resolveModelPriceForSales(
    tenantId,
    modelId,
    packageTypeId ?? undefined,
    transactionDate ?? undefined,
  );
  const modelPrice = resolved?.amount ?? 0;

  return {
    packageTypeId,
    brandId,
    saleAmount,
    modelPrice,
    amount: saleAmount,
  };
}

async function createOfficialSaleWithDetail(
  tx: Pick<
    typeof prisma,
    "branchSalesTransaction" | "branchSalesTransactionDetail"
  >,
  input: {
    tenantId: string;
    userId: string;
    branchId: string;
    stockBranchId: string;
    transactionNo: string;
    transactionDate: Date | null;
    deliveryNo: string | null;
    deliveryDate: Date | null;
    notes: string;
    modelId: string;
    serialNumberId: string;
    ofsCodeId: string;
    packageTypeId?: string | null;
    brandId?: string | null;
    saleAmount?: number;
    modelPrice?: number;
    amount?: number;
  },
) {
  const lineSaleAmount = input.saleAmount ?? 0;
  const lineAmount = input.amount ?? lineSaleAmount;
  const lineModelPrice = input.modelPrice ?? 0;

  const existing = await tx.branchSalesTransaction.findUnique({
    where: {
      tenantId_transactionNo: {
        tenantId: input.tenantId,
        transactionNo: input.transactionNo,
      },
    },
    select: { id: true, branchId: true },
  });

  let saleId: string;
  let createdHeader = false;
  if (existing) {
    if (existing.branchId !== input.branchId) {
      throw new Error(
        `Transaction ${input.transactionNo} already exists on another branch`,
      );
    }
    saleId = existing.id;
  } else {
    const created = await tx.branchSalesTransaction.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        alternateBranchId: input.stockBranchId,
        transactionNo: input.transactionNo,
        transactionDate: input.transactionDate,
        amount: lineSaleAmount,
        notes: input.notes,
        atrStatus: "open",
        createdById: input.userId,
      },
    });
    saleId = created.id;
    createdHeader = true;
  }

  const openSameSerial = await tx.branchSalesTransactionDetail.findFirst({
    where: {
      salesId: saleId,
      serialNumberId: input.serialNumberId,
      statusCodeId: input.ofsCodeId,
    },
    select: { id: true },
  });
  if (openSameSerial) {
    return { saleId, detailId: openSameSerial.id, created: false as const };
  }

  const detail = await tx.branchSalesTransactionDetail.create({
    data: {
      salesId: saleId,
      modelId: input.modelId,
      serialNumberId: input.serialNumberId,
      statusCodeId: input.ofsCodeId,
      deliveryNo: input.deliveryNo,
      deliveryDate: input.deliveryDate,
      packageTypeId: input.packageTypeId ?? null,
      brandId: input.brandId ?? null,
      saleAmount: lineSaleAmount,
      modelPrice: lineModelPrice,
      amount: lineAmount,
    },
  });

  if (!createdHeader) {
    await tx.branchSalesTransaction.update({
      where: { id: saleId },
      data: { amount: { increment: lineSaleAmount } },
    });
  }

  return { saleId, detailId: detail.id, created: true as const };
}

async function processWhseAdd(
  tenantId: string,
  userId: string,
  row: OfficialSalesProcessRow,
  codes: OfficialSalesProcessCodes,
): Promise<string> {
  const branchLabel = requireBranchSold(row.branchSold);
  const soldBranch = await resolveSoldBranch(tenantId, branchLabel);
  const whse = await officialSalesRepository.findWarehouseInventoryBySerial(
    tenantId,
    row.serial,
  );
  if (!whse) {
    throw new Error("No serial found in Warehouse Inventory");
  }

  const modelId = requireModelId(whse.serialNumber.modelId, row.itemModel);
  const transactionNo = resolveTransactionNo(row);
  const transactionDate = resolveTransactionDate(row);
  const commercial = await resolveCommercialFieldsForCreate(
    tenantId,
    row,
    modelId,
    transactionDate,
  );
  const whseFrom =
    whse.warehouseLocation.warehouse.name || whse.warehouseLocation.name;

  await prisma.$transaction(async (tx) => {
    await auditService.log({
      tenantId,
      userId,
      action: "official_sales.stock_adj",
      entityType: "WarehouseInventory",
      entityId: whse.id,
      metadata: {
        serial: row.serial,
        whseFrom,
        whseTo: soldBranch.name,
        soldBranch: soldBranch.name,
        transactionNo,
        notes: "OS CONFLICT / WHSE_ADD",
        action: "WHSE_ADD",
        actionKey: "WHSE_ADD",
      },
    });

    await tx.warehouseInventory.delete({ where: { id: whse.id } });

    await createOfficialSaleWithDetail(tx, {
      tenantId,
      userId,
      branchId: soldBranch.id,
      stockBranchId: soldBranch.id,
      transactionNo,
      transactionDate,
      deliveryNo: row.drNo,
      deliveryDate: row.drDate,
      notes: buildSaleNotes(row, "WHSE_ADD"),
      modelId,
      serialNumberId: whse.serialNumberId,
      ofsCodeId: codes.ofsCodeId,
      ...commercial,
    });

    const existingInv = await tx.branchInventory.findFirst({
      where: {
        tenantId,
        serialNumberId: whse.serialNumberId,
      },
      select: { id: true, branchId: true },
    });

    if (existingInv) {
      await tx.branchInventory.update({
        where: { id: existingInv.id },
        data: {
          branchId: soldBranch.id,
          statusCodeId: codes.ofsCodeId,
          updatedById: userId,
        },
      });
    } else {
      await tx.branchInventory.create({
        data: {
          tenantId,
          branchId: soldBranch.id,
          serialNumberId: whse.serialNumberId,
          statusCodeId: codes.ofsCodeId,
          updatedById: userId,
        },
      });
    }

    await logOfficialSalesTrail({
      tenantId,
      userId,
      action: "official_sales.whse_add",
      entityType: "BranchSalesTransaction",
      entityId: transactionNo,
      serial: row.serial,
      transactionNo,
      soldBranch: soldBranch.name,
      metadata: {
        branchId: soldBranch.id,
        status: "OFS",
      },
    });
  });

  return "WHSE_ADD — Official Sold";
}

async function processAdd(
  tenantId: string,
  userId: string,
  row: OfficialSalesProcessRow,
  codes: OfficialSalesProcessCodes,
): Promise<string> {
  const branchLabel = requireBranchSold(row.branchSold);
  const soldBranch = await resolveSoldBranch(tenantId, branchLabel);
  const inventory = await officialSalesRepository.findInventoryBySerial(
    tenantId,
    row.serial,
  );
  const transactionNo = resolveTransactionNo(row);
  const transMatchNo = resolveTransMatchNo(row);

  // --- Not in branch inventory: retag existing SLD sale only ---
  if (!inventory) {
    const detail = await officialSalesRepository.findSaleDetailForRetag(
      tenantId,
      row.serial,
      {
        transactionNo: transMatchNo,
        branchId: soldBranch.id,
        transactionDate: resolveTransactionDate(row),
        statusCodes: ["SLD", "OFS"],
      },
    );
    if (!detail) {
      throw new Error("Not Found with SN details");
    }

    const detailCode = detail.statusCode?.code?.toUpperCase() ?? "";
    if (detailCode === "OFS") {
      // Idempotent success — already Official Sold (no inventory row to align).
      return "ADD — already Official Sold";
    }
    if (detailCode !== "SLD") {
      throw new Error("Not Found with SN details");
    }

    await prisma.$transaction(async (tx) => {
      await retagDetailToOfficialSold(tx, detail.id, codes.ofsCodeId);
      await logOfficialSalesTrail({
        tenantId,
        userId,
        action: "official_sales.add",
        entityType: "BranchSalesTransactionDetail",
        entityId: detail.id,
        serial: row.serial,
        transactionNo: detail.sale.transactionNo,
        soldBranch: soldBranch.name,
        metadata: {
          processPath: "retag_no_inventory",
          status: "OFS",
        },
      });
    });
    return "ADD — retagged to Official Sold";
  }

  const modelId = requireModelId(inventory.serialNumber.modelId, row.itemModel);
  const statusCode = inventory.statusCode.code.toUpperCase();
  const pulloutHold = await officialSalesRepository.isPulloutHold(
    tenantId,
    inventory.serialNumberId,
    statusCode,
  );

  // Idempotent success: already OFS with matching / open OFS sale
  if (statusCode === "OFS") {
    const matched = transMatchNo
      ? await officialSalesRepository.findSaleDetailBySerialTransBranch(
          tenantId,
          row.serial,
          transMatchNo,
          soldBranch.id,
          ["OFS"],
        )
      : await officialSalesRepository.findOpenSaleDetailBySerial(
          tenantId,
          row.serial,
          ["OFS"],
        );
    if (matched) {
      return "ADD — already Official Sold";
    }
  }

  // Retag path: SLD / RSV / OFS open sale
  if (statusCode === "SLD" || statusCode === "RSV" || statusCode === "OFS") {
    const detail = await officialSalesRepository.findSaleDetailForRetag(
      tenantId,
      row.serial,
      {
        transactionNo: transMatchNo,
        branchId: soldBranch.id,
        transactionDate: resolveTransactionDate(row),
        statusCodes: ["SLD", "RSV", "OFS"],
      },
    );
    if (!detail) {
      throw new Error("Not Found with SN details");
    }

    const detailCode = detail.statusCode?.code?.toUpperCase() ?? "";
    if (detailCode === "OFS") {
      if (!pulloutHold && statusCode !== "OFS") {
        await prisma.$transaction(async (tx) => {
          await setInventoryOfficialSold(tx, {
            tenantId,
            inventoryId: inventory.id,
            expectedStatusCodeId: inventory.statusCodeId,
            soldBranchId: soldBranch.id,
            currentBranchId: inventory.branchId,
            ofsCodeId: codes.ofsCodeId,
            updatedById: userId,
          });
          await logOfficialSalesTrail({
            tenantId,
            userId,
            action: "official_sales.add",
            entityType: "BranchSalesTransactionDetail",
            entityId: detail.id,
            serial: row.serial,
            transactionNo: detail.sale.transactionNo,
            soldBranch: soldBranch.name,
            metadata: {
              processPath: "inventory_align",
              status: "OFS",
            },
          });
        });
        return "ADD — Official Sold (inventory aligned)";
      }
      // Idempotent success — detail already OFS; no inventory change required.
      return "ADD — already Official Sold";
    }

    await prisma.$transaction(async (tx) => {
      await retagDetailToOfficialSold(tx, detail.id, codes.ofsCodeId);
      if (!pulloutHold) {
        await setInventoryOfficialSold(tx, {
          tenantId,
          inventoryId: inventory.id,
          expectedStatusCodeId: inventory.statusCodeId,
          soldBranchId: soldBranch.id,
          currentBranchId: inventory.branchId,
          ofsCodeId: codes.ofsCodeId,
          updatedById: userId,
        });
      }
      await logOfficialSalesTrail({
        tenantId,
        userId,
        action: "official_sales.add",
        entityType: "BranchSalesTransactionDetail",
        entityId: detail.id,
        serial: row.serial,
        transactionNo: detail.sale.transactionNo,
        soldBranch: soldBranch.name,
        metadata: {
          processPath: "retag",
          inventoryForcedOfs: !pulloutHold,
          pulloutHold,
          status: "OFS",
        },
      });
    });

    return pulloutHold
      ? "ADD — Official Sold (pullout hold kept)"
      : "ADD — Official Sold";
  }

  // Pullout / FPO hold on non-sold statuses: create/retag sale, leave inventory hold
  if (pulloutHold) {
    const existing = await officialSalesRepository.findSaleDetailForRetag(
      tenantId,
      row.serial,
      {
        transactionNo: transMatchNo,
        branchId: soldBranch.id,
        transactionDate: resolveTransactionDate(row),
        statusCodes: ["SLD", "RSV", "OFS"],
      },
    );

    const pulloutTxnDate = resolveTransactionDate(row);
    const pulloutCommercial = existing
      ? undefined
      : await resolveCommercialFieldsForCreate(
          tenantId,
          row,
          modelId,
          pulloutTxnDate,
        );

    await prisma.$transaction(async (tx) => {
      if (existing) {
        if (existing.statusCode?.code?.toUpperCase() !== "OFS") {
          await retagDetailToOfficialSold(tx, existing.id, codes.ofsCodeId);
        }
      } else if (pulloutCommercial) {
        await createOfficialSaleWithDetail(tx, {
          tenantId,
          userId,
          branchId: soldBranch.id,
          stockBranchId: inventory.branchId,
          transactionNo,
          transactionDate: pulloutTxnDate,
          deliveryNo: row.drNo,
          deliveryDate: row.drDate,
          notes: buildSaleNotes(row, "ADD"),
          modelId,
          serialNumberId: inventory.serialNumberId,
          ofsCodeId: codes.ofsCodeId,
          ...pulloutCommercial,
        });
      }
      await logOfficialSalesTrail({
        tenantId,
        userId,
        action: "official_sales.add",
        entityType: "BranchSalesTransaction",
        entityId: transactionNo,
        serial: row.serial,
        transactionNo,
        soldBranch: soldBranch.name,
        metadata: {
          processPath: "pullout_hold",
          pulloutHold: true,
          inventoryStatus: statusCode,
          status: "OFS",
        },
      });
    });
    return "ADD — Official Sold (pullout hold kept)";
  }

  // Sellable path (typically STK): relocate on branch conflict, create or retag, set OFS
  if (statusCode !== "STK") {
    throw new Error(`Unsupported inventory status ${statusCode} for ADD`);
  }

  const duplicate = transMatchNo
    ? await officialSalesRepository.findSaleDetailBySerialTransBranch(
        tenantId,
        row.serial,
        transMatchNo,
        soldBranch.id,
        ["SLD", "OFS"],
      )
    : null;

  if (duplicate) {
    const dupCode = duplicate.statusCode?.code?.toUpperCase() ?? "";
    if (dupCode === "OFS") {
      // Idempotent success — matching sale already Official Sold.
      return "ADD — already Official Sold";
    }
    await prisma.$transaction(async (tx) => {
      await retagDetailToOfficialSold(tx, duplicate.id, codes.ofsCodeId);
      await markSerialSoldFromStockSource(tx, {
        tenantId,
        serialNumberId: inventory.serialNumberId,
        stockBranchId: inventory.branchId,
        soldBranchId: soldBranch.id,
        stkCodeId: codes.stkCodeId,
        targetStatusCodeId: codes.ofsCodeId,
        updatedById: userId,
      });
      await logOfficialSalesTrail({
        tenantId,
        userId,
        action: "official_sales.add",
        entityType: "BranchSalesTransactionDetail",
        entityId: duplicate.id,
        serial: row.serial,
        transactionNo: duplicate.sale.transactionNo,
        soldBranch: soldBranch.name,
        metadata: {
          processPath: "duplicate_retag",
          status: "OFS",
        },
      });
    });
    return "ADD — Official Sold";
  }

  const otherOpen = await officialSalesRepository.findOpenSaleDetailBySerial(
    tenantId,
    row.serial,
    ["SLD", "RSV", "OFS"],
  );
  if (otherOpen) {
    throw new Error(
      `Serial already has an open sale (${otherOpen.sale.transactionNo})`,
    );
  }

  const branchConflict = inventory.branchId !== soldBranch.id;
  const sellableTxnDate = resolveTransactionDate(row);
  const sellableCommercial = await resolveCommercialFieldsForCreate(
    tenantId,
    row,
    modelId,
    sellableTxnDate,
  );

  await prisma.$transaction(async (tx) => {
    if (branchConflict) {
      await auditService.log({
        tenantId,
        userId,
        action: "official_sales.stock_adj",
        entityType: "BranchInventory",
        entityId: inventory.id,
        metadata: {
          serial: row.serial,
          whseFrom: inventory.branch.name,
          whseTo: soldBranch.name,
          soldBranch: soldBranch.name,
          transactionNo,
          notes: "OS CONFLICT",
          action: "ADD",
          actionKey: "ADD",
        },
      });
    }

    await markSerialSoldFromStockSource(tx, {
      tenantId,
      serialNumberId: inventory.serialNumberId,
      stockBranchId: inventory.branchId,
      soldBranchId: soldBranch.id,
      stkCodeId: codes.stkCodeId,
      targetStatusCodeId: codes.ofsCodeId,
      updatedById: userId,
    });

    await createOfficialSaleWithDetail(tx, {
      tenantId,
      userId,
      branchId: soldBranch.id,
      stockBranchId: inventory.branchId,
      transactionNo,
      transactionDate: sellableTxnDate,
      deliveryNo: row.drNo,
      deliveryDate: row.drDate,
      notes: buildSaleNotes(row, "ADD"),
      modelId,
      serialNumberId: inventory.serialNumberId,
      ofsCodeId: codes.ofsCodeId,
      ...sellableCommercial,
    });

    await logOfficialSalesTrail({
      tenantId,
      userId,
      action: "official_sales.add",
      entityType: "BranchSalesTransaction",
      entityId: transactionNo,
      serial: row.serial,
      transactionNo,
      soldBranch: soldBranch.name,
      metadata: {
        processPath: "sellable_create",
        branchId: soldBranch.id,
        branchConflict,
        status: "OFS",
      },
    });
  });

  return branchConflict
    ? "ADD — Official Sold (stock adjusted)"
    : "ADD — Official Sold";
}

async function processDel(
  tenantId: string,
  userId: string,
  row: OfficialSalesProcessRow,
  codes: OfficialSalesProcessCodes,
): Promise<string> {
  const branchLabel = requireBranchSold(row.branchSold);
  const soldBranch = await resolveSoldBranch(tenantId, branchLabel);
  const txn = resolveTransMatchNo(row);
  if (!txn) {
    throw new Error("Trans # / SI/TRANS NO. is required for DEL");
  }

  // TO-FOLLOW CSV serial: delete placeholder sale line only (no inventory unit).
  if (isToFollowSerial(row.serial)) {
    const toFollowDetail =
      await officialSalesRepository.findToFollowSaleDetailByTransBranch(
        tenantId,
        txn,
        soldBranch.id,
      );
    const toFollowStatus = toFollowDetail?.statusCode;
    if (!toFollowDetail || !toFollowStatus) {
      throw new Error("No Sales transaction to be deleted");
    }

    const toFollowPreviousStatus = toFollowStatus.code.toUpperCase();
    const toFollowTransactionNo = toFollowDetail.sale.transactionNo;

    await prisma.$transaction(async (tx) => {
      await tx.branchSalesTransactionDetail.delete({
        where: { id: toFollowDetail.id },
      });

      const remaining = await tx.branchSalesTransactionDetail.count({
        where: { salesId: toFollowDetail.salesId },
      });
      if (remaining === 0) {
        await tx.branchSalesTransaction.delete({
          where: { id: toFollowDetail.salesId },
        });
      }

      await logOfficialSalesTrail({
        tenantId,
        userId,
        action: "official_sales.del",
        entityType: "BranchSalesTransactionDetail",
        entityId: toFollowDetail.id,
        serial: row.serial,
        transactionNo: toFollowTransactionNo,
        soldBranch: soldBranch.name,
        metadata: {
          previousStatus: toFollowPreviousStatus,
          toFollowCleanup: true,
          notes: "Official Delete — TO-FOLLOW",
        },
      });
    });

    return "DEL — TO-FOLLOW line removed";
  }

  const detail = await officialSalesRepository.findSaleDetailBySerialTransBranch(
    tenantId,
    row.serial,
    txn,
    soldBranch.id,
  );
  if (!detail?.serialNumberId || !detail.statusCode) {
    throw new Error("No Sales transaction to be deleted");
  }

  const detailCode = detail.statusCode.code.toUpperCase();
  if (detailCode !== "SLD" && detailCode !== "OFS") {
    throw new Error("No Sales transaction to be deleted");
  }

  // Search fallback: pre-sale stock source (alternate). Restore lands at Branch Sold.
  const stockBranchId =
    detail.sale.alternateBranchId ?? detail.sale.branchId;
  const soldBranchId = detail.sale.branchId;
  const soldBranchName = detail.sale.branch.name;

  // Conflict reversal: inventory currently at a different branch than Branch Sold.
  const inventoryBefore = await officialSalesRepository.findInventoryBySerial(
    tenantId,
    row.serial,
  );
  const delBranchConflict =
    inventoryBefore != null && inventoryBefore.branchId !== soldBranchId
      ? inventoryBefore
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.branchSalesTransactionDetail.delete({
      where: { id: detail.id },
    });

    const remaining = await tx.branchSalesTransactionDetail.count({
      where: { salesId: detail.salesId },
    });
    if (remaining === 0) {
      await tx.branchSalesTransaction.delete({
        where: { id: detail.salesId },
      });
    }

    if (delBranchConflict) {
      await auditService.log({
        tenantId,
        userId,
        action: "official_sales.stock_adj",
        entityType: "BranchInventory",
        entityId: delBranchConflict.id,
        metadata: {
          serial: row.serial,
          whseFrom: delBranchConflict.branch.name,
          whseTo: soldBranchName,
          soldBranch: soldBranchName,
          transactionNo: detail.sale.transactionNo,
          notes: "OS CONFLICT / DEL",
          action: "DEL",
          actionKey: "DEL",
        },
      });
    }

    await restoreSerialToStockSource(tx, {
      tenantId,
      serialNumberId: detail.serialNumberId!,
      stockBranchId,
      soldBranchId,
      stkCodeId: codes.stkCodeId,
      soldStatusCodeIds: [codes.sldCodeId, codes.rsvCodeId, codes.ofsCodeId],
      updatedById: userId,
      restoreToBranchId: soldBranchId,
    });

    await logOfficialSalesTrail({
      tenantId,
      userId,
      action: "official_sales.del",
      entityType: "BranchSalesTransactionDetail",
      entityId: detail.id,
      serial: row.serial,
      transactionNo: detail.sale.transactionNo,
      soldBranch: soldBranchName,
      metadata: {
        previousStatus: detailCode,
        restored: "STK",
        restoredBranch: soldBranchName,
        branchConflict: Boolean(delBranchConflict),
        notes: "Official Delete",
      },
    });
  });

  return `DEL — restored STK at ${soldBranchName}`;
}

/**
 * Dispatch one staging row by Action Key (flowchart WHSE_ADD / ADD / DEL).
 * Throws on validation / business errors; caller maps to staging error status.
 */
export async function processOfficialSalesRow(
  tenantId: string,
  userId: string,
  row: OfficialSalesProcessRow,
  codes: OfficialSalesProcessCodes,
): Promise<string> {
  const action = normalizeProcessAction(row.action);
  if (!action) {
    throw new Error(
      row.action?.trim()
        ? `Unsupported Action Key "${row.action.trim()}" — use WHSE_ADD, ADD, or DEL`
        : "Action Key is required (WHSE_ADD, ADD, or DEL)",
    );
  }

  switch (action) {
    case "WHSE_ADD":
      return processWhseAdd(tenantId, userId, row, codes);
    case "ADD":
      return processAdd(tenantId, userId, row, codes);
    case "DEL":
      return processDel(tenantId, userId, row, codes);
    case "UPD":
      throw new Error("UPD not supported — edit the sale in Sales");
    default:
      return assertNever(action);
  }
}
