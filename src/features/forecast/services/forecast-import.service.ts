import type { CreateAuditLogInput } from "@/features/audit/repositories/audit-log.repository";
import { auditService } from "@/features/audit/services/audit.service";
import {
  FORECAST_IMPORT_FIELD_LABELS,
  FORECAST_SHEET_NAME,
  type ForecastImportChunkProgress,
  type ForecastImportFieldChange,
  type ForecastImportPreview,
  type ForecastImportResult,
  type ForecastImportRowError,
  type ForecastImportRowPlan,
} from "@/features/forecast/schemas/forecast-import.schema";
import {
  buildForecastTemplateWorkbook,
  readForecastImportWorkbook,
  type ForecastTemplateRow,
  type SheetRows,
} from "@/features/forecast/services/forecast-import.workbook";
import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission } from "@/lib/auth/permissions";
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
const PLAN_NAMESPACE = "forecast-import";
const SAMPLE_PERIOD = "Dec-25";
const SAMPLE_SAP_CODE = "WMK-001";
const SAMPLE_REVENUE = 1_000_000;

interface RowPlanInternal extends ForecastImportRowPlan {
  branchId: string;
}

interface ImportPlan {
  preview: ForecastImportPreview;
  periodLabel: string;
  writes: RowPlanInternal[];
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
  field: keyof typeof FORECAST_IMPORT_FIELD_LABELS,
  from: string | number | null | undefined,
  to: string | number | null | undefined,
) {
  const fromDisplay = display(from);
  const toDisplay = display(to);
  if (fromDisplay === toDisplay) return;
  changes.push({
    field,
    label: FORECAST_IMPORT_FIELD_LABELS[field] ?? field,
    from: fromDisplay,
    to: toDisplay,
  });
}

function parsePositiveMoney(raw: string | undefined): number | { error: string } {
  if (raw == null || isBlankOrDash(raw)) {
    return { error: "revenue_target is required." };
  }
  const normalized = raw.replace(/,/g, "").replace(/[₱$]/g, "").replace(/php/gi, "").trim();
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: "revenue_target must be a number greater than 0." };
  }
  return Math.round(parsed * 100) / 100;
}

