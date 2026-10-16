import type { CreateAuditLogInput } from "@/features/audit/repositories/audit-log.repository";
import { auditService } from "@/features/audit/services/audit.service";
import {
  BRANCH_QUOTA_IMPORT_FIELD_LABELS,
  BRANCH_QUOTA_SHEET_NAME,
  type BranchQuotaImportChunkProgress,
  type BranchQuotaImportFieldChange,
  type BranchQuotaImportPreview,
  type BranchQuotaImportResult,
  type BranchQuotaImportRowError,
  type BranchQuotaImportRowPlan,
} from "@/features/branch-quotas/schemas/branch-quota-import.schema";
import {
  formatQuotaAmount,
  isBlankOrDash,
  lookupKey,
  parseImportMonth,
  parseImportQuotaAmount,
  quotaImportUniqueKey,
} from "@/features/branch-quotas/services/branch-quota-import.validation";
import {
  buildBranchQuotaTemplateWorkbook,
  readBranchQuotaImportWorkbook,
  type BranchQuotaTemplateRow,
  type SheetRows,
} from "@/features/branch-quotas/services/branch-quota-import.workbook";
import { prisma } from "@/lib/database/client";
import { mapWithConcurrency } from "@/lib/shared/concurrency";
import {
  getCachedPlan,
  invalidatePlan,
  planKeyFor,
  setCachedPlan,
} from "@/lib/shared/import-plan-cache";

const MAX_ROWS = 20_000;
const APPLY_CHUNK_SIZE = 250;
const WRITE_CONCURRENCY = 8;
const PLAN_NAMESPACE = "branch-quota-import";

interface QuotaWriteFields {
  branchId: string;
  brandId: string;
  quotaDate: Date;
  quotaAmount: number;
}

interface RowPlanInternal extends BranchQuotaImportRowPlan {
  /** Existing quota id when updating; null when creating. */
  quotaId: string | null;
  fields: QuotaWriteFields;
}

interface ImportPlan {
  preview: BranchQuotaImportPreview;
  writes: RowPlanInternal[];
}

function display(value: string | null | undefined): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text ? text : "—";
}

function pushChange(
  changes: BranchQuotaImportFieldChange[],
  field: keyof typeof BRANCH_QUOTA_IMPORT_FIELD_LABELS,
  from: string | null | undefined,
  to: string | null | undefined,
) {
  const fromDisplay = display(from);
  const toDisplay = display(to);
  if (fromDisplay === toDisplay) return;
  changes.push({
    field,
    label: BRANCH_QUOTA_IMPORT_FIELD_LABELS[field] ?? field,
    from: fromDisplay,
    to: toDisplay,
  });
}

function monthLabelFromDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function loadTemplateRows(tenantId: string): Promise<BranchQuotaTemplateRow[]> {
  const quotas = await prisma.branchQuota.findMany({
    where: { tenantId },
    select: {
      quotaDate: true,
      quotaAmount: true,
      branch: { select: { sapCode: true } },
      brand: { select: { name: true } },
    },
    orderBy: [{ quotaDate: "desc" }, { branch: { name: "asc" } }],
  });

  return quotas.map((row) => ({
    branchSapCode: row.branch.sapCode,
    brandName: row.brand.name,
    month: monthLabelFromDate(row.quotaDate),
    quotaAmount: formatQuotaAmount(Number(row.quotaAmount)),
  }));
}

/**
 * Diff sheet rows against existing quotas. Unknown branch SAP / brand → errors.
 * Last-wins on duplicate unique keys within the file.
 */
