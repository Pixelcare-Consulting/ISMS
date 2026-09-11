import type { CreateAuditLogInput } from "@/features/audit/repositories/audit-log.repository";
import { auditService } from "@/features/audit/services/audit.service";
import {
  PRICE_LIST_IMPORT_FIELD_LABELS,
  PRICE_LIST_SHEET_NAME,
  type PriceListImportChunkProgress,
  type PriceListImportFieldChange,
  type PriceListImportPreview,
  type PriceListImportResult,
  type PriceListImportRowError,
  type PriceListImportRowPlan,
} from "@/features/master-data/schemas/price-list-import.schema";
import {
  buildPriceListTemplateWorkbook,
  readPriceListImportWorkbook,
  type PriceListTemplateRow,
  type SheetRows,
} from "@/features/master-data/services/price-list-import.workbook";
import { formatPeriodDate } from "@/features/master-data/types/client-price-list";
import { prisma } from "@/lib/database/client";
import { decimalToNumber } from "@/lib/database/decimal";
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
const PLAN_NAMESPACE = "price-list-import";
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})/;

interface RowPlanInternal extends PriceListImportRowPlan {
  priceListId: string | null;
  modelId: string;
  packageTypeId: string | null;
  periodStartAt: Date;
  periodEndAt: Date;
}

interface ImportPlan {
  preview: PriceListImportPreview;
  writes: RowPlanInternal[];
}

type ExistingPriceRow = {
  id: string;
  modelId: string;
  packageTypeId: string | null;
  amount: { toString(): string } | number;
  periodStart: Date | string;
  periodEnd: Date | string;
};

function lookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function isBlankOrDash(value: string | undefined | null): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return !trimmed || trimmed === "-";
}

function display(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text ? text : "—";
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function naturalKey(
  modelId: string,
  packageTypeId: string | null,
  periodStart: string,
  periodEnd: string,
): string {
  return `${modelId}::${packageTypeId ?? ""}::${periodStart}::${periodEnd}`;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/** Parse YYYY-MM-DD (or ISO starting with that) as UTC midnight of the calendar day. */
function parseCalendarDay(raw: string): { ymd: string; at: Date } | null {
  const match = raw.trim().match(YMD_RE);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidYmd(year, month, day)) return null;
  const ymd = `${match[1]}-${match[2]}-${match[3]}`;
  return { ymd, at: new Date(Date.UTC(year, month - 1, day)) };
}

function parsePositiveAmount(raw: string | undefined): number | { error: string } {
  if (raw == null || isBlankOrDash(raw)) {
    return { error: "Amount is required." };
  }
  const parsed = Number.parseFloat(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: "Amount must be a positive number." };
  }
  return money(parsed);
}

function pushChange(
  changes: PriceListImportFieldChange[],
  field: keyof typeof PRICE_LIST_IMPORT_FIELD_LABELS,
  from: string | number | null | undefined,
  to: string | number | null | undefined,
) {
  const fromDisplay = display(from);
  const toDisplay = display(to);
  if (fromDisplay === toDisplay) return;
  changes.push({
    field,
    label: PRICE_LIST_IMPORT_FIELD_LABELS[field] ?? field,
    from: fromDisplay,
    to: toDisplay,
  });
}

async function loadTemplateRows(tenantId: string): Promise<PriceListTemplateRow[]> {
  const rows = await prisma.priceList.findMany({
    where: { tenantId },
    select: {
      amount: true,
      periodStart: true,
      periodEnd: true,
      model: { select: { skuCode: true, name: true } },
      packageType: { select: { name: true } },
    },
    orderBy: [{ model: { skuCode: "asc" } }, { periodStart: "desc" }],
    take: 500,
  });

  return rows.map((row) => ({
    sku: row.model.skuCode,
    modelName: row.model.name,
    amount: decimalToNumber(row.amount),
    periodStart: formatPeriodDate(row.periodStart),
    periodEnd: formatPeriodDate(row.periodEnd),
    packageTypeName: row.packageType?.name ?? "",
  }));
}

