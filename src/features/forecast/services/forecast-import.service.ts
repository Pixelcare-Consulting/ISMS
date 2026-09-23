import type { CreateAuditLogInput } from "@/features/audit/repositories/audit-log.repository";
import { auditService } from "@/features/audit/services/audit.service";
import {
  normalizePeriodLabel,
  periodDateFieldsFromLabel,
} from "@/features/demand-planning/lib/planning-period-dates";
import {
  FORECAST_IMPORT_FIELD_LABELS,
  SFE_IMPORT_FIELD_LABELS,
  SFE_SHEET_NAME,
  type ForecastImportChunkProgress,
  type ForecastImportFieldChange,
  type ForecastImportPreview,
  type ForecastImportResult,
  type ForecastImportRowError,
  type ForecastImportRowPlan,
  type SfeImportRowPlan,
} from "@/features/forecast/schemas/forecast-import.schema";
import {
  buildForecastTemplateWorkbook,
  readForecastImportWorkbook,
  type SfeTemplateRow,
  type SheetRows,
} from "@/features/forecast/services/forecast-import.workbook";
import { formatPeriodDate } from "@/features/master-data/types/client-price-list";
import { pickDisplayPriceListRow } from "@/features/master-data/utils/resolve-price-list";
import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission } from "@/lib/auth/permissions";
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
const PLAN_NAMESPACE = "forecast-import";
const SAMPLE_PERIOD = "Dec-25";
const SAMPLE_SAP_CODE = "WMK-001";
const SAMPLE_SKU = "32STW101";
const SAMPLE_FORECAST_QTY = 20;

interface QuotaWrite extends ForecastImportRowPlan {
  kind: "quota";
  branchId: string;
}

interface SfeWrite extends SfeImportRowPlan {
  kind: "sfe";
  branchId: string;
  modelId: string;
}

type ImportWrite = QuotaWrite | SfeWrite;

interface ImportPlan {
  preview: ForecastImportPreview;
  periodLabel: string;
  writes: ImportWrite[];
}

export interface ForecastImportActor {
  tenantId: string;
  userId: string;
  permissions: string[] | undefined;
}

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

function formatMoney(value: number): string {
  return value.toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

function pushChange(
  changes: ForecastImportFieldChange[],
  field: string,
  label: string,
  from: string | number | null | undefined,
  to: string | number | null | undefined,
) {
  const fromDisplay = display(from);
  const toDisplay = display(to);
  if (fromDisplay === toDisplay) return;
  changes.push({ field, label, from: fromDisplay, to: toDisplay });
}

function parseNonNegativeInt(raw: string | undefined): number | { error: string } {
  if (raw == null || isBlankOrDash(raw)) {
    return { error: "forecast_qty is required." };
  }
  const normalized = raw.replace(/,/g, "").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return { error: "forecast_qty must be a whole number of 0 or more." };
  }
  return parsed;
}

