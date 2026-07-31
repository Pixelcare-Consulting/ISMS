"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { auditService } from "@/features/audit/services/audit.service";
import { aorService } from "@/features/aors/services/aor.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { salesRepository } from "@/features/sales/repositories/sales.repository";
import { hasPermission, requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

const saleDetailSchema = z.object({
  packageTypeId: z.string().optional(),
  modelId: z.string().optional(),
  serialNumberId: z.string().min(1),
  saleAmount: z.coerce.number().positive(),
  modelPrice: z.coerce.number().nonnegative().optional(),
});

const saleSchema = z.object({
  branchId: z.string().min(1),
  customerName: z.string().trim().min(1),
  transactionDate: z.string().optional(),
  reserved: z.boolean().optional(),
  details: z.array(saleDetailSchema).min(1),
});

async function assertBranchInAor(
  tenantId: string,
  userId: string,
  branchId: string,
  permissions: string[] | undefined,
) {
  const unrestricted =
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage");
  if (unrestricted) return;

  const branchIds = await aorService.getBranchIdsForUser(tenantId, userId);
  if (!branchIds?.includes(branchId)) {
    throw new Error("Branch not in your area of responsibility");
  }
}

export async function listSalesAction(input?: { page?: number; limit?: number }) {
  const session = await requirePermission("sales.create");
  const result = await salesRepository.listForTenant(session.user.tenantId, {
    page: input?.page,
    limit: parseTablePageSize(input?.limit),
  });

  return {
    ...result,
    items: result.items.map((row) => ({
      id: row.id,
      transactionNo: row.transactionNo,
      amount: row.amount.toString(),
      atrStatus: row.atrStatus,
      branch: row.branch,
      serialNumber: row.serialNumber,
      returnRequest: row.returnRequest
        ? { id: row.returnRequest.id, status: row.returnRequest.status }
        : null,
    })),
  };
}

export async function listPackageTypesForSalesAction() {
  const session = await requirePermission("sales.create");
  const rows = await prisma.packageType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true, quantity: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

export async function listModelsForSalesAction() {
  const session = await requirePermission("sales.create");
  const rows = await prisma.productModel.findMany({
    where: { tenantId: session.user.tenantId, status: "active" },
    select: { id: true, skuCode: true, name: true, srp: true },
    orderBy: { skuCode: "asc" },
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    skuCode: r.skuCode,
    name: r.name,
    srp: r.srp != null ? r.srp.toString() : null,
  }));
}

export async function resolveModelPriceForSalesAction(input: {
  modelId: string;
  packageTypeId?: string;
}) {
  const session = await requirePermission("sales.create");
  const now = new Date();
  const priceList = await prisma.priceList.findFirst({
    where: {
      tenantId: session.user.tenantId,
      modelId: input.modelId,
      periodStart: { lte: now },
      periodEnd: { gte: now },
      ...(input.packageTypeId
        ? {
            OR: [{ packageTypeId: input.packageTypeId }, { packageTypeId: null }],
          }
        : {}),
    },
    orderBy: [{ packageTypeId: "desc" }, { periodStart: "desc" }],
    select: { amount: true },
  });
  if (priceList) return Number(priceList.amount.toString());

  const model = await prisma.productModel.findFirst({
    where: { id: input.modelId, tenantId: session.user.tenantId },
    select: { srp: true },
  });
  if (model?.srp != null) return Number(model.srp.toString());
  return null;
}

export async function listSaleableSerialsAction(
  branchId: string,
  modelId?: string,
) {
  const session = await requirePermission("sales.create");
  await assertBranchInAor(
    session.user.tenantId,
    session.user.id,
    branchId,
    session.user.permissions,
  );

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const rows = await prisma.branchInventory.findMany({
    where: {
      tenantId: session.user.tenantId,
      branchId,
      statusCodeId: stkCodeId,
      ...(modelId
        ? { serialNumber: { modelId } }
        : {}),
    },
    include: {
      serialNumber: {
        select: {
          id: true,
          serialNo: true,
          modelId: true,
          model: { select: { skuCode: true, name: true } },
        },
      },
    },
    orderBy: { serialNumber: { serialNo: "asc" } },
    take: 500,
  });

  return rows.map((r) => ({
    id: r.serialNumber.id,
    serialNo: r.serialNumber.serialNo,
    modelId: r.serialNumber.modelId,
    skuCode: r.serialNumber.model.skuCode,
    modelName: r.serialNumber.model.name,
  }));
}

export async function createSaleAction(input: unknown) {
  const session = await requirePermission("sales.create");
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid sale" };

  try {
    await assertBranchInAor(
      session.user.tenantId,
      session.user.id,
      parsed.data.branchId,
      session.user.permissions,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied" };
  }

  const details = parsed.data.details;
  const serialIds = details.map((d) => d.serialNumberId);
  if (new Set(serialIds).size !== serialIds.length) {
    return { error: "Duplicate serials in the same transaction are not allowed" };
  }

  const transactionNo = `SAL-${Date.now().toString(36).toUpperCase()}`;
  const firstDetail = details[0]!;
  const amount = details.reduce((sum, d) => sum + d.saleAmount, 0);
  const modelPriceRollup = details.find((d) => d.modelPrice != null)?.modelPrice;
  const packageTypeId = firstDetail.packageTypeId ?? null;
  const headerSerialId = firstDetail.serialNumberId;

  let transactionDate: Date | null = null;
  if (parsed.data.transactionDate) {
    const d = new Date(parsed.data.transactionDate);
    if (Number.isNaN(d.getTime())) {
      return { error: "Invalid transaction date" };
    }
    transactionDate = d;
  }

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );
  const targetStatusCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    parsed.data.reserved ? "RSV" : "SLD",
  );

  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      if (packageTypeId) {
        const pkg = await tx.packageType.findFirst({
          where: {
            id: packageTypeId,
            tenantId: session.user.tenantId,
            recordStatus: "active",
          },
          select: { id: true },
        });
        if (!pkg) {
          throw new Error("Package type not found");
        }
      }

      const created = await tx.branchSalesTransaction.create({
        data: {
          tenantId: session.user.tenantId,
          branchId: parsed.data.branchId,
          serialNumberId: headerSerialId,
          packageTypeId,
          transactionNo,
          transactionDate,
          customerName: parsed.data.customerName,
          amount,
          modelPrice: modelPriceRollup ?? null,
          atrStatus: "open",
          createdById: session.user.id,
        },
      });

      for (const detail of details) {
        const updated = await tx.branchInventory.updateMany({
          where: {
            tenantId: session.user.tenantId,
            serialNumberId: detail.serialNumberId,
            branchId: parsed.data.branchId,
            statusCodeId: stkCodeId,
          },
          data: { statusCodeId: targetStatusCodeId, updatedById: session.user.id },
        });
        if (updated.count === 0) {
          throw new Error("Serial is not in sellable stock at this branch");
        }

        await tx.branchSalesTransactionDetail.create({
          data: {
            salesId: created.id,
            modelId: detail.modelId ?? null,
            serialNumberId: detail.serialNumberId,
            saleAmount: detail.saleAmount,
            modelPrice: detail.modelPrice ?? null,
            amount: detail.saleAmount,
          },
        });
      }

      return created;
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to record sale" };
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: parsed.data.reserved ? "sale.reserved" : "sale.created",
    entityType: "BranchSalesTransaction",
    entityId: row.id,
    metadata: {
      transactionNo: row.transactionNo,
      reserved: Boolean(parsed.data.reserved),
      detailCount: details.length,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/sales/new");
  revalidatePath("/inventory");
  return { success: true as const };
}

export async function requestReturnAction(saleId: string, notes?: string) {
  const session = await requirePermission("sales.create");
  const sale = await prisma.branchSalesTransaction.findFirst({
    where: { id: saleId, tenantId: session.user.tenantId },
    include: { returnRequest: true },
  });
  if (!sale) return { error: "Sale not found" as const };
  if (sale.returnRequest) return { error: "Return already requested" as const };
  if (sale.atrStatus !== "open") return { error: "Sale is not eligible for return" as const };

  await prisma.$transaction([
    prisma.branchReturnRequest.create({
      data: {
        tenantId: session.user.tenantId,
        saleId,
        requestedById: session.user.id,
        requestNotes: notes,
      },
    }),
    prisma.branchSalesTransaction.update({
      where: { id: saleId },
      data: {
        atrStatus: "reserve",
        notes: notes
          ? [sale.notes, `[Return requested] ${notes}`].filter(Boolean).join("\n")
          : sale.notes
            ? `${sale.notes}\n[Return requested]`
            : "[Return requested]",
      },
    }),
  ]);

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sale.return_requested",
    entityType: "BranchSalesTransaction",
    entityId: saleId,
    metadata: { transactionNo: sale.transactionNo, atrStatus: "reserve" },
  });

  revalidatePath("/sales");
  return { success: true as const };
}

