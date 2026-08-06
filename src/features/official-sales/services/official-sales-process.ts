import { auditService } from "@/features/audit/services/audit.service";
import {
  markSerialSoldFromStockSource,
  restoreSerialToStockSource,
} from "@/features/inventory/services/inventory-serial-moves";
import { officialSalesRepository } from "@/features/official-sales/repositories/official-sales.repository";
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
  drDate: Date | null;
  drNo: string | null;
  branchSold: string | null;
  action: string | null;
  itemModel: string | null;
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

function resolveTransactionNo(row: OfficialSalesProcessRow): string {
  const fromCsv = row.drNo?.trim();
  if (fromCsv) return fromCsv;
  return `OFS-${Date.now().toString(36).toUpperCase()}-${row.id.slice(-4)}`;
}

function buildSaleNotes(row: OfficialSalesProcessRow, action: string): string {
  return [
    "Official sales import",
    row.drNo ? `Trans # ${row.drNo}` : null,
    row.drDate ? `Trans Date ${row.drDate.toISOString().slice(0, 10)}` : null,
    row.branchSold ? `Branch Sold ${row.branchSold}` : null,
    `Action ${action}`,
  ]
    .filter(Boolean)
    .join(" · ");
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
    notes: string;
    modelId: string;
    serialNumberId: string;
    ofsCodeId: string;
  },
) {
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
        deliveryNo: input.deliveryNo,
        deliveryDate: input.transactionDate,
        amount: 0,
        notes: input.notes,
        atrStatus: "open",
        createdById: input.userId,
      },
    });
    saleId = created.id;
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
      saleAmount: 0,
      amount: 0,
    },
  });
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
        notes: "OS CONFLICT / WHSE_ADD",
        action: "WHSE_ADD",
      },
    });

    await tx.warehouseInventory.delete({ where: { id: whse.id } });

    await createOfficialSaleWithDetail(tx, {
      tenantId,
      userId,
      branchId: soldBranch.id,
      stockBranchId: soldBranch.id,
      transactionNo,
      transactionDate: row.drDate,
      deliveryNo: row.drNo,
      notes: buildSaleNotes(row, "WHSE_ADD"),
      modelId,
      serialNumberId: whse.serialNumberId,
      ofsCodeId: codes.ofsCodeId,
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

    await auditService.log({
      tenantId,
      userId,
      action: "official_sales.whse_add",
      entityType: "BranchSalesTransaction",
      entityId: transactionNo,
      metadata: {
        serial: row.serial,
        branchId: soldBranch.id,
        transactionNo,
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

  // --- Not in branch inventory: retag existing SLD sale only ---
  if (!inventory) {
    const detail = await officialSalesRepository.findSaleDetailForRetag(
      tenantId,
      row.serial,
      {
        transactionNo: row.drNo,
        branchId: soldBranch.id,
        transactionDate: row.drDate,
        statusCodes: ["SLD", "OFS"],
      },
    );
    if (!detail) {
      throw new Error("Not Found with SN details");
    }

    const detailCode = detail.statusCode?.code?.toUpperCase() ?? "";
    if (detailCode === "OFS") {
      return "ADD — already Official Sold";
    }
    if (detailCode !== "SLD") {
      throw new Error("Not Found with SN details");
    }

    await prisma.$transaction(async (tx) => {
      await retagDetailToOfficialSold(tx, detail.id, codes.ofsCodeId);
      await auditService.log({
        tenantId,
        userId,
        action: "official_sales.add",
        entityType: "BranchSalesTransactionDetail",
        entityId: detail.id,
        metadata: {
          serial: row.serial,
          transactionNo: detail.sale.transactionNo,
          path: "retag_no_inventory",
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

  // Idempotent: already OFS with matching txn
  if (statusCode === "OFS") {
    const matched = row.drNo
      ? await officialSalesRepository.findSaleDetailBySerialTransBranch(
          tenantId,
          row.serial,
          row.drNo,
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
        transactionNo: row.drNo,
        branchId: soldBranch.id,
        transactionDate: row.drDate,
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
        });
        return "ADD — Official Sold (inventory aligned)";
      }
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
      await auditService.log({
        tenantId,
        userId,
        action: "official_sales.add",
        entityType: "BranchSalesTransactionDetail",
        entityId: detail.id,
        metadata: {
          serial: row.serial,
          transactionNo: detail.sale.transactionNo,
          path: "retag",
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
        transactionNo: row.drNo,
        branchId: soldBranch.id,
        transactionDate: row.drDate,
        statusCodes: ["SLD", "RSV", "OFS"],
      },
    );

    await prisma.$transaction(async (tx) => {
      if (existing) {
        if (existing.statusCode?.code?.toUpperCase() !== "OFS") {
          await retagDetailToOfficialSold(tx, existing.id, codes.ofsCodeId);
        }
      } else {
        await createOfficialSaleWithDetail(tx, {
          tenantId,
          userId,
          branchId: soldBranch.id,
          stockBranchId: inventory.branchId,
          transactionNo,
          transactionDate: row.drDate,
          deliveryNo: row.drNo,
          notes: buildSaleNotes(row, "ADD"),
          modelId,
          serialNumberId: inventory.serialNumberId,
          ofsCodeId: codes.ofsCodeId,
        });
      }
      await auditService.log({
        tenantId,
        userId,
        action: "official_sales.add",
        entityType: "BranchSalesTransaction",
        entityId: transactionNo,
        metadata: {
          serial: row.serial,
          path: "pullout_hold",
          pulloutHold: true,
          inventoryStatus: statusCode,
        },
      });
    });
    return "ADD — Official Sold (pullout hold kept)";
  }

  // Sellable path (typically STK): relocate on branch conflict, create or retag, set OFS
  if (statusCode !== "STK") {
    throw new Error(`Unsupported inventory status ${statusCode} for ADD`);
  }

  const duplicate = row.drNo
    ? await officialSalesRepository.findSaleDetailBySerialTransBranch(
        tenantId,
        row.serial,
        row.drNo,
        soldBranch.id,
        ["SLD", "OFS"],
      )
    : null;

  if (duplicate) {
    const dupCode = duplicate.statusCode?.code?.toUpperCase() ?? "";
    if (dupCode === "OFS") {
      await prisma.$transaction(async (tx) => {
        await markSerialSoldFromStockSource(tx, {
          tenantId,
          serialNumberId: inventory.serialNumberId,
          stockBranchId: inventory.branchId,
          soldBranchId: soldBranch.id,
          stkCodeId: codes.stkCodeId,
          targetStatusCodeId: codes.ofsCodeId,
          updatedById: userId,
        });
      });
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
          notes: "OS CONFLICT",
          action: "ADD",
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
      transactionDate: row.drDate,
      deliveryNo: row.drNo,
      notes: buildSaleNotes(row, "ADD"),
      modelId,
      serialNumberId: inventory.serialNumberId,
      ofsCodeId: codes.ofsCodeId,
    });

    await auditService.log({
      tenantId,
      userId,
      action: "official_sales.add",
      entityType: "BranchSalesTransaction",
      entityId: transactionNo,
      metadata: {
        serial: row.serial,
        branchId: soldBranch.id,
        transactionNo,
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
  const txn = row.drNo?.trim();
  if (!txn) {
    throw new Error("Trans # / SI/TRANS NO. is required for DEL");
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

  const stockBranchId =
    detail.sale.alternateBranchId ?? detail.sale.branchId;
  const soldBranchId = detail.sale.branchId;

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

    await restoreSerialToStockSource(tx, {
      tenantId,
      serialNumberId: detail.serialNumberId!,
      stockBranchId,
      soldBranchId,
      stkCodeId: codes.stkCodeId,
      soldStatusCodeIds: [codes.sldCodeId, codes.rsvCodeId, codes.ofsCodeId],
      updatedById: userId,
    });

    await auditService.log({
      tenantId,
      userId,
      action: "official_sales.del",
      entityType: "BranchSalesTransactionDetail",
      entityId: detail.id,
      metadata: {
        serial: row.serial,
        transactionNo: detail.sale.transactionNo,
        previousStatus: detailCode,
        restored: "STK",
        notes: "Official Delete",
      },
    });
  });

  return "DEL — restored STK";
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