export async function buildPlanFromSheet(
  tenantId: string,
  sheet: SheetRows,
): Promise<ImportPlan> {
  if (sheet.rows.length === 0) {
    throw new Error("The file has no data rows.");
  }
  if (sheet.rows.length > MAX_ROWS) {
    throw new Error(`Too many rows (max ${MAX_ROWS}). Split the file and try again.`);
  }

  const [branches, brands, quotas] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, sapCode: true },
    }),
    prisma.brand.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
    prisma.branchQuota.findMany({
      where: { tenantId },
      select: {
        id: true,
        branchId: true,
        brandId: true,
        quotaDate: true,
        quotaAmount: true,
      },
    }),
  ]);

  const branchBySap = new Map(branches.map((b) => [lookupKey(b.sapCode), b]));
  const brandByName = new Map(brands.map((b) => [lookupKey(b.name), b]));
  const existingByKey = new Map(
    quotas.map((q) => [
      quotaImportUniqueKey(q.branchId, q.brandId, monthLabelFromDate(q.quotaDate)),
      q,
    ]),
  );

  const errors: BranchQuotaImportRowError[] = [];
  /** Last-wins per unique key so duplicate sheet rows don't double-write. */
  const plannedByKey = new Map<string, RowPlanInternal | BranchQuotaImportRowPlan>();

  for (const row of sheet.rows) {
    const sapCode = row.values.branchsapcode?.trim() ?? "";
    const brandName = row.values.brandname?.trim() ?? "";
    const monthRaw = row.values.month?.trim() ?? "";
    const amountRaw = row.values.quotaamount?.trim() ?? "";
    const identity = [sapCode, brandName, monthRaw].filter(Boolean).join(" / ") || "—";

    if (isBlankOrDash(sapCode)) {
      errors.push({
        sheet: BRANCH_QUOTA_SHEET_NAME,
        rowNumber: row.rowNumber,
        identity,
        message: "branch_sap_code is empty.",
      });
      continue;
    }

    if (isBlankOrDash(brandName)) {
      errors.push({
        sheet: BRANCH_QUOTA_SHEET_NAME,
        rowNumber: row.rowNumber,
        identity,
        message: "brand_name is empty.",
      });
      continue;
    }

    const branch = branchBySap.get(lookupKey(sapCode));
    if (!branch) {
      errors.push({
        sheet: BRANCH_QUOTA_SHEET_NAME,
        rowNumber: row.rowNumber,
        identity,
        message: `Branch "${sapCode}" does not exist.`,
      });
      continue;
    }

    const brand = brandByName.get(lookupKey(brandName));
    if (!brand) {
      errors.push({
        sheet: BRANCH_QUOTA_SHEET_NAME,
        rowNumber: row.rowNumber,
        identity,
        message: `Brand "${brandName}" does not exist.`,
      });
      continue;
    }

    const monthParsed = parseImportMonth(monthRaw);
    if ("error" in monthParsed) {
      errors.push({
        sheet: BRANCH_QUOTA_SHEET_NAME,
        rowNumber: row.rowNumber,
        identity,
        message: monthParsed.error,
      });
      continue;
    }

    const amountParsed = parseImportQuotaAmount(amountRaw);
    if ("error" in amountParsed) {
      errors.push({
        sheet: BRANCH_QUOTA_SHEET_NAME,
        rowNumber: row.rowNumber,
        identity,
        message: amountParsed.error,
      });
      continue;
    }

    const key = quotaImportUniqueKey(branch.id, brand.id, monthParsed.monthLabel);
    const existing = existingByKey.get(key);
    const changes: BranchQuotaImportFieldChange[] = [];
    const fields: QuotaWriteFields = {
      branchId: branch.id,
      brandId: brand.id,
      quotaDate: monthParsed.quotaDate,
      quotaAmount: amountParsed.amount,
    };

    if (!existing) {
      pushChange(changes, "quotaAmount", null, formatQuotaAmount(amountParsed.amount));
      plannedByKey.set(key, {
        rowNumber: row.rowNumber,
        branchSapCode: branch.sapCode,
        branchName: branch.name,
        brandName: brand.name,
        month: monthParsed.monthLabel,
        action: "create",
        changes,
        quotaId: null,
        fields,
      });
      continue;
    }

    const currentAmount = Number(existing.quotaAmount);
    const fromAmount = formatQuotaAmount(currentAmount);
    const toAmount = formatQuotaAmount(amountParsed.amount);
    if (fromAmount === toAmount) {
      plannedByKey.set(key, {
        rowNumber: row.rowNumber,
        branchSapCode: branch.sapCode,
        branchName: branch.name,
        brandName: brand.name,
        month: monthParsed.monthLabel,
        action: "skip",
        changes: [],
      });
      continue;
    }

    pushChange(changes, "quotaAmount", fromAmount, toAmount);
    plannedByKey.set(key, {
      rowNumber: row.rowNumber,
      branchSapCode: branch.sapCode,
      branchName: branch.name,
      brandName: brand.name,
      month: monthParsed.monthLabel,
      action: "update",
      changes,
      quotaId: existing.id,
      fields,
    });
  }

  const previewRows = [...plannedByKey.values()];
  const writes = previewRows.filter(
    (row): row is RowPlanInternal => row.action === "create" || row.action === "update",
  );
  const createCount = writes.filter((row) => row.action === "create").length;
  const updateCount = writes.filter((row) => row.action === "update").length;
  const unchangedCount = previewRows.filter((row) => row.action === "skip").length;
  const canApply = errors.length === 0 && writes.length > 0;

  return {
    writes,
    preview: {
      rowCount: sheet.rows.length,
      createCount,
      updateCount,
      unchangedCount,
      canApply,
      errors,
      rows: previewRows,
    },
  };
}