export async function evaluateReturnAction(returnRequestId: string, notes?: string) {
  const session = await requirePermission("sales.create");
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
  });
  if (!row || row.status !== "pending_cs") {
    return { error: "Return request not found or not pending CS evaluation" };
  }

  await prisma.branchReturnRequest.update({
    where: { id: returnRequestId },
    data: {
      status: "pending_tl",
      evaluatedById: session.user.id,
      evaluatedAt: new Date(),
      evaluationNotes: notes,
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "return.evaluated",
    entityType: "BranchReturnRequest",
    entityId: returnRequestId,
  });

  revalidatePath("/sales");
  return { success: true as const };
}

export async function approveReturnAction(returnRequestId: string) {
  const session = await requirePermission("orders.approve");
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
  });
  if (!row || row.status !== "pending_tl") {
    return { error: "Return request not found or not pending TL approval" };
  }

  await prisma.branchReturnRequest.update({
    where: { id: returnRequestId },
    data: {
      status: "approved",
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "return.approved",
    entityType: "BranchReturnRequest",
    entityId: returnRequestId,
  });

  revalidatePath("/sales");
  return { success: true as const };
}

export async function rejectReturnAction(returnRequestId: string, notes?: string) {
  const session = await requireAnyPermission(["orders.approve", "sales.create"]);
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: { sale: true },
  });
  if (!row || !["pending_cs", "pending_tl"].includes(row.status)) {
    return { error: "Return request cannot be rejected" };
  }

  await prisma.$transaction([
    prisma.branchReturnRequest.update({
      where: { id: returnRequestId },
      data: { status: "rejected", evaluationNotes: notes ?? row.evaluationNotes },
    }),
    prisma.branchSalesTransaction.update({
      where: { id: row.saleId },
      data: { atrStatus: "open" },
    }),
  ]);

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "return.rejected",
    entityType: "BranchReturnRequest",
    entityId: returnRequestId,
  });

  revalidatePath("/sales");
  return { success: true as const };
}