function moneyEquals(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

function resolveModelSrp(
  priceLists: Array<{
    amount: { toString(): string } | number;
    periodStart: Date;
    periodEnd: Date;
    packageTypeId: string | null;
  }>,
  fallbackSrp: { toString(): string } | number | null,
): number {
  const rows = priceLists.map((row) => ({
    amount: decimalToNumber(row.amount),
    periodStart: formatPeriodDate(row.periodStart),
    periodEnd: formatPeriodDate(row.periodEnd),
    packageTypeId: row.packageTypeId,
  }));
  const selected = pickDisplayPriceListRow(rows, (row) => row);
  if (selected?.amount != null && selected.amount > 0) return selected.amount;
  return Math.max(0, decimalToNumber(fallbackSrp));
}

async function resolveScopedBranchIds(actor: ForecastImportActor): Promise<string[] | null> {
  const hasFullAccess =
    hasPermission(actor.permissions, "forecast.manage") ||
    hasPermission(actor.permissions, "planogram.manage");
  if (hasFullAccess) return null;

  const branchIds = await getUserBranchIds(actor.tenantId, actor.userId);
  return branchIds && branchIds.length > 0 ? branchIds : [];
}

async function loadTemplateRows(actor: ForecastImportActor): Promise<SfeTemplateRow[]> {
  const scopedBranchIds = await resolveScopedBranchIds(actor);
  if (scopedBranchIds && scopedBranchIds.length === 0) return [];

  const period = await prisma.planningPeriod.findFirst({
    where: { tenantId: actor.tenantId, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, label: true },
  });
  if (!period) return [];

  const branchScope =
    scopedBranchIds && scopedBranchIds.length > 0 ? { id: { in: scopedBranchIds } } : {};

  const planogramEntries = await prisma.branchPlanogram.findMany({
    where: {
      tenantId: actor.tenantId,
      branch: { status: "active", ...branchScope },
    },
    select: {
      branchId: true,
      modelId: true,
      branch: { select: { sapCode: true } },
      model: { select: { skuCode: true } },
    },
    orderBy: [{ branch: { sapCode: "asc" } }, { model: { skuCode: "asc" } }],
  });

  if (planogramEntries.length === 0) return [];

  const existingTargets = await prisma.skuForecastTarget.findMany({
    where: {
      tenantId: actor.tenantId,
      periodId: period.id,
      ...(scopedBranchIds && scopedBranchIds.length > 0
        ? { branchId: { in: scopedBranchIds } }
        : {}),
    },
    select: { branchId: true, modelId: true, qty: true },
  });
  const qtyByPair = new Map(
    existingTargets.map((target) => [`${target.branchId}::${target.modelId}`, target.qty]),
  );

  return planogramEntries.map((entry) => ({
    period: period.label,
    sapCode: entry.branch.sapCode,
    sku: entry.model.skuCode,
    forecastQty: qtyByPair.get(`${entry.branchId}::${entry.modelId}`) ?? 0,
  }));
}

function collectPeriodLabel(
  sheet: SheetRows,
  sheetName: string,
  errors: ForecastImportRowError[],
  fields: string[],
  current: string,
): string {
  let periodLabel = current;
  for (const row of sheet.rows) {
    const sapCode = row.values.sap_code?.trim() ?? "";
    const rawPeriod = row.values.period?.trim() ?? "";
    const period = normalizePeriodLabel(rawPeriod) ?? rawPeriod;
    if (fields.every((field) => isBlankOrDash(row.values[field]))) continue;

    if (!isBlankOrDash(period)) {
      if (!periodLabel) periodLabel = period;
      else if (lookupKey(period) !== lookupKey(periodLabel)) {
        errors.push({
          sheet: sheetName,
          rowNumber: row.rowNumber,
          sapCode: sapCode || "—",
          period: rawPeriod || period,
          sku: row.values.sku?.trim() || undefined,
          message: `All rows must use the same period. This file already uses "${periodLabel}".`,
        });
      }
    }
  }
  return periodLabel;
}

async function buildPlan(
  actor: ForecastImportActor,
  sheets: { sfe: SheetRows; ignoredForecastSheet: boolean },
): Promise<ImportPlan> {
  const errors: ForecastImportRowError[] = [];
  const warnings: string[] = [];
  const scopedBranchIds = await resolveScopedBranchIds(actor);
  const scopedSet = scopedBranchIds ? new Set(scopedBranchIds) : null;

  if (sheets.ignoredForecastSheet) {
    warnings.push(
      "A Forecast sheet was found and ignored. Target Quota is calculated from SFE forecast qty × price list SRP.",
    );
  }

  const sfeRowCount = sheets.sfe.present ? sheets.sfe.rows.length : 0;
  if (sfeRowCount > MAX_ROWS) {
    throw new Error(`This file has more than ${MAX_ROWS.toLocaleString()} rows. Split it and import in parts.`);
  }

  let periodLabel = "";
  if (sheets.sfe.present) {
    periodLabel = collectPeriodLabel(
      sheets.sfe,
      SFE_SHEET_NAME,
      errors,
      ["sap_code", "period", "sku", "forecast_qty"],
      periodLabel,
    );
  }

  periodLabel = normalizePeriodLabel(periodLabel) ?? periodLabel;

  const seenSfe = new Map<string, number>();

  if (sheets.sfe.present) {
    for (const row of sheets.sfe.rows) {
      const sapCode = row.values.sap_code?.trim() ?? "";
      const sku = row.values.sku?.trim() ?? "";
      if (isBlankOrDash(sapCode) || isBlankOrDash(sku)) continue;
      const key = `${lookupKey(sapCode)}::${lookupKey(sku)}`;
      if (seenSfe.has(key)) {
        errors.push({
          sheet: SFE_SHEET_NAME,
          rowNumber: row.rowNumber,
          sapCode,
          period: row.values.period?.trim() || periodLabel || "—",
          sku,
          message: `Duplicate of row ${seenSfe.get(key)} (${sapCode} / ${sku}). Keep one SFE row per branch and SKU.`,
        });
        continue;
      }
      seenSfe.set(key, row.rowNumber);
    }
  }

  const [branches, models, existingPeriod] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId: actor.tenantId },
      select: { id: true, name: true, sapCode: true, status: true },
    }),
    prisma.productModel.findMany({
      where: { tenantId: actor.tenantId },
      select: {
        id: true,
        skuCode: true,
        status: true,
        srp: true,
        priceLists: {
          select: {
            amount: true,
            periodStart: true,
            periodEnd: true,
            packageTypeId: true,
          },
        },
      },
    }),
    periodLabel
      ? prisma.planningPeriod.findUnique({
          where: { tenantId_label: { tenantId: actor.tenantId, label: periodLabel } },
          select: { id: true, isActive: true },
        })
      : Promise.resolve(null),
  ]);

  const branchBySap = new Map(branches.map((branch) => [lookupKey(branch.sapCode), branch]));
  const modelBySku = new Map(models.map((model) => [lookupKey(model.skuCode), model]));
  const srpByModelId = new Map(
    models.map((model) => [model.id, resolveModelSrp(model.priceLists, model.srp)]),
  );

  const existingTargets =
    existingPeriod == null
      ? []
      : await prisma.branchForecastTarget.findMany({
          where: { tenantId: actor.tenantId, periodId: existingPeriod.id },
          select: { branchId: true, revenueTarget: true },
        });
  const targetByBranch = new Map(
    existingTargets.map((target) => [target.branchId, Number(target.revenueTarget.toString())]),
  );

  const existingSkuTargets =
    existingPeriod == null
      ? []
      : await prisma.skuForecastTarget.findMany({
          where: { tenantId: actor.tenantId, periodId: existingPeriod.id },
          select: { branchId: true, modelId: true, qty: true },
        });
  const skuTargetKey = (branchId: string, modelId: string) => `${branchId}::${modelId}`;
  const skuQtyByPair = new Map(
    existingSkuTargets.map((target) => [skuTargetKey(target.branchId, target.modelId), target.qty]),
  );

  const previewRows: ForecastImportRowPlan[] = [];
  const sfePreviewRows: SfeImportRowPlan[] = [];
  const writes: ImportWrite[] = [];
  const branchRevenue = new Map<
    string,
    { branchId: string; sapCode: string; branchName: string; revenue: number }
  >();

  if (sheets.sfe.present) {
    for (const row of sheets.sfe.rows) {
      const sapCode = row.values.sap_code?.trim() ?? "";
      const rawPeriod = row.values.period?.trim() ?? "";
      const period = normalizePeriodLabel(rawPeriod) ?? rawPeriod;
      const sku = row.values.sku?.trim() ?? "";
      if (
        isBlankOrDash(sapCode) &&
        isBlankOrDash(rawPeriod) &&
        isBlankOrDash(sku) &&
        isBlankOrDash(row.values.forecast_qty)
      ) {
        continue;
      }

      const pushError = (message: string) => {
        errors.push({
          sheet: SFE_SHEET_NAME,
          rowNumber: row.rowNumber,
          sapCode: sapCode || "—",
          period: rawPeriod || periodLabel || "—",
          sku: sku || undefined,
          message,
        });
      };

      if (isBlankOrDash(period)) {
        pushError("period is empty.");
        continue;
      }
      if (lookupKey(period) !== lookupKey(periodLabel)) continue;
      if (isBlankOrDash(sapCode)) {
        pushError("branch_sap_code is empty.");
        continue;
      }
      if (isBlankOrDash(sku)) {
        pushError("sku is empty.");
        continue;
      }
      if (seenSfe.get(`${lookupKey(sapCode)}::${lookupKey(sku)}`) !== row.rowNumber) continue;

      const forecastQty = parseNonNegativeInt(row.values.forecast_qty);
      if (typeof forecastQty !== "number") {
        pushError(forecastQty.error);
        continue;
      }

      const branch = branchBySap.get(lookupKey(sapCode));
      if (!branch) {
        pushError(
          `Branch "${sapCode}" was not found. Import or sync branches first — this file does not create branches.`,
        );
        continue;
      }
      if (branch.status !== "active") {
        pushError(`Branch "${sapCode}" is not active.`);
        continue;
      }
      if (scopedSet && !scopedSet.has(branch.id)) {
        pushError(`Branch "${sapCode}" is outside your area of responsibility.`);
        continue;
      }

      const model = modelBySku.get(lookupKey(sku));
      if (!model) {
        pushError(
          `SKU "${sku}" was not found. Import or sync models first — this file does not create SKUs.`,
        );
        continue;
      }
      if (model.status !== "active") {
        pushError(`SKU "${sku}" is not active.`);
        continue;
      }

      const existingQty = skuQtyByPair.get(skuTargetKey(branch.id, model.id));
      const changes: ForecastImportFieldChange[] = [];
      if (existingQty == null) {
        pushChange(changes, "forecastQty", SFE_IMPORT_FIELD_LABELS.forecastQty, null, forecastQty);
      } else if (existingQty !== forecastQty) {
        pushChange(changes, "forecastQty", SFE_IMPORT_FIELD_LABELS.forecastQty, existingQty, forecastQty);
      }

      const action = existingQty == null ? "create" : changes.length > 0 ? "update" : "skip";
      const planned: SfeWrite = {
        kind: "sfe",
        rowNumber: row.rowNumber,
        period: periodLabel,
        sapCode: branch.sapCode,
        branchName: branch.name,
        sku: model.skuCode,
        forecastQty,
        action,
        changes,
        branchId: branch.id,
        modelId: model.id,
      };
      sfePreviewRows.push(planned);
      if (action !== "skip") writes.push(planned);

      const srp = srpByModelId.get(model.id) ?? 0;
      const revenueAdd = Math.round(forecastQty * srp * 100) / 100;
      const current = branchRevenue.get(branch.id);
      if (current) {
        current.revenue = Math.round((current.revenue + revenueAdd) * 100) / 100;
      } else {
        branchRevenue.set(branch.id, {
          branchId: branch.id,
          sapCode: branch.sapCode,
          branchName: branch.name,
          revenue: revenueAdd,
        });
      }
    }
  }

  let quotaRowNumber = 1;
  for (const entry of [...branchRevenue.values()].sort((a, b) =>
    a.sapCode.localeCompare(b.sapCode),
  )) {
    quotaRowNumber += 1;
    // ₱0 Target Quota is allowed (FREE / 0 SRP or zero forecast qty) — warn, do not block.
    if (entry.revenue <= 0) {
      warnings.push(
        `Target Quota for "${entry.sapCode}" is ₱0 (FREE or zero forecast qty). Import can continue.`,
      );
    }

    const existingRevenue = targetByBranch.get(entry.branchId);
    const changes: ForecastImportFieldChange[] = [];
    if (existingRevenue == null) {
      pushChange(
        changes,
        "revenueTarget",
        FORECAST_IMPORT_FIELD_LABELS.revenueTarget,
        null,
        formatMoney(entry.revenue),
      );
    } else if (!moneyEquals(existingRevenue, entry.revenue)) {
      pushChange(
        changes,
        "revenueTarget",
        FORECAST_IMPORT_FIELD_LABELS.revenueTarget,
        formatMoney(existingRevenue),
        formatMoney(entry.revenue),
      );
    }

    const action = existingRevenue == null ? "create" : changes.length > 0 ? "update" : "skip";
    const planned: QuotaWrite = {
      kind: "quota",
      rowNumber: quotaRowNumber,
      period: periodLabel,
      sapCode: entry.sapCode,
      branchName: entry.branchName,
      revenueTarget: entry.revenue,
      action,
      changes,
      branchId: entry.branchId,
    };
    previewRows.push(planned);
    if (action !== "skip") writes.push(planned);
  }

  if (!periodLabel && errors.length === 0 && sfePreviewRows.length === 0) {
    errors.push({
      sheet: SFE_SHEET_NAME,
      rowNumber: 2,
      sapCode: "—",
      period: "—",
      message: "Add at least one SFE row (period, branch_sap_code, sku, forecast_qty).",
    });
  }

  if (!sheets.sfe.present && errors.length === 0) {
    errors.push({
      sheet: SFE_SHEET_NAME,
      rowNumber: 1,
      sapCode: "—",
      period: "—",
      message: `Add a sheet named "${SFE_SHEET_NAME}" with period, branch_sap_code, sku, and forecast_qty.`,
    });
  }

  const createCount = previewRows.filter((row) => row.action === "create").length;
  const updateCount = previewRows.filter((row) => row.action === "update").length;
  const unchangedCount = previewRows.filter((row) => row.action === "skip").length;
  const sfeCreateCount = sfePreviewRows.filter((row) => row.action === "create").length;
  const sfeUpdateCount = sfePreviewRows.filter((row) => row.action === "update").length;
  const sfeUnchangedCount = sfePreviewRows.filter((row) => row.action === "skip").length;
  const periodWillActivate = Boolean(periodLabel) && (!existingPeriod || !existingPeriod.isActive);

  return {
    preview: {
      periodLabel,
      periodWillActivate,
      rowCount: previewRows.length,
      createCount,
      updateCount,
      unchangedCount,
      sfeRowCount: sfePreviewRows.length,
      sfeCreateCount,
      sfeUpdateCount,
      sfeUnchangedCount,
      canApply:
        errors.length === 0 &&
        Boolean(periodLabel) &&
        (writes.length > 0 || periodWillActivate),
      errors,
      warnings,
      rows: previewRows.slice(0, 200),
      sfeRows: sfePreviewRows.slice(0, 200),
    },
    periodLabel,
    writes,
  };
}