function moneyEquals(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

async function resolveScopedBranchIds(actor: ForecastImportActor): Promise<string[] | null> {
  const hasFullAccess =
    hasPermission(actor.permissions, "forecast.manage") ||
    hasPermission(actor.permissions, "planogram.manage");
  if (hasFullAccess) return null;

  const branchIds = await getUserBranchIds(actor.tenantId, actor.userId);
  return branchIds && branchIds.length > 0 ? branchIds : [];
}

async function loadTemplateRows(actor: ForecastImportActor): Promise<ForecastTemplateRow[]> {
  const scopedBranchIds = await resolveScopedBranchIds(actor);
  if (scopedBranchIds && scopedBranchIds.length === 0) return [];

  const period = await prisma.planningPeriod.findFirst({
    where: { tenantId: actor.tenantId, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, label: true },
  });
  if (!period) return [];

  const branchFilter =
    scopedBranchIds && scopedBranchIds.length > 0 ? { branchId: { in: scopedBranchIds } } : {};

  const targets = await prisma.branchForecastTarget.findMany({
    where: { tenantId: actor.tenantId, periodId: period.id, ...branchFilter },
    select: {
      revenueTarget: true,
      branch: { select: { sapCode: true, name: true } },
    },
    orderBy: { branch: { sapCode: "asc" } },
  });

  return targets.map((target) => ({
    period: period.label,
    sapCode: target.branch.sapCode,
    revenueTarget: Number(target.revenueTarget.toString()),
    branchName: target.branch.name,
  }));
}

async function buildPlan(
  actor: ForecastImportActor,
  sheet: SheetRows,
): Promise<ImportPlan> {
  const errors: ForecastImportRowError[] = [];
  const scopedBranchIds = await resolveScopedBranchIds(actor);
  const scopedSet = scopedBranchIds ? new Set(scopedBranchIds) : null;

  if (sheet.rows.length > MAX_ROWS) {
    throw new Error(`This file has more than ${MAX_ROWS.toLocaleString()} rows. Split it and import in parts.`);
  }

  const seenSap = new Map<string, number>();
  let periodLabel = "";

  for (const row of sheet.rows) {
    const sapCode = row.values.sap_code?.trim() ?? "";
    const period = row.values.period?.trim() ?? "";
    if (
      isBlankOrDash(sapCode) &&
      isBlankOrDash(period) &&
      isBlankOrDash(row.values.revenue_target)
    ) {
      continue;
    }

    if (!isBlankOrDash(period)) {
      if (!periodLabel) periodLabel = period;
      else if (lookupKey(period) !== lookupKey(periodLabel)) {
        errors.push({
          sheet: FORECAST_SHEET_NAME,
          rowNumber: row.rowNumber,
          sapCode: sapCode || "—",
          period,
          message: `All rows must use the same period. This file already uses "${periodLabel}".`,
        });
        continue;
      }
    }

    const sapKey = lookupKey(sapCode);
    if (seenSap.has(sapKey) && sapCode) {
      errors.push({
        sheet: FORECAST_SHEET_NAME,
        rowNumber: row.rowNumber,
        sapCode,
        period: period || periodLabel || "—",
        message: `Duplicate of row ${seenSap.get(sapKey)} (${sapCode}). Keep one row per branch.`,
      });
      continue;
    }
    if (sapCode) seenSap.set(sapKey, row.rowNumber);
  }

  const [branches, existingPeriod] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId: actor.tenantId },
      select: { id: true, name: true, sapCode: true, status: true },
    }),
    periodLabel
      ? prisma.planningPeriod.findUnique({
          where: { tenantId_label: { tenantId: actor.tenantId, label: periodLabel } },
          select: { id: true, isActive: true },
        })
      : Promise.resolve(null),
  ]);

  const branchBySap = new Map(branches.map((branch) => [lookupKey(branch.sapCode), branch]));
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

  const previewRows: ForecastImportRowPlan[] = [];
  const writes: RowPlanInternal[] = [];

  for (const row of sheet.rows) {
    const sapCode = row.values.sap_code?.trim() ?? "";
    const period = row.values.period?.trim() ?? "";
    if (
      isBlankOrDash(sapCode) &&
      isBlankOrDash(period) &&
      isBlankOrDash(row.values.revenue_target)
    ) {
      continue;
    }

    const pushError = (message: string) => {
      errors.push({
        sheet: FORECAST_SHEET_NAME,
        rowNumber: row.rowNumber,
        sapCode: sapCode || "—",
        period: period || periodLabel || "—",
        message,
      });
    };

    if (isBlankOrDash(period)) {
      pushError("period is empty.");
      continue;
    }
    if (lookupKey(period) !== lookupKey(periodLabel)) {
      continue;
    }
    if (isBlankOrDash(sapCode)) {
      pushError("sap_code is empty.");
      continue;
    }

    const sapFileKey = lookupKey(sapCode);
    if (seenSap.get(sapFileKey) !== row.rowNumber) {
      continue;
    }

    const revenueTarget = parsePositiveMoney(row.values.revenue_target);
    if (typeof revenueTarget !== "number") {
      pushError(revenueTarget.error);
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

    const existingRevenue = targetByBranch.get(branch.id);
    const changes: ForecastImportFieldChange[] = [];
    if (existingRevenue == null) {
      pushChange(changes, "revenueTarget", null, formatMoney(revenueTarget));
    } else if (!moneyEquals(existingRevenue, revenueTarget)) {
      pushChange(changes, "revenueTarget", formatMoney(existingRevenue), formatMoney(revenueTarget));
    }

    const action = existingRevenue == null ? "create" : changes.length > 0 ? "update" : "skip";
    const planned: RowPlanInternal = {
      rowNumber: row.rowNumber,
      period: periodLabel,
      sapCode: branch.sapCode,
      branchName: branch.name,
      revenueTarget,
      action,
      changes,
      branchId: branch.id,
    };

    previewRows.push(planned);
    if (action !== "skip") writes.push(planned);
  }

  if (!periodLabel && errors.length === 0 && previewRows.length === 0) {
    errors.push({
      sheet: FORECAST_SHEET_NAME,
      rowNumber: 2,
      sapCode: "—",
      period: "—",
      message: "Add at least one row with period, sap_code, and revenue_target.",
    });
  }

  const createCount = previewRows.filter((row) => row.action === "create").length;
  const updateCount = previewRows.filter((row) => row.action === "update").length;
  const unchangedCount = previewRows.filter((row) => row.action === "skip").length;
  const periodWillActivate = Boolean(periodLabel) && (!existingPeriod || !existingPeriod.isActive);

  return {
    preview: {
      periodLabel,
      periodWillActivate,
      rowCount: previewRows.length,
      createCount,
      updateCount,
      unchangedCount,
      canApply: errors.length === 0 && Boolean(periodLabel) && (writes.length > 0 || periodWillActivate),
      errors,
      rows: previewRows.slice(0, 200),
    },
    periodLabel,
    writes,
  };
}

