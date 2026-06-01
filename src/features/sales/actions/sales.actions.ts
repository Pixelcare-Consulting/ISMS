"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditService } from "@/features/audit/services/audit.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { salesRepository } from "@/features/sales/repositories/sales.repository";
import { requirePermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/database/client";

const saleSchema = z.object({
  branchId: z.string().min(1),
  serialNumberId: z.string().optional(),
  amount: z.coerce.number().positive(),
  notes: z.string().optional(),
});

export async function listSalesAction(input?: { page?: number }) {
  const session = await requirePermission("sales.create");
  const result = await salesRepository.listForTenant(session.user.tenantId, {
    page: input?.page,
  });

  return {
    ...result,
    items: result.items.map((row) => ({
      id: row.id,
      amount: row.amount.toString(),
      atrStatus: row.atrStatus,
      branch: row.branch,
      serialNumber: row.serialNumber,
    })),
  };
}

export async function createSaleAction(input: unknown) {
  const session = await requirePermission("sales.create");
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid sale" };

  const transactionNo = `SAL-${Date.now().toString(36).toUpperCase()}`;
  const row = await prisma.branchSalesTransaction.create({
    data: {
      tenantId: session.user.tenantId,
      branchId: parsed.data.branchId,
      serialNumberId: parsed.data.serialNumberId ?? null,
      transactionNo,
      amount: parsed.data.amount,
      notes: parsed.data.notes,
      atrStatus: "open",
    },
  });

  if (parsed.data.serialNumberId) {
    const sldCodeId = await reasonStatusService.requireCodeId(
      session.user.tenantId,
      "inventory_system",
      "SLD",
    );
    await prisma.branchInventory.updateMany({
      where: {
        tenantId: session.user.tenantId,
        serialNumberId: parsed.data.serialNumberId,
        branchId: parsed.data.branchId,
      },
      data: { statusCodeId: sldCodeId, updatedById: session.user.id },
    });
  }

  await auditService.log({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "sale.created",
    entityType: "BranchSalesTransaction",
    entityId: row.id,
  });

  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { success: true as const };
}

export async function requestReturnAction(saleId: string, notes?: string) {
  const session = await requirePermission("sales.create");
  const sale = await prisma.branchSalesTransaction.findFirst({
    where: { id: saleId, tenantId: session.user.tenantId },
  });
  if (!sale) return { error: "Sale not found" as const };

  await prisma.branchSalesTransaction.update({
    where: { id: saleId },
    data: {
      atrStatus: "reserve",
      notes: notes
        ? [sale.notes, `[Return requested] ${notes}`].filter(Boolean).join("\n")
        : sale.notes
          ? `${sale.notes}\n[Return requested]`
          : "[Return requested]",
    },
  });

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

export async function updateAtrStatusAction(id: string, atrStatus: "open" | "reserve" | "closed") {
  const session = await requirePermission("sales.create");
  await prisma.branchSalesTransaction.update({
    where: { id, tenantId: session.user.tenantId },
    data: { atrStatus },
  });
  revalidatePath("/sales");
  return { success: true as const };
}