async function upsertActivePeriod(tenantId: string, periodLabel: string) {
  const label = normalizePeriodLabel(periodLabel) ?? periodLabel.trim();
  const dates = periodDateFieldsFromLabel(label);
  await prisma.planningPeriod.updateMany({
    where: { tenantId, isActive: true },
    data: { isActive: false },
  });
  return prisma.planningPeriod.upsert({
    where: { tenantId_label: { tenantId, label } },
    create: { tenantId, label, isActive: true, ...dates },
    update: { isActive: true, ...dates },
  });
}

async function applyWriteSlice(
  tenantId: string,
  actorUserId: string,
  periodId: string,
  periodLabel: string,
  writes: ImportWrite[],
): Promise<Pick<ForecastImportResult, "created" | "updated" | "sfeCreated" | "sfeUpdated">> {
  if (writes.length === 0) {
    return { created: 0, updated: 0, sfeCreated: 0, sfeUpdated: 0 };
  }

  const outcomes = await mapWithConcurrency(writes, WRITE_CONCURRENCY, async (row) => {
    if (row.kind === "quota") {
      const target = await prisma.branchForecastTarget.upsert({
        where: { periodId_branchId: { periodId, branchId: row.branchId } },
        create: {
          tenantId,
          periodId,
          branchId: row.branchId,
          revenueTarget: row.revenueTarget,
        },
        update: { revenueTarget: row.revenueTarget },
      });
      const audits: CreateAuditLogInput[] = [
        {
          tenantId,
          userId: actorUserId,
          action: row.action === "create" ? "forecast.target_created" : "forecast.target_updated",
          entityType: "BranchForecastTarget",
          entityId: target.id,
          metadata: {
            periodId,
            periodLabel,
            branchId: row.branchId,
            sapCode: row.sapCode,
            revenueTarget: row.revenueTarget,
            source: "forecast-import",
          },
        },
      ];
      return row.action === "create"
        ? { created: 1, updated: 0, sfeCreated: 0, sfeUpdated: 0, audits }
        : { created: 0, updated: 1, sfeCreated: 0, sfeUpdated: 0, audits };
    }

    const target = await prisma.skuForecastTarget.upsert({
      where: {
        periodId_branchId_modelId: {
          periodId,
          branchId: row.branchId,
          modelId: row.modelId,
        },
      },
      create: {
        tenantId,
        periodId,
        branchId: row.branchId,
        modelId: row.modelId,
        qty: row.forecastQty,
      },
      update: { qty: row.forecastQty },
    });
    const audits: CreateAuditLogInput[] = [
      {
        tenantId,
        userId: actorUserId,
        action: row.action === "create" ? "forecast.sku_target_created" : "forecast.sku_target_updated",
        entityType: "SkuForecastTarget",
        entityId: target.id,
        metadata: {
          periodId,
          periodLabel,
          branchId: row.branchId,
          sapCode: row.sapCode,
          sku: row.sku,
          forecastQty: row.forecastQty,
          source: "forecast-import",
        },
      },
    ];
    return row.action === "create"
      ? { created: 0, updated: 0, sfeCreated: 1, sfeUpdated: 0, audits }
      : { created: 0, updated: 0, sfeCreated: 0, sfeUpdated: 1, audits };
  });

  const auditRows = outcomes.flatMap((outcome) => outcome.audits);
  if (auditRows.length > 0) {
    await auditService.logMany(auditRows);
  }

  return outcomes.reduce(
    (sum, outcome) => ({
      created: sum.created + outcome.created,
      updated: sum.updated + outcome.updated,
      sfeCreated: sum.sfeCreated + outcome.sfeCreated,
      sfeUpdated: sum.sfeUpdated + outcome.sfeUpdated,
    }),
    { created: 0, updated: 0, sfeCreated: 0, sfeUpdated: 0 },
  );
}

