"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { officialSalesService } from "@/features/official-sales/services/official-sales.service";
import { requireAnyPermission, requirePermission } from "@/lib/auth/permissions";

export async function listOfficialSalesStagingAction() {
  const session = await requireAnyPermission([
    "official_sales.view",
    "official_sales.manage",
  ]);
  const rows = await officialSalesService.listStaging(session.user.tenantId);
  return rows.map((row) => ({
    id: row.id,
    serial: row.serial,
    drDate: row.drDate ? row.drDate.toISOString().slice(0, 10) : null,
    drNo: row.drNo,
    result: row.result,
    status: row.status,
    processedAt: row.processedAt?.toISOString() ?? null,
    batchFileName: row.batch.fileName,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function uploadOfficialSalesAction(formData: FormData) {
  const session = await requirePermission("official_sales.manage");
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Choose an Excel or CSV file" };
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
    return { error: "Accepted formats: .xlsx, .xls, .csv" };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await officialSalesService.upload(
      session.user.tenantId,
      session.user.id,
      { name: file.name, buffer },
    );
    revalidatePath("/reports/official-sales");
    return { success: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function clearOfficialSalesTempAction() {
  const session = await requirePermission("official_sales.manage");
  try {
    const deleted = await officialSalesService.clearTemp(
      session.user.tenantId,
      session.user.id,
    );
    revalidatePath("/reports/official-sales");
    return { success: true as const, deleted };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Clear failed" };
  }
}

export async function processOfficialSalesAction(input?: { rowIds?: string[] }) {
  const session = await requirePermission("official_sales.manage");
  const parsed = z
    .object({ rowIds: z.array(z.string()).optional() })
    .safeParse(input ?? {});
  if (!parsed.success) return { error: "Invalid input" };

  try {
    const result = await officialSalesService.processRows(
      session.user.tenantId,
      session.user.id,
      parsed.data.rowIds,
    );
    revalidatePath("/reports/official-sales");
    return { success: true as const, ...result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Process failed" };
  }
}