async function applyWriteSlice(
  tenantId: string,
  actorUserId: string,
  chunk: RowPlanInternal[],
): Promise<{ created: number; updated: number }> {
  const toCreate = chunk.filter((row) => row.action === "create");
  const toUpdate = chunk.filter((row) => row.action === "update" && row.quotaId);

  const auditRows: CreateAuditLogInput[] = [];
  let created = 0;
  let updated = 0;

  if (toCreate.length > 0) {
    await mapWithConcurrency(toCreate, WRITE_CONCURRENCY, async (row) => {
      const createdRow = await prisma.branchQuota.create({
        data: {
          tenantId,
          branchId: row.fields.branchId,
          brandId: row.fields.brandId,
          quotaDate: row.fields.quotaDate,
          quotaAmount: row.fields.quotaAmount,
        },
      });
      created += 1;
      auditRows.push({
        tenantId,
        userId: actorUserId,
        action: "branch_quota.created",
        entityType: "BranchQuota",
        entityId: createdRow.id,
        metadata: {
          source: "excel-import",
          branchSapCode: row.branchSapCode,
          brandName: row.brandName,
          month: row.month,
          quotaAmount: row.fields.quotaAmount,
        },
      });
    });
  }

  if (toUpdate.length > 0) {
    await mapWithConcurrency(toUpdate, WRITE_CONCURRENCY, async (row) => {
      await prisma.branchQuota.update({
        where: { id: row.quotaId!, tenantId },
        data: {
          quotaAmount: row.fields.quotaAmount,
        },
      });
      updated += 1;
      auditRows.push({
        tenantId,
        userId: actorUserId,
        action: "branch_quota.updated",
        entityType: "BranchQuota",
        entityId: row.quotaId!,
        metadata: {
          source: "excel-import",
          branchSapCode: row.branchSapCode,
          brandName: row.brandName,
          month: row.month,
          quotaAmount: row.fields.quotaAmount,
          changes: row.changes.map((change) => change.field),
        },
      });
    });
  }

  if (auditRows.length > 0) {
    await auditService.logMany(auditRows);
  }

  return { created, updated };
}

function emptyChunkProgress(
  total: number,
  planKey: string | undefined,
  unchangedCount: number,
): BranchQuotaImportChunkProgress {
  return {
    processed: total,
    total,
    nextOffset: total,
    done: true,
    created: 0,
    updated: 0,
    unchanged: unchangedCount,
    planKey,
    result: { created: 0, updated: 0, unchanged: unchangedCount },
  };
}