export async function completeReturnRestoreAction(returnRequestId: string) {
  const session = await requireAnyPermission(["logistics.manage", "sales.create"]);
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: { sale: true },
  });
  if (!row || row.status !== "approved") {
    return { error: "Return must be TL-approved before inventory restore" };
  }

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const serialNumberId = row.sale.serialNumberId;
  await prisma.$transaction(async (tx) => {
    if (serialNumberId) {
      await tx.branchInventory.upsert({
        where: {
          branchId_serialNumberId: {
            branchId: row.sale.branchId,
            serialNumberId,
          },
        },
        update: { statusCodeId: stkCodeId, updatedById: session.user.id },
        create: {
          tenantId: session.user.tenantId,
          branchId: row.sale.branchId,
          serialNumberId,
          statusCodeId: stkCodeId,
          updatedById: session.user.id,
        },
      });
    }
    await tx.branchReturnRequest.update({
      where: { id: returnRequestId },
      data: { status: "completed", completedAt: new Date() },
    });
    await tx.branchSalesTransaction.update({
      where: { id: row.saleId },
      data: { atrStatus: "closed" },
    });
  });

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "return.completed",
    entityType: "BranchReturnRequest",
    entityId: returnRequestId,
    metadata: { transactionNo: row.sale.transactionNo },
  });

  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { success: true as const };
}

export async function listStkSerialsForBranchAction(branchId: string) {
  const session = await requireAnyPermission(["logistics.manage", "orders.create", "sales.create"]);

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const rows = await prisma.branchInventory.findMany({
    where: {
      tenantId: session.user.tenantId,
      branchId,
      statusCodeId: stkCodeId,
    },
    include: {
      serialNumber: {
        select: {
          id: true,
          serialNo: true,
          model: { select: { skuCode: true, name: true } },
        },
      },
    },
    orderBy: { serialNumber: { serialNo: "asc" } },
    take: 200,
  });

  return rows.map((r) => ({
    id: r.serialNumber.id,
    serialNo: r.serialNumber.serialNo,
    skuCode: r.serialNumber.model.skuCode,
    modelName: r.serialNumber.model.name,
  }));
}
