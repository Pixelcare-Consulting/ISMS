"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { auditService } from "@/features/audit/services/audit.service";
import { aorService } from "@/features/aors/services/aor.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { salesRepository } from "@/features/sales/repositories/sales.repository";
import {
  SALES_ACCESS_PERMISSIONS,
  SALES_CREATE,
  SALES_RETURN_APPROVE,
  SALES_RETURN_COMPLETE,
  SALES_RETURN_EVALUATE,
  SALES_RETURN_REQUEST,
  salesReturnRejectPermissions,
} from "@/features/sales/constants/sales-permissions";
import {
  generateSaleTransactionNo,
  isSaleTransactionNo,
} from "@/features/sales/utils/sale-transaction-no";
import { hasPermission, requireAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";
import { getObjectStorage } from "@/lib/storage";

const saleDetailSchema = z.object({
  packageTypeId: z.string().min(1),
  brandId: z.string().min(1),
  promoTypeId: z.string().optional(),
  modelId: z.string().min(1),
  serialNumberId: z.string().min(1),
  saleAmount: z.coerce.number().positive(),
  modelPrice: z.coerce.number().nonnegative().optional(),
});

const saleSchema = z.object({
  transactionNo: z
    .string()
    .trim()
    .min(1)
    .refine(isSaleTransactionNo, "Invalid transaction number"),
  branchId: z.string().min(1),
  alternateBranchId: z.string().min(1),
  customerName: z.string().trim().min(1),
  contactNo: z.string().trim().max(50).optional(),
  siTrans: z.string().trim().min(1),
  paymentTypeId: z.string().min(1),
  saleTypeId: z.string().min(1),
  customerDeliveryMethodId: z.string().min(1),
  infoSlipVsoRrReleased: z.string().trim().optional(),
  rrReceiveDeliver: z.string().trim().optional(),
  proof: z.string().trim().optional(),
  transactionDate: z.string().optional(),
  reserved: z.boolean().optional(),
  details: z.array(saleDetailSchema).min(1),
});

const SALES_PROOF_PREFIX = "sales-proofs";

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

/** Stock source may be an alternate warehouse of an AOR branch. */
async function assertStockLocationReadable(
  tenantId: string,
  userId: string,
  stockBranchId: string,
  permissions: string[] | undefined,
) {
  const unrestricted =
    hasPermission(permissions, "branches.manage") ||
    hasPermission(permissions, "master_data.manage");
  if (unrestricted) return;

  const branchIds = await aorService.getBranchIdsForUser(tenantId, userId);
  if (branchIds?.includes(stockBranchId)) return;

  const alt = await prisma.alternateWarehouse.findFirst({
    where: {
      alternateBranchId: stockBranchId,
      branchId: { in: branchIds ?? [] },
      branch: { tenantId },
    },
    select: { id: true },
  });
  if (!alt) {
    throw new Error("Branch not in your area of responsibility");
  }
}

async function assertValidStockSource(
  tenantId: string,
  soldBranchId: string,
  alternateBranchId: string,
) {
  if (alternateBranchId === soldBranchId) return;
  const alt = await prisma.alternateWarehouse.findFirst({
    where: {
      branchId: soldBranchId,
      alternateBranchId,
      branch: { tenantId },
    },
    select: { id: true },
  });
  if (!alt) {
    throw new Error("Stock source must be the sold branch or one of its alternate warehouses");
  }
}

export async function listSalesAction(input?: { page?: number; limit?: number }) {
  const session = await requireAnyPermission([...SALES_ACCESS_PERMISSIONS]);
  const result = await salesRepository.listForTenant(session.user.tenantId, {
    page: input?.page,
    limit: parseTablePageSize(input?.limit),
  });

  return {
    ...result,
    items: result.items.map((row) => {
      const serialNumbers = row.details
        .map((d) => d.serialNumber?.serialNo)
        .filter((s): s is string => Boolean(s));
      const firstSerial = serialNumbers[0] ?? null;
      const serialCount = serialNumbers.length;
      const serialLabel =
        serialCount <= 1
          ? firstSerial
          : firstSerial
            ? `${firstSerial} (+${serialCount - 1})`
            : null;
      return {
        id: row.id,
        transactionNo: row.transactionNo,
        amount: row.amount.toString(),
        atrStatus: row.atrStatus,
        branch: row.branch,
        serialNumber: serialLabel ? { serialNo: serialLabel } : null,
        serialNumbers,
        returnRequest: row.returnRequest
          ? { id: row.returnRequest.id, status: row.returnRequest.status }
          : null,
      };
    }),
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

export async function listPaymentTypesForSalesAction() {
  const session = await requirePermission("sales.create");
  return prisma.paymentType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listSaleTypesForSalesAction() {
  const session = await requirePermission("sales.create");
  return prisma.saleType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listCustomerDeliveryMethodsForSalesAction() {
  const session = await requirePermission("sales.create");
  return prisma.customerDeliveryMethod.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listPromoTypesForSalesAction() {
  const session = await requirePermission("sales.create");
  return prisma.promoType.findMany({
    where: { tenantId: session.user.tenantId, recordStatus: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listBrandsForSalesAction() {
  const session = await requirePermission("sales.create");
  return prisma.brand.findMany({
    where: { tenantId: session.user.tenantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listStockSourceBranchesForSalesAction(branchId: string) {
  const session = await requirePermission("sales.create");
  await assertBranchInAor(
    session.user.tenantId,
    session.user.id,
    branchId,
    session.user.permissions,
  );

  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId: session.user.tenantId },
    select: {
      id: true,
      name: true,
      alternateWarehouses: {
        select: {
          alternateBranch: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!branch) return [];

  const options = [{ id: branch.id, name: branch.name }];
  for (const row of branch.alternateWarehouses) {
    if (row.alternateBranch.id === branch.id) continue;
    options.push({
      id: row.alternateBranch.id,
      name: `${row.alternateBranch.name} (alternate)`,
    });
  }
  return options;
}

export async function listModelsForSalesAction(brandId?: string) {
  const session = await requirePermission("sales.create");
  const rows = await prisma.productModel.findMany({
    where: {
      tenantId: session.user.tenantId,
      status: "active",
      ...(brandId ? { brandId } : {}),
    },
    select: { id: true, skuCode: true, name: true, srp: true, brandId: true },
    orderBy: { skuCode: "asc" },
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    skuCode: r.skuCode,
    name: r.name,
    brandId: r.brandId,
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
  await assertStockLocationReadable(
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

export async function uploadSaleProofAction(formData: FormData) {
  const session = await requirePermission("sales.create");
  try {
    const file = formData.get("proof");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "No file selected" as const };
    }

    const fileId = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${SALES_PROOF_PREFIX}/tenants/${session.user.tenantId}/${fileId}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = getObjectStorage();
    await storage.upload({
      path: storagePath,
      body: buffer,
      contentType: file.type || "application/octet-stream",
    });

    return { success: true as const, path: storagePath };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to upload proof",
    };
  }
}

export async function allocateSaleTransactionNoAction() {
  const session = await requirePermission("sales.create");

  for (let attempt = 0; attempt < 8; attempt++) {
    const transactionNo = generateSaleTransactionNo(Date.now() + attempt);
    const existing = await prisma.branchSalesTransaction.findFirst({
      where: { tenantId: session.user.tenantId, transactionNo },
      select: { id: true },
    });
    if (!existing) return { transactionNo };
  }

  return { error: "Could not allocate a transaction number" as const };
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
    await assertValidStockSource(
      session.user.tenantId,
      parsed.data.branchId,
      parsed.data.alternateBranchId,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Access denied" };
  }

  const details = parsed.data.details;
  const serialIds = details.map((d) => d.serialNumberId);
  if (new Set(serialIds).size !== serialIds.length) {
    return { error: "Duplicate serials in the same transaction are not allowed" };
  }

  const taken = await prisma.branchSalesTransaction.findFirst({
    where: {
      tenantId: session.user.tenantId,
      transactionNo: parsed.data.transactionNo,
    },
    select: { id: true },
  });
  if (taken) {
    return { error: "Transaction number already used. Reload the page for a new number." };
  }

  const transactionNo = parsed.data.transactionNo;
  const amount = details.reduce((sum, d) => sum + d.saleAmount, 0);
  const modelPriceRollup = details.find((d) => d.modelPrice != null)?.modelPrice;
  const stockBranchId = parsed.data.alternateBranchId;

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
      const packageIds = [...new Set(details.map((d) => d.packageTypeId))];
      const brandIds = [...new Set(details.map((d) => d.brandId))];
      const promoIds = [
        ...new Set(
          details
            .map((d) => d.promoTypeId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const [pkgs, brands, promos, payment, saleType, delivery] = await Promise.all([
        tx.packageType.findMany({
          where: {
            id: { in: packageIds },
            tenantId: session.user.tenantId,
            recordStatus: "active",
          },
          select: { id: true },
        }),
        tx.brand.findMany({
          where: { id: { in: brandIds }, tenantId: session.user.tenantId },
          select: { id: true },
        }),
        promoIds.length
          ? tx.promoType.findMany({
              where: {
                id: { in: promoIds },
                tenantId: session.user.tenantId,
                recordStatus: "active",
              },
              select: { id: true },
            })
          : Promise.resolve([]),
        tx.paymentType.findFirst({
          where: {
            id: parsed.data.paymentTypeId,
            tenantId: session.user.tenantId,
            recordStatus: "active",
          },
          select: { id: true },
        }),
        tx.saleType.findFirst({
          where: {
            id: parsed.data.saleTypeId,
            tenantId: session.user.tenantId,
            recordStatus: "active",
          },
          select: { id: true },
        }),
        tx.customerDeliveryMethod.findFirst({
          where: {
            id: parsed.data.customerDeliveryMethodId,
            tenantId: session.user.tenantId,
            recordStatus: "active",
          },
          select: { id: true },
        }),
      ]);

      if (pkgs.length !== packageIds.length) throw new Error("Package type not found");
      if (brands.length !== brandIds.length) throw new Error("Brand not found");
      if (promoIds.length && promos.length !== promoIds.length) {
        throw new Error("Promo type not found");
      }
      if (!payment) throw new Error("Payment type not found");
      if (!saleType) throw new Error("Sale type not found");
      if (!delivery) throw new Error("Customer delivery method not found");

      const created = await tx.branchSalesTransaction.create({
        data: {
          tenantId: session.user.tenantId,
          branchId: parsed.data.branchId,
          alternateBranchId: stockBranchId,
          paymentTypeId: parsed.data.paymentTypeId,
          saleTypeId: parsed.data.saleTypeId,
          customerDeliveryMethodId: parsed.data.customerDeliveryMethodId,
          transactionNo,
          transactionDate,
          customerName: parsed.data.customerName,
          contactNo: parsed.data.contactNo || null,
          siTrans: parsed.data.siTrans,
          infoSlipVsoRrReleased: parsed.data.infoSlipVsoRrReleased || null,
          rrReceiveDeliver: parsed.data.rrReceiveDeliver || null,
          proof: parsed.data.proof || null,
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
            branchId: stockBranchId,
            statusCodeId: stkCodeId,
          },
          data: { statusCodeId: targetStatusCodeId, updatedById: session.user.id },
        });
        if (updated.count === 0) {
          throw new Error("Serial is not in sellable stock at the stock source branch");
        }

        await tx.branchSalesTransactionDetail.create({
          data: {
            salesId: created.id,
            packageTypeId: detail.packageTypeId,
            brandId: detail.brandId,
            promoTypeId: detail.promoTypeId ?? null,
            modelId: detail.modelId,
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
      stockSourceBranchId: stockBranchId,
    },
  });

  revalidatePath("/sales");
  revalidatePath("/sales/new");
  revalidatePath("/inventory");
  return { success: true as const };
}

export async function requestReturnAction(saleId: string, notes?: string) {
  const session = await requireAnyPermission([SALES_RETURN_REQUEST, SALES_CREATE]);
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
  const session = await requirePermission(SALES_RETURN_EVALUATE);
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
  const session = await requireAnyPermission([SALES_RETURN_APPROVE, "orders.approve"]);
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
  const session = await requireAnyPermission([
    SALES_RETURN_EVALUATE,
    SALES_RETURN_APPROVE,
    SALES_CREATE,
    "orders.approve",
  ]);
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: { sale: true },
  });
  if (!row || !["pending_cs", "pending_tl"].includes(row.status)) {
    return { error: "Return request cannot be rejected" };
  }

  const allowed = salesReturnRejectPermissions(row.status);
  if (!allowed.some((slug) => hasPermission(session.user.permissions, slug))) {
    return { error: "You do not have permission to reject this return" };
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
  const session = await requireAnyPermission([
    SALES_RETURN_COMPLETE,
    "logistics.manage",
    SALES_CREATE,
  ]);
  const row = await prisma.branchReturnRequest.findFirst({
    where: { id: returnRequestId, tenantId: session.user.tenantId },
    include: {
      sale: {
        include: {
          details: { select: { serialNumberId: true } },
        },
      },
    },
  });
  if (!row || row.status !== "approved") {
    return { error: "Return must be TL-approved before inventory restore" };
  }

  const stkCodeId = await reasonStatusService.requireCodeId(
    session.user.tenantId,
    "inventory_system",
    "STK",
  );

  const stockBranchId = row.sale.alternateBranchId ?? row.sale.branchId;
  // Detail.serialNumberId is required in Prisma, but the live DB previously allowed
  // ON DELETE SET NULL — filter so restore never upserts a null serial key.
  const serialIds = [
    ...new Set(
      row.sale.details
        .map((d) => d.serialNumberId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  if (serialIds.length === 0) {
    return {
      error:
        "Cannot restore stock — this sale has no linked serial numbers. Check the sale details or contact support.",
    };
  }

  await prisma.$transaction(async (tx) => {
    for (const serialNumberId of serialIds) {
      await tx.branchInventory.upsert({
        where: {
          branchId_serialNumberId: {
            branchId: stockBranchId,
            serialNumberId,
          },
        },
        update: { statusCodeId: stkCodeId, updatedById: session.user.id },
        create: {
          tenantId: session.user.tenantId,
          branchId: stockBranchId,
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
    metadata: {
      transactionNo: row.sale.transactionNo,
      restoredSerialCount: serialIds.length,
    },
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