async function buildPlan(tenantId: string, sheet: SheetRows): Promise<ImportPlan> {
  if (sheet.rows.length > MAX_ROWS) {
    throw new Error(`Too many rows (max ${MAX_ROWS}). Split the file and try again.`);
  }

  const [models, packageTypes, existingRows] = await Promise.all([
    prisma.productModel.findMany({
      where: { tenantId },
      select: { id: true, skuCode: true, name: true },
    }),
    prisma.packageType.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
    prisma.priceList.findMany({
      where: { tenantId },
      select: {
        id: true,
        modelId: true,
        packageTypeId: true,
        amount: true,
        periodStart: true,
        periodEnd: true,
      },
    }),
  ]);

  const modelBySku = new Map(models.map((model) => [lookupKey(model.skuCode), model]));
  const packageByName = new Map(
    packageTypes.map((pkg) => [lookupKey(pkg.name), pkg]),
  );
  const existingByKey = new Map<string, ExistingPriceRow>();
  for (const row of existingRows) {
    existingByKey.set(
      naturalKey(
        row.modelId,
        row.packageTypeId,
        formatPeriodDate(row.periodStart),
        formatPeriodDate(row.periodEnd),
      ),
      row,
    );
  }

  const errors: PriceListImportRowError[] = [];
  const previewRows: PriceListImportRowPlan[] = [];
  const writes: RowPlanInternal[] = [];
  const seenInFile = new Map<string, number>();
  let createCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;

  for (const row of sheet.rows) {
    const sku = (row.values.sku ?? "").trim();
    const amountRaw = row.values.amount;
    const startRaw = row.values.period_start ?? "";
    const endRaw = row.values.period_end ?? "";
    const packageRaw = row.values.package_type;

    const pushError = (message: string) => {
      errors.push({
        sheet: PRICE_LIST_SHEET_NAME,
        rowNumber: row.rowNumber,
        sku: sku || "—",
        message,
      });
    };

    if (
      isBlankOrDash(sku) &&
      isBlankOrDash(amountRaw) &&
      isBlankOrDash(startRaw) &&
      isBlankOrDash(endRaw) &&
      isBlankOrDash(packageRaw)
    ) {
      continue;
    }

    if (isBlankOrDash(sku)) {
      pushError("SKU is required.");
      continue;
    }

    const amount = parsePositiveAmount(amountRaw);
    if (typeof amount === "object") {
      pushError(amount.error);
      continue;
    }

    const start = parseCalendarDay(startRaw);
    if (!start) {
      pushError("Period start must be a date (YYYY-MM-DD).");
      continue;
    }
    const end = parseCalendarDay(endRaw);
    if (!end) {
      pushError("Period end must be a date (YYYY-MM-DD).");
      continue;
    }
    if (end.at.getTime() < start.at.getTime()) {
      pushError("Period end must be on or after period start.");
      continue;
    }

    const model = modelBySku.get(lookupKey(sku));
    if (!model) {
      pushError(`SKU "${sku}" was not found. Create it in Master data first.`);
      continue;
    }

    let packageTypeId: string | null = null;
    let packageTypeName: string | null = null;
    if (!isBlankOrDash(packageRaw)) {
      const pkg = packageByName.get(lookupKey(packageRaw!));
      if (!pkg) {
        pushError(
          `Package type "${packageRaw}" was not found. Create it in Master data first.`,
        );
        continue;
      }
      packageTypeId = pkg.id;
      packageTypeName = pkg.name;
    }

    const fileKey = naturalKey(model.id, packageTypeId, start.ymd, end.ymd);
    if (seenInFile.has(fileKey)) {
      pushError(
        `Duplicate of row ${seenInFile.get(fileKey)} (${sku} / ${packageTypeName ?? "none"} / ${start.ymd}–${end.ymd}). Keep one row per combination.`,
      );
      continue;
    }
    seenInFile.set(fileKey, row.rowNumber);

    const existing = existingByKey.get(fileKey) ?? null;
    const modelName = model.name;

    if (!existing) {
      const plan: RowPlanInternal = {
        rowNumber: row.rowNumber,
        sku: model.skuCode,
        modelName,
        amount,
        periodStart: start.ymd,
        periodEnd: end.ymd,
        packageTypeName,
        action: "create",
        changes: [],
        priceListId: null,
        modelId: model.id,
        packageTypeId,
        periodStartAt: start.at,
        periodEndAt: end.at,
      };
      createCount += 1;
      writes.push(plan);
      previewRows.push(plan);
      continue;
    }

    const existingAmount = money(decimalToNumber(existing.amount));
    if (existingAmount === amount) {
      unchangedCount += 1;
      previewRows.push({
        rowNumber: row.rowNumber,
        sku: model.skuCode,
        modelName,
        amount,
        periodStart: start.ymd,
        periodEnd: end.ymd,
        packageTypeName,
        action: "skip",
        changes: [],
      });
      continue;
    }

    const changes: PriceListImportFieldChange[] = [];
    pushChange(changes, "amount", existingAmount, amount);

    const plan: RowPlanInternal = {
      rowNumber: row.rowNumber,
      sku: model.skuCode,
      modelName,
      amount,
      periodStart: start.ymd,
      periodEnd: end.ymd,
      packageTypeName,
      action: "update",
      changes,
      priceListId: existing.id,
      modelId: model.id,
      packageTypeId,
      periodStartAt: start.at,
      periodEndAt: end.at,
    };
    updateCount += 1;
    writes.push(plan);
    previewRows.push(plan);
  }

  const canApply = (createCount > 0 || updateCount > 0) && errors.length === 0;

  return {
    preview: {
      rowCount: sheet.rows.length,
      createCount,
      updateCount,
      unchangedCount,
      canApply,
      errors,
      rows: previewRows.slice(0, 200),
    },
    writes,
  };
}