function planExpiredProgress(offset: number): BranchQuotaImportChunkProgress {
  return {
    processed: offset,
    total: 0,
    nextOffset: offset,
    done: false,
    created: 0,
    updated: 0,
    planExpired: true,
  };
}

export const branchQuotaImportService = {
  async buildTemplate(tenantId: string): Promise<Buffer> {
    const rows = await loadTemplateRows(tenantId);
    return buildBranchQuotaTemplateWorkbook(rows);
  },

  async resolvePlan(input: {
    tenantId: string;
    file?: Buffer;
    planKey?: string;
  }): Promise<{ plan: ImportPlan; planKey: string } | null> {
    if (input.planKey) {
      const cached = getCachedPlan<ImportPlan>(input.planKey);
      if (cached) return { plan: cached, planKey: input.planKey };
    }
    if (!input.file) return null;

    const planKey = planKeyFor(PLAN_NAMESPACE, input.tenantId, input.file);
    const cached = getCachedPlan<ImportPlan>(planKey);
    if (cached) return { plan: cached, planKey };

    const sheet = await readBranchQuotaImportWorkbook(input.file);
    const plan = await buildPlanFromSheet(input.tenantId, sheet);
    setCachedPlan(planKey, plan);
    return { plan, planKey };
  },

  async buildPlan(
    tenantId: string,
    file: Buffer,
  ): Promise<{ preview: BranchQuotaImportPreview; planKey: string }> {
    const resolved = await this.resolvePlan({ tenantId, file });
    if (!resolved) throw new Error("Could not read the file.");
    return { preview: resolved.plan.preview, planKey: resolved.planKey };
  },

  async applyChunk(input: {
    tenantId: string;
    actorUserId: string;
    file?: Buffer;
    planKey?: string;
    offset: number;
  }): Promise<BranchQuotaImportChunkProgress> {
    const resolved = await this.resolvePlan(input);
    if (!resolved) return planExpiredProgress(input.offset);

    const { plan, planKey } = resolved;
    if (plan.preview.errors.length > 0) {
      const count = plan.preview.errors.length;
      throw new Error(
        `Fix ${count} problem${count === 1 ? "" : "s"} in the spreadsheet and upload again.`,
      );
    }

    const writes = plan.writes;
    const total = writes.length;
    const unchangedCount = plan.preview.unchangedCount;

    if (total === 0 || input.offset >= total) {
      invalidatePlan(planKey);
      return emptyChunkProgress(total, planKey, unchangedCount);
    }

    const chunk = writes.slice(input.offset, input.offset + APPLY_CHUNK_SIZE);
    const written = await applyWriteSlice(input.tenantId, input.actorUserId, chunk);
    const nextOffset = input.offset + chunk.length;
    const done = nextOffset >= total;
    if (done) invalidatePlan(planKey);

    return {
      processed: nextOffset,
      total,
      nextOffset,
      done,
      created: written.created,
      updated: written.updated,
      unchanged: unchangedCount,
      planKey,
      result: done
        ? {
            created: written.created,
            updated: written.updated,
            unchanged: unchangedCount,
          }
        : undefined,
    };
  },

  async apply(input: {
    tenantId: string;
    actorUserId: string;
    file: Buffer;
  }): Promise<BranchQuotaImportResult> {
    let offset = 0;
    let planKey: string | undefined;
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (;;) {
      const progress = await this.applyChunk({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        file: input.file,
        planKey,
        offset,
      });
      if (progress.planKey) planKey = progress.planKey;
      if (progress.unchanged != null) unchanged = progress.unchanged;
      created += progress.created;
      updated += progress.updated;
      if (progress.done) {
        return { created, updated, unchanged };
      }
      offset = progress.nextOffset;
    }
  },
};