async function upsertActivePeriod(tenantId: string, periodLabel: string) {
  await prisma.planningPeriod.updateMany({
    where: { tenantId, isActive: true },
    data: { isActive: false },
  });
  return prisma.planningPeriod.upsert({
    where: { tenantId_label: { tenantId, label: periodLabel } },
    create: { tenantId, label: periodLabel, isActive: true },
    update: { isActive: true },
  });
}

async function applyWriteSlice(
  tenantId: string,
  actorUserId: string,
  periodId: string,
  periodLabel: string,
  writes: RowPlanInternal[],
): Promise<Pick<ForecastImportResult, "created" | "updated">> {
  if (writes.length === 0) {
    return { created: 0, updated: 0 };
  }

  const outcomes = await mapWithConcurrency(writes, WRITE_CONCURRENCY, async (row) => {
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

    if (row.action === "create") {
      return { created: 1, updated: 0, audits };
    }
    return { created: 0, updated: 1, audits };
  });

  const auditRows = outcomes.flatMap((outcome) => outcome.audits);
  if (auditRows.length > 0) {
    await auditService.logMany(auditRows);
  }

  return outcomes.reduce(
    (sum, outcome) => ({
      created: sum.created + outcome.created,
      updated: sum.updated + outcome.updated,
    }),
    { created: 0, updated: 0 },
  );
}

function emptyChunkProgress(
  total: number,
  planKey: string | undefined,
  unchangedCount: number,
  periodLabel: string,
): ForecastImportChunkProgress {
  return {
    processed: total,
    total,
    nextOffset: total,
    done: true,
    created: 0,
    updated: 0,
    unchanged: unchangedCount,
    periodLabel,
    planKey,
    result: {
      periodLabel,
      created: 0,
      updated: 0,
      unchanged: unchangedCount,
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
          revenueTarget: SAMPLE_REVENUE,
          branchName: "",
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

    const sheet = await readForecastImportWorkbook(input.file);
    const plan = await buildPlan(input.actor, sheet);
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
        },
      });
    }

    if (total === 0 || input.offset >= total) {
      invalidatePlan(planKey);
      return emptyChunkProgress(total, planKey, unchangedCount, periodLabel);
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
      unchanged: unchangedCount,
      periodLabel,
      planKey,
      result: done
        ? {
            periodLabel,
            created: written.created,
            updated: written.updated,
            unchanged: unchangedCount,
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
      if (progress.periodLabel) periodLabel = progress.periodLabel;
      created += progress.created;
      updated += progress.updated;
      if (progress.done) {
        return { periodLabel, created, updated, unchanged };
      }
      offset = progress.nextOffset;
    }
  },
};