function emptyChunkProgress(
  total: number,
  planKey: string | undefined,
  unchangedCount: number,
  sfeUnchangedCount: number,
  periodLabel: string,
): ForecastImportChunkProgress {
  return {
    processed: total,
    total,
    nextOffset: total,
    done: true,
    created: 0,
    updated: 0,
    sfeCreated: 0,
    sfeUpdated: 0,
    unchanged: unchangedCount,
    sfeUnchanged: sfeUnchangedCount,
    periodLabel,
    planKey,
    result: {
      periodLabel,
      created: 0,
      updated: 0,
      unchanged: unchangedCount,
      sfeCreated: 0,
      sfeUpdated: 0,
      sfeUnchanged: sfeUnchangedCount,
    },
  };
}

function planExpiredProgress(offset: number): ForecastImportChunkProgress {
  return {
    processed: offset,
    total: 0,
    nextOffset: offset,
    done: false,
    created: 0,
    updated: 0,
    sfeCreated: 0,
    sfeUpdated: 0,
    planExpired: true,
  };
}

export const forecastImportService = {
  async buildTemplate(actor: ForecastImportActor): Promise<Buffer> {
    const rows = await loadTemplateRows(actor);
    if (rows.length === 0) {
      return buildForecastTemplateWorkbook([
        {
          period: SAMPLE_PERIOD,
          sapCode: SAMPLE_SAP_CODE,
          sku: SAMPLE_SKU,
          forecastQty: SAMPLE_FORECAST_QTY,
        },
      ]);
    }
    return buildForecastTemplateWorkbook(rows);
  },

  async resolvePlan(input: {
    actor: ForecastImportActor;
    file?: Buffer;
    planKey?: string;
  }): Promise<{ plan: ImportPlan; planKey: string } | null> {
    if (input.planKey) {
      const cached = getCachedPlan<ImportPlan>(input.planKey);
      if (cached) return { plan: cached, planKey: input.planKey };
    }
    if (!input.file) return null;

    const planKey = planKeyFor(PLAN_NAMESPACE, input.actor.tenantId, input.file);
    const cached = getCachedPlan<ImportPlan>(planKey);
    if (cached) return { plan: cached, planKey };

    const sheets = await readForecastImportWorkbook(input.file);
    const plan = await buildPlan(input.actor, sheets);
    setCachedPlan(planKey, plan);
    return { plan, planKey };
  },

  async buildPlan(
    actor: ForecastImportActor,
    file: Buffer,
  ): Promise<{ preview: ForecastImportPreview; planKey: string }> {
    const resolved = await this.resolvePlan({ actor, file });
    if (!resolved) throw new Error("Could not read the file.");
    return { preview: resolved.plan.preview, planKey: resolved.planKey };
  },

  async applyChunk(input: {
    actor: ForecastImportActor;
    file?: Buffer;
    planKey?: string;
    offset: number;
  }): Promise<ForecastImportChunkProgress> {
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
    const sfeUnchangedCount = plan.preview.sfeUnchangedCount;
    const periodLabel = plan.periodLabel;

    const period = await upsertActivePeriod(input.actor.tenantId, periodLabel);
    if (input.offset === 0) {
      await auditService.log({
        tenantId: input.actor.tenantId,
        userId: input.actor.userId,
        action: "forecast.import_applied",
        entityType: "PlanningPeriod",
        entityId: period.id,
        metadata: {
          label: periodLabel,
          source: "forecast-import",
          rowCount: plan.preview.rowCount,
          sfeRowCount: plan.preview.sfeRowCount,
        },
      });
    }

    if (total === 0 || input.offset >= total) {
      invalidatePlan(planKey);
      return emptyChunkProgress(total, planKey, unchangedCount, sfeUnchangedCount, periodLabel);
    }

    const chunk = writes.slice(input.offset, input.offset + APPLY_CHUNK_SIZE);
    const written = await applyWriteSlice(
      input.actor.tenantId,
      input.actor.userId,
      period.id,
      periodLabel,
      chunk,
    );
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
      sfeCreated: written.sfeCreated,
      sfeUpdated: written.sfeUpdated,
      unchanged: unchangedCount,
      sfeUnchanged: sfeUnchangedCount,
      periodLabel,
      planKey,
      result: done
        ? {
            periodLabel,
            created: written.created,
            updated: written.updated,
            unchanged: unchangedCount,
            sfeCreated: written.sfeCreated,
            sfeUpdated: written.sfeUpdated,
            sfeUnchanged: sfeUnchangedCount,
          }
        : undefined,
    };
  },

  async apply(input: {
    actor: ForecastImportActor;
    file: Buffer;
  }): Promise<ForecastImportResult> {
    let offset = 0;
    let planKey: string | undefined;
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let sfeCreated = 0;
    let sfeUpdated = 0;
    let sfeUnchanged = 0;
    let periodLabel = "";

    for (;;) {
      const progress = await this.applyChunk({
        actor: input.actor,
        file: input.file,
        planKey,
        offset,
      });
      if (progress.planKey) planKey = progress.planKey;
      if (progress.unchanged != null) unchanged = progress.unchanged;
      if (progress.sfeUnchanged != null) sfeUnchanged = progress.sfeUnchanged;
      if (progress.periodLabel) periodLabel = progress.periodLabel;
      created += progress.created;
      updated += progress.updated;
      sfeCreated += progress.sfeCreated;
      sfeUpdated += progress.sfeUpdated;
      if (progress.done) {
        return {
          periodLabel,
          created,
          updated,
          unchanged,
          sfeCreated,
          sfeUpdated,
          sfeUnchanged,
        };
      }
      offset = progress.nextOffset;
    }
  },
};
