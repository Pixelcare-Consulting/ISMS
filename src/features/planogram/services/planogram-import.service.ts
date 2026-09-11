import type { CreateAuditLogInput } from "@/features/audit/repositories/audit-log.repository";
import { auditService } from "@/features/audit/services/audit.service";
import {
  PLANOGRAM_DEFAULT_MAX_QTY,
  PLANOGRAM_DEFAULT_MIL_DAYS,
  PLANOGRAM_IMPORT_FIELD_LABELS,
  PLANOGRAM_SHEET_NAME,
  type PlanogramImportChunkProgress,
  type PlanogramImportFieldChange,
  type PlanogramImportPreview,
  type PlanogramImportResult,
  type PlanogramImportRowError,
  type PlanogramImportRowPlan,
} from "@/features/planogram/schemas/planogram-import.schema";
import {
  buildPlanogramTemplateWorkbook,
  readPlanogramImportWorkbook,
  type PlanogramTemplateRow,
  type SheetRows,
} from "@/features/planogram/services/planogram-import.workbook";
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
const PLAN_NAMESPACE = "planogram-import";

interface RowPlanInternal extends PlanogramImportRowPlan {
  branchId: string;
  modelId: string;
}

interface ImportPlan {
  preview: PlanogramImportPreview;
  writes: RowPlanInternal[];
}

