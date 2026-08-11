"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { officialSalesService } from "@/features/official-sales/services/official-sales.service";
import { officialSalesKpiService } from "@/features/official-sales/services/official-sales-kpi.service";
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
    siDate: row.siDate ? row.siDate.toISOString().slice(0, 10) : null,
    siNo: row.siNo,
    branchSold: row.branchSold,
    action: row.action,
    dealer: row.dealer,
    brand: row.brand,
    itemModel: row.itemModel,
    saleAmount:
      row.saleAmount == null ? null : row.saleAmount.toString(),
    packageName: row.packageName,
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

/** Returns the workbook base64-encoded — server action results must be serializable. */
export async function downloadOfficialSalesTemplateAction(): Promise<string> {
  await requirePermission("official_sales.manage");
  const workbook = await officialSalesService.buildTemplate();
  return workbook.toString("base64");
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

export async function getOfficialSalesKpisAction() {
  const session = await requireAnyPermission([
    "official_sales.view",
    "official_sales.manage",
  ]);
  return officialSalesKpiService.getKpis(session.user.tenantId);
}

export async function deleteOfficialSalesRowsAction(input: { rowIds: string[] }) {
  const session = await requirePermission("official_sales.manage");
  const parsed = z
    .object({ rowIds: z.array(z.string().min(1)).min(1) })
    .safeParse(input);
  if (!parsed.success) return { error: "Select at least one row to delete" };

  try {
    const deleted = await officialSalesService.deleteRows(
      session.user.tenantId,
      session.user.id,
      parsed.data.rowIds,
    );
    revalidatePath("/reports/official-sales");
    return { success: true as const, deleted };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed" };
  }
}