async function applyWriteSlice(
  tenantId: string,
  actorUserId: string,
  writes: RowPlanInternal[],
): Promise<{ created: number; updated: number }> {
  if (writes.length === 0) return { created: 0, updated: 0 };

  const modelIds = [...new Set(writes.map((row) => row.modelId))];
  const existing = await prisma.priceList.findMany({
    where: { tenantId, modelId: { in: modelIds } },
    select: {
      id: true,
      modelId: true,
      packageTypeId: true,
      amount: true,
      periodStart: true,
      periodEnd: true,
    },
  });
  const existingByKey = new Map<string, ExistingPriceRow>();
  for (const row of existing) {
    existingByKey.set(
      naturalKey(
        row.modelId,
        row.packageTypeId,
        formatPeriodDate(row.periodStart),
        formatPeriodDate(row.periodEnd),
      ),
      row,
    );
  }

  const toCreate: RowPlanInternal[] = [];
  const toUpdate: Array<RowPlanInternal & { priceListId: string }> = [];

  for (const row of writes) {
    const key = naturalKey(row.modelId, row.packageTypeId, row.periodStart, row.periodEnd);
    const found = existingByKey.get(key);
    if (!found) {
      toCreate.push(row);
      continue;
    }
    const foundAmount = money(decimalToNumber(found.amount));
    if (foundAmount === row.amount) continue;
    toUpdate.push({ ...row, priceListId: found.id });
  }

  const auditRows: CreateAuditLogInput[] = [];
  let created = 0;

  if (toCreate.length > 0) {
    const inserted = await prisma.priceList.createManyAndReturn({
      data: toCreate.map((row) => ({
        tenantId,
        modelId: row.modelId,
        amount: row.amount,
        periodStart: row.periodStartAt,
        periodEnd: row.periodEndAt,
        packageTypeId: row.packageTypeId,
      })),
      select: { id: true, modelId: true, packageTypeId: true, periodStart: true, periodEnd: true },
    });
    created = inserted.length;
    const createByKey = new Map(
      toCreate.map((row) => [
        naturalKey(row.modelId, row.packageTypeId, row.periodStart, row.periodEnd),
        row,
      ]),
    );
    for (const row of inserted) {
      const key = naturalKey(
        row.modelId,
        row.packageTypeId,
        formatPeriodDate(row.periodStart),
        formatPeriodDate(row.periodEnd),
      );
      const planned = createByKey.get(key);
      auditRows.push({
        tenantId,
        userId: actorUserId,
        action: "price_list.created",
        entityType: "PriceList",
        entityId: row.id,
        metadata: {
          skuCode: planned?.sku,
          packageType: planned?.packageTypeName ?? null,
          periodStart: planned?.periodStart,
          periodEnd: planned?.periodEnd,
          amount: planned?.amount,
          source: "price-list-import",
        },
      });
    }
  }

  let updated = 0;
  if (toUpdate.length > 0) {
    await mapWithConcurrency(toUpdate, WRITE_CONCURRENCY, async (row) => {
      await prisma.priceList.update({
        where: { id: row.priceListId },
        data: { amount: row.amount },
      });
    });
    updated = toUpdate.length;
    for (const row of toUpdate) {
      auditRows.push({
        tenantId,
        userId: actorUserId,
        action: "price_list.updated",
        entityType: "PriceList",
        entityId: row.priceListId,
        metadata: {
          skuCode: row.sku,
          packageType: row.packageTypeName,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          amount: row.amount,
          source: "price-list-import",
          changes: row.changes.map((change) => change.field),
        },
      });
    }
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
): PriceListImportChunkProgress {
  return {
    processed: total,
    total,
    nextOffset: total,
    done: true,
    created: 0,
    updated: 0,
    unchanged: unchangedCount,
    planKey,
    result: {
      created: 0,
      updated: 0,
      unchanged: unchangedCount,
    },
  };
}

function planExpiredProgress(offset: number): PriceListImportChunkProgress {
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

export const priceListImportService = {
  async buildTemplate(tenantId: string): Promise<Buffer> {
    const rows = await loadTemplateRows(tenantId);
    return buildPriceListTemplateWorkbook(rows);
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

    const sheet = await readPriceListImportWorkbook(input.file);
    const plan = await buildPlan(input.tenantId, sheet);
    setCachedPlan(planKey, plan);
    return { plan, planKey };
  },

  async buildPlan(
    tenantId: string,
    file: Buffer,
  ): Promise<{ preview: PriceListImportPreview; planKey: string }> {
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
  }): Promise<PriceListImportChunkProgress> {
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
  }): Promise<PriceListImportResult> {
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