export interface PlanogramImportActor {
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

function pushChange(
  changes: PlanogramImportFieldChange[],
  field: keyof typeof PLANOGRAM_IMPORT_FIELD_LABELS,
  from: string | number | null | undefined,
  to: string | number | null | undefined,
) {
  const fromDisplay = display(from);
  const toDisplay = display(to);
  if (fromDisplay === toDisplay) return;
  changes.push({
    field,
    label: PLANOGRAM_IMPORT_FIELD_LABELS[field] ?? field,
    from: fromDisplay,
    to: toDisplay,
  });
}

async function resolveScopedBranchIds(actor: PlanogramImportActor): Promise<string[] | null> {
  const hasFullAccess =
    hasPermission(actor.permissions, "planogram.manage") ||
    hasPermission(actor.permissions, "branches.manage");
  if (hasFullAccess) return null;

  const branchIds = await getUserBranchIds(actor.tenantId, actor.userId);
  return branchIds && branchIds.length > 0 ? branchIds : [];
}

async function loadTemplateRows(actor: PlanogramImportActor): Promise<PlanogramTemplateRow[]> {
  const scopedBranchIds = await resolveScopedBranchIds(actor);
  if (scopedBranchIds && scopedBranchIds.length === 0) return [];

  const branchFilter =
    scopedBranchIds && scopedBranchIds.length > 0 ? { branchId: { in: scopedBranchIds } } : {};

  const entries = await prisma.branchPlanogram.findMany({
    where: { tenantId: actor.tenantId, ...branchFilter },
    select: {
      branch: { select: { sapCode: true } },
      model: { select: { skuCode: true } },
    },
    orderBy: [{ branch: { sapCode: "asc" } }, { model: { skuCode: "asc" } }],
  });

  return entries.map((entry) => ({
    sapCode: entry.branch.sapCode,
    sku: entry.model.skuCode,
  }));
}

async function buildPlan(
  actor: PlanogramImportActor,
  sheet: SheetRows,
): Promise<ImportPlan> {
  const errors: PlanogramImportRowError[] = [];
  const scopedBranchIds = await resolveScopedBranchIds(actor);
  const scopedSet = scopedBranchIds ? new Set(scopedBranchIds) : null;

  if (sheet.rows.length > MAX_ROWS) {
    throw new Error(`This file has more than ${MAX_ROWS.toLocaleString()} rows. Split it and import in parts.`);
  }

  const seenPairs = new Map<string, number>();

  for (const row of sheet.rows) {
    const sapCode = row.values.sap_code?.trim() ?? "";
    const sku = row.values.sku?.trim() ?? "";
    if (isBlankOrDash(sapCode) && isBlankOrDash(sku)) {
      continue;
    }
    const pairKey = `${lookupKey(sapCode)}::${lookupKey(sku)}`;
    if (seenPairs.has(pairKey) && sapCode && sku) {
      errors.push({
        sheet: PLANOGRAM_SHEET_NAME,
        rowNumber: row.rowNumber,
        sapCode,
        sku,
        message: `Duplicate of row ${seenPairs.get(pairKey)} (${sapCode} / ${sku}). Keep one row per branch and SKU.`,
      });
      continue;
    }
    if (sapCode && sku) seenPairs.set(pairKey, row.rowNumber);
  }

  const sapCodes = new Set<string>();
  const skus = new Set<string>();
  for (const row of sheet.rows) {
    const sapCode = row.values.sap_code?.trim() ?? "";
    const sku = row.values.sku?.trim() ?? "";
    if (!isBlankOrDash(sapCode)) sapCodes.add(sapCode);
    if (!isBlankOrDash(sku)) skus.add(sku);
  }

  const [branches, models] = await Promise.all([
    prisma.branch.findMany({
      where: { tenantId: actor.tenantId },
      select: { id: true, name: true, sapCode: true, status: true },
    }),
    sapCodes.size === 0 && skus.size === 0
      ? Promise.resolve([])
      : prisma.productModel.findMany({
          where: { tenantId: actor.tenantId },
          select: { id: true, skuCode: true, status: true },
        }),
  ]);

  const branchBySap = new Map(branches.map((branch) => [lookupKey(branch.sapCode), branch]));
  const modelBySku = new Map(models.map((model) => [lookupKey(model.skuCode), model]));

  const candidateBranchIds = [...new Set(branches.map((b) => b.id))];
  const existingEntries =
    candidateBranchIds.length === 0
      ? []
      : await prisma.branchPlanogram.findMany({
          where: { tenantId: actor.tenantId, branchId: { in: candidateBranchIds } },
          select: { id: true, branchId: true, modelId: true, maxQty: true },
        });
  const existingAllowed =
    candidateBranchIds.length === 0
      ? []
      : await prisma.branchAllowedModel.findMany({
          where: { tenantId: actor.tenantId, branchId: { in: candidateBranchIds } },
          select: { branchId: true, modelId: true },
        });

  const entryByPair = new Map(
    existingEntries.map((entry) => [`${entry.branchId}:${entry.modelId}`, entry]),
  );
  const allowedPairs = new Set(existingAllowed.map((row) => `${row.branchId}:${row.modelId}`));

  const previewRows: PlanogramImportRowPlan[] = [];
  const writes: RowPlanInternal[] = [];

  for (const row of sheet.rows) {
    const sapCode = row.values.sap_code?.trim() ?? "";
    const sku = row.values.sku?.trim() ?? "";
    if (isBlankOrDash(sapCode) && isBlankOrDash(sku)) {
      continue;
    }

    const pushError = (message: string) => {
      errors.push({
        sheet: PLANOGRAM_SHEET_NAME,
        rowNumber: row.rowNumber,
        sapCode: sapCode || "—",
        sku: sku || "—",
        message,
      });
    };

    if (isBlankOrDash(sapCode)) {
      pushError("branch_sap_code is empty.");
      continue;
    }
    if (isBlankOrDash(sku)) {
      pushError("sku is empty.");
      continue;
    }

    const pairFileKey = `${lookupKey(sapCode)}::${lookupKey(sku)}`;
    if (seenPairs.get(pairFileKey) !== row.rowNumber) {
      continue;
    }

    const branch = branchBySap.get(lookupKey(sapCode));
    if (!branch) {
      pushError(`Branch "${sapCode}" was not found. Import or sync branches first.`);
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
      pushError(`SKU "${sku}" was not found. Import or sync models first — this file does not create SKUs.`);
      continue;
    }
    if (model.status !== "active") {
      pushError(`SKU "${sku}" is not active (${model.status}).`);
      continue;
    }

    const pairKey = `${branch.id}:${model.id}`;
    const existing = entryByPair.get(pairKey);
    const allowed = allowedPairs.has(pairKey);
    const changes: PlanogramImportFieldChange[] = [];

    const willAddAllowedModel = !allowed;
    if (willAddAllowedModel) {
      pushChange(changes, "allowedModel", null, "add");
    }

    const action = !existing ? "create" : willAddAllowedModel ? "update" : "skip";
    const planned: RowPlanInternal = {
      rowNumber: row.rowNumber,
      sapCode: branch.sapCode,
      sku: model.skuCode,
      branchName: branch.name,
      maxQty: existing ? existing.maxQty : PLANOGRAM_DEFAULT_MAX_QTY,
      milDays: PLANOGRAM_DEFAULT_MIL_DAYS,
      action,
      changes,
      willAddAllowedModel,
      branchId: branch.id,
      modelId: model.id,
    };

    previewRows.push(planned);
    if (action !== "skip") writes.push(planned);
  }

  const createCount = previewRows.filter((row) => row.action === "create").length;
  const updateCount = previewRows.filter((row) => row.action === "update").length;
  const unchangedCount = previewRows.filter((row) => row.action === "skip").length;
  const allowedModelAddCount = previewRows.filter((row) => row.willAddAllowedModel).length;

  return {
    preview: {
      rowCount: previewRows.length,
      createCount,
      updateCount,
      unchangedCount,
      allowedModelAddCount,
      canApply: errors.length === 0 && writes.length > 0,
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
): Promise<Pick<PlanogramImportResult, "created" | "updated" | "allowedModelsAdded">> {
  if (writes.length === 0) {
    return { created: 0, updated: 0, allowedModelsAdded: 0 };
  }

  const outcomes = await mapWithConcurrency(writes, WRITE_CONCURRENCY, async (row) => {
    const audits: CreateAuditLogInput[] = [];
    let allowedAdded = 0;
    if (row.willAddAllowedModel) {
      await prisma.branchAllowedModel.upsert({
        where: { branchId_modelId: { branchId: row.branchId, modelId: row.modelId } },
        create: { tenantId, branchId: row.branchId, modelId: row.modelId },
        update: {},
      });
      allowedAdded = 1;
      audits.push({
        tenantId,
        userId: actorUserId,
        action: "planogram.allowed_model_added",
        entityType: "BranchAllowedModel",
        entityId: `${row.branchId}:${row.modelId}`,
        metadata: {
          branchId: row.branchId,
          modelId: row.modelId,
          source: "planogram-import",
        },
      });
    }

    const entry = await prisma.branchPlanogram.upsert({
      where: { branchId_modelId: { branchId: row.branchId, modelId: row.modelId } },
      create: {
        tenantId,
        branchId: row.branchId,
        modelId: row.modelId,
        maxQty: row.maxQty,
      },
      update: {},
    });

    if (row.action === "create") {
      await prisma.branchMilSetting.upsert({
        where: { branchId_modelId: { branchId: row.branchId, modelId: row.modelId } },
        create: {
          tenantId,
          branchId: row.branchId,
          modelId: row.modelId,
          daysThreshold: row.milDays,
        },
        update: {},
      });
      audits.push({
        tenantId,
        userId: actorUserId,
        action: "planogram.model_added",
        entityType: "BranchPlanogram",
        entityId: entry.id,
        metadata: {
          branchId: row.branchId,
          modelId: row.modelId,
          maxQty: row.maxQty,
          milDays: row.milDays,
          source: "planogram-import",
        },
      });
      return { created: 1, updated: 0, allowedModelsAdded: allowedAdded, audits };
    }

    return { created: 0, updated: 1, allowedModelsAdded: allowedAdded, audits };
  });

  const auditRows = outcomes.flatMap((outcome) => outcome.audits);
  if (auditRows.length > 0) {
    await auditService.logMany(auditRows);
  }

  return outcomes.reduce(
    (sum, outcome) => ({
      created: sum.created + outcome.created,
      updated: sum.updated + outcome.updated,
      allowedModelsAdded: sum.allowedModelsAdded + outcome.allowedModelsAdded,
    }),
    { created: 0, updated: 0, allowedModelsAdded: 0 },
  );
}

function emptyChunkProgress(
  total: number,
  planKey: string | undefined,
  unchangedCount: number,
): PlanogramImportChunkProgress {
  return {
    processed: total,
    total,
    nextOffset: total,
    done: true,
    created: 0,
    updated: 0,
    allowedModelsAdded: 0,
    unchanged: unchangedCount,
    planKey,
    result: {
      created: 0,
      updated: 0,
      unchanged: unchangedCount,
      allowedModelsAdded: 0,
    },
  };
}

function planExpiredProgress(offset: number): PlanogramImportChunkProgress {
  return {
    processed: offset,
    total: 0,
    nextOffset: offset,
    done: false,
    created: 0,
    updated: 0,
    allowedModelsAdded: 0,
    planExpired: true,
  };
}

export const planogramImportService = {
  async buildTemplate(actor: PlanogramImportActor): Promise<Buffer> {
    const rows = await loadTemplateRows(actor);
    return buildPlanogramTemplateWorkbook(rows);
  },

  async resolvePlan(input: {
    actor: PlanogramImportActor;
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

    const sheet = await readPlanogramImportWorkbook(input.file);
    const plan = await buildPlan(input.actor, sheet);
    setCachedPlan(planKey, plan);
    return { plan, planKey };
  },

  async buildPlan(
    actor: PlanogramImportActor,
    file: Buffer,
  ): Promise<{ preview: PlanogramImportPreview; planKey: string }> {
    const resolved = await this.resolvePlan({ actor, file });
    if (!resolved) throw new Error("Could not read the file.");
    return { preview: resolved.plan.preview, planKey: resolved.planKey };
  },

  async applyChunk(input: {
    actor: PlanogramImportActor;
    file?: Buffer;
    planKey?: string;
    offset: number;
  }): Promise<PlanogramImportChunkProgress> {
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
    const written = await applyWriteSlice(input.actor.tenantId, input.actor.userId, chunk);
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
      allowedModelsAdded: written.allowedModelsAdded,
      unchanged: unchangedCount,
      planKey,
      result: done
        ? {
            created: written.created,
            updated: written.updated,
            unchanged: unchangedCount,
            allowedModelsAdded: written.allowedModelsAdded,
          }
        : undefined,
    };
  },

  async apply(input: {
    actor: PlanogramImportActor;
    file: Buffer;
  }): Promise<PlanogramImportResult> {
    let offset = 0;
    let planKey: string | undefined;
    let created = 0;
    let updated = 0;
    let allowedModelsAdded = 0;
    let unchanged = 0;

    for (;;) {
      const progress = await this.applyChunk({
        actor: input.actor,
        file: input.file,
        planKey,
        offset,
      });
      if (progress.planKey) planKey = progress.planKey;
      if (progress.unchanged != null) unchanged = progress.unchanged;
      created += progress.created;
      updated += progress.updated;
      allowedModelsAdded += progress.allowedModelsAdded;
      if (progress.done) {
        return { created, updated, unchanged, allowedModelsAdded };
      }
      offset = progress.nextOffset;
    }
  },
};
