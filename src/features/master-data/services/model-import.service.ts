import type { CreateAuditLogInput } from "@/features/audit/repositories/audit-log.repository";
import { auditService } from "@/features/audit/services/audit.service";
import type {
  ModelImportChunkProgress,
  ModelImportFieldChange,
  ModelImportPreview,
  ModelImportResult,
  ModelImportRowError,
  ModelImportRowPlan,
} from "@/features/master-data/schemas/model-import.schema";
import {
  MODEL_IMPORT_FIELD_LABELS,
  MODEL_SHEET_NAME,
} from "@/features/master-data/schemas/model-import.schema";
import {
  modelBrandSapPushService,
  type BrandPushRow,
} from "@/features/master-data/services/model-brand-sap-push.service";
import {
  loadModelLookupIndexes,
  lookupInactiveMessage,
  lookupNotAvailableMessage,
  type ModelLookupField,
  type ModelLookupMatch,
} from "@/features/master-data/services/model-lookup-index";
import {
  buildModelTemplateWorkbook,
  readModelImportWorkbook,
  type ModelTemplateRow,
  type SheetRows,
} from "@/features/master-data/services/model-import.workbook";
import { prisma } from "@/lib/database/client";
import { mapWithConcurrency } from "@/lib/shared/concurrency";
import {
  getCachedPlan,
  invalidatePlan,
  planKeyFor,
  setCachedPlan,
} from "@/lib/shared/import-plan-cache";

const MAX_ROWS = 20_000;
/**
 * Chunk size governs progress granularity and request duration, not query fan-out —
 * a chunk costs a fixed handful of statements regardless of how many rows it holds.
 */
const APPLY_CHUNK_SIZE = 250;
/** Lanes for the genuinely per-row updates. Lower this if the pool is small. */
const WRITE_CONCURRENCY = 8;
/**
 * Rows per SAP push chunk. Far smaller than the database chunk: each row can cost a
 * Service Layer round trip, so this is what keeps one request inside the function
 * timeout. It also matches the push service's read batch, so a chunk costs one read.
 */
const SAP_PUSH_CHUNK = 100;
const PLAN_NAMESPACE = "model-import";

type ExistingModel = {
  id: string;
  skuCode: string;
  name: string;
  status: "active" | "hold" | "retired";
  brandId: string | null;
  seriesId: string | null;
  categoryId: string | null;
  featureId: string | null;
  resolutionId: string | null;
  actualSizeId: string | null;
  brand: { name: string } | null;
  series: { name: string } | null;
  category: { name: string } | null;
  feature: { name: string } | null;
  resolution: { name: string } | null;
  actualSize: { name: string } | null;
};

interface RowPlanInternal extends ModelImportRowPlan {
  modelId: string | null;
  /** Always resolved at plan time — brands must already exist in ISMS. */
  brandId: string;
  seriesId: string | null;
  categoryId: string | null;
  featureId: string | null;
  resolutionId: string | null;
  actualSizeId: string | null;
  seriesName: string;
  statusProvided: boolean;
}

/** What one applied slice of database writes did. The SAP counts are tracked apart. */
type ModelWriteCounts = Pick<
  ModelImportResult,
  "modelsCreated" | "modelsUpdated" | "seriesCreated"
>;

interface ImportPlan {
  preview: ModelImportPreview;
  writes: RowPlanInternal[];
  /**
   * Brand values to reconcile with SAP once the ISMS writes are done — every row
   * the file keeps, not only the ones ISMS changes. See where it is filled.
   */
  sapPushes: BrandPushRow[];
}

function lookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function isBlankOrDash(value: string | undefined | null): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return !trimmed || trimmed === "-";
}

function display(value: string | null | undefined): string {
  return value?.trim() ? value : "—";
}

function mapStatus(raw: string | undefined): "active" | "hold" | "retired" | null {
  if (raw == null || isBlankOrDash(raw)) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "active" || normalized === "hold" || normalized === "retired") {
    return normalized;
  }
  return null;
}

function pushChange(
  changes: ModelImportFieldChange[],
  field: keyof typeof MODEL_IMPORT_FIELD_LABELS,
  from: string | null | undefined,
  to: string | null | undefined,
) {
  const fromDisplay = display(from);
  const toDisplay = display(to);
  if (fromDisplay === toDisplay) return;
  changes.push({
    field,
    label: MODEL_IMPORT_FIELD_LABELS[field] ?? field,
    from: fromDisplay,
    to: toDisplay,
  });
}

/** Foreign keys change by id, so a casing-only difference in the file is not a change. */
function pushLookupChange(
  changes: ModelImportFieldChange[],
  field: ModelLookupField,
  fromId: string | null,
  fromName: string | null | undefined,
  next: ModelLookupMatch | null,
) {
  if (!next || next.id === fromId) return;
  pushChange(changes, field, fromName, next.name);
}

async function loadTemplateRows(tenantId: string): Promise<ModelTemplateRow[]> {
  const models = await prisma.productModel.findMany({
    where: { tenantId },
    select: {
      skuCode: true,
      name: true,
      status: true,
      brand: { select: { name: true } },
      series: { select: { name: true } },
      category: { select: { name: true } },
      feature: { select: { name: true } },
      resolution: { select: { name: true } },
      actualSize: { select: { name: true } },
    },
    orderBy: { skuCode: "asc" },
    take: 500,
  });

  return models.map((model) => ({
    sku: model.skuCode,
    name: model.name,
    brand: model.brand?.name ?? "",
    series: model.series?.name ?? "",
    category: model.category?.name ?? "",
    feature: model.feature?.name ?? "",
    resolution: model.resolution?.name ?? "",
    actualSize: model.actualSize?.name ?? "",
    status: model.status,
  }));
}

/**
 * Resolve every new series a chunk needs in a fixed handful of statements.
 *
 * Series is the one lookup the import may still create: `series` is a tenant-scoped
 * table of tens of rows, so reading it whole and matching in memory is cheaper than a
 * query per name, and it keeps the case-insensitive matching the plan already uses.
 * Brands are never created here — the plan rejects a brand ISMS does not have.
 */
async function resolveSeriesIdsForChunk(
  tenantId: string,
  writes: RowPlanInternal[],
): Promise<{ seriesIdByKey: Map<string, string>; seriesCreated: number }> {
  // Keep the first spelling seen for each name so a new row creates it as written.
  const wantedSeries = new Map<string, string>();
  for (const row of writes) {
    if (row.seriesId) continue;
    const key = lookupKey(row.seriesName);
    if (key && !wantedSeries.has(key)) wantedSeries.set(key, row.seriesName.trim());
  }

  const seriesIdByKey = new Map<string, string>();
  if (wantedSeries.size === 0) return { seriesIdByKey, seriesCreated: 0 };

  const readSeries = async () => {
    const rows = await prisma.series.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true },
    });
    for (const series of rows) {
      seriesIdByKey.set(lookupKey(series.name), series.id);
      if (series.code?.trim() && !seriesIdByKey.has(lookupKey(series.code))) {
        seriesIdByKey.set(lookupKey(series.code), series.id);
      }
    }
  };

  await readSeries();
  const missingSeries = [...wantedSeries].filter(([key]) => !seriesIdByKey.has(key));
  if (missingSeries.length === 0) return { seriesIdByKey, seriesCreated: 0 };

  const created = await prisma.series.createManyAndReturn({
    data: missingSeries.map(([, name]) => ({
      tenantId,
      name,
      recordStatus: "active" as const,
    })),
    skipDuplicates: true,
    select: { id: true, name: true },
  });
  for (const series of created) seriesIdByKey.set(lookupKey(series.name), series.id);

  // `skipDuplicates` swallows rows a concurrent import already inserted, so they
  // come back unresolved. Re-read only when that actually happened.
  if (missingSeries.some(([key]) => !seriesIdByKey.has(key))) await readSeries();

  return { seriesIdByKey, seriesCreated: created.length };
}

async function buildPlan(tenantId: string, sheet: SheetRows): Promise<ImportPlan> {
  if (sheet.rows.length > MAX_ROWS) {
    throw new Error(`Too many rows (max ${MAX_ROWS}). Split the file and try again.`);
  }

  const [existingModels, seriesList, lookups] = await Promise.all([
    prisma.productModel.findMany({
      where: { tenantId },
      select: {
        id: true,
        skuCode: true,
        name: true,
        status: true,
        brandId: true,
        seriesId: true,
        categoryId: true,
        featureId: true,
        resolutionId: true,
        actualSizeId: true,
        brand: { select: { name: true } },
        series: { select: { name: true } },
        category: { select: { name: true } },
        feature: { select: { name: true } },
        resolution: { select: { name: true } },
        actualSize: { select: { name: true } },
      },
    }),
    prisma.series.findMany({
      where: { tenantId },
      select: { id: true, name: true, code: true, recordStatus: true },
    }),
    loadModelLookupIndexes(tenantId),
  ]);

  const existingBySku = new Map<string, ExistingModel>();
  for (const model of existingModels) {
    existingBySku.set(lookupKey(model.skuCode), model);
  }
  // Inactive series stay in these maps so a row naming one is reported as inactive,
  // instead of falling through to "new name" and creating a duplicate.
  type SeriesMatch = (typeof seriesList)[number];
  const seriesByName = new Map<string, SeriesMatch>(
    seriesList.map((s) => [lookupKey(s.name), s]),
  );
  const seriesByCode = new Map<string, SeriesMatch>();
  for (const series of seriesList) {
    if (series.code?.trim() && !seriesByCode.has(lookupKey(series.code))) {
      seriesByCode.set(lookupKey(series.code), series);
    }
  }

  const errors: ModelImportRowError[] = [];
  const previewRows: ModelImportRowPlan[] = [];
  const writes: RowPlanInternal[] = [];
  const sapPushes: BrandPushRow[] = [];
  const seenInFile = new Set<string>();
  let updateCount = 0;
  let unchangedCount = 0;

  for (const row of sheet.rows) {
    const sku = (row.values.sku ?? "").trim();
    const name = (row.values.name ?? "").trim();
    const brand = (row.values.brand ?? "").trim();
    const series = (row.values.series ?? "").trim();
    const statusRaw = row.values.status;
    const statusProvided = !isBlankOrDash(statusRaw);

    const pushError = (message: string) => {
      errors.push({
        sheet: MODEL_SHEET_NAME,
        rowNumber: row.rowNumber,
        sku: sku || "—",
        message,
      });
    };

    if (isBlankOrDash(sku)) {
      pushError("SKU is required.");
      continue;
    }
    if (isBlankOrDash(name)) {
      pushError("Name is required.");
      continue;
    }
    if (isBlankOrDash(brand)) {
      pushError("Brand is required.");
      continue;
    }
    if (isBlankOrDash(series)) {
      pushError("Series is required.");
      continue;
    }

    let status: "active" | "hold" | "retired" = "active";
    if (statusProvided) {
      const mapped = mapStatus(statusRaw);
      if (mapped == null) {
        pushError('Status must be "active", "hold", or "retired".');
        continue;
      }
      status = mapped;
    }

    const skuKey = lookupKey(sku);
    if (seenInFile.has(skuKey)) {
      pushError(`Duplicate SKU in this file ("${sku}"). Keep one row per SKU.`);
      continue;
    }
    seenInFile.add(skuKey);

    const existing = existingBySku.get(skuKey) ?? null;
    const currentIds: Record<ModelLookupField, string | null> = {
      brand: existing?.brandId ?? null,
      category: existing?.categoryId ?? null,
      feature: existing?.featureId ?? null,
      resolution: existing?.resolutionId ?? null,
      actualSize: existing?.actualSizeId ?? null,
    };
    let rowOk = true;

    /**
     * Resolve one foreign-key cell against ISMS. `null` = blank cell (leave the model's
     * value alone); `undefined` = the value is unusable and the row has been failed.
     * An inactive value the model already carries is accepted, so re-uploading the
     * downloaded template does not fail on lookups deactivated since.
     */
    const resolveCell = (
      field: ModelLookupField,
      raw: string | undefined,
    ): ModelLookupMatch | null | undefined => {
      if (raw == null || isBlankOrDash(raw)) return null;
      const match = lookups[field].find(raw);
      if (!match) {
        pushError(lookupNotAvailableMessage(field, raw));
        rowOk = false;
        return undefined;
      }
      if (!match.active && match.id !== currentIds[field]) {
        pushError(lookupInactiveMessage(field, match.name));
        rowOk = false;
        return undefined;
      }
      return match;
    };

    const brandMatch = resolveCell("brand", brand);
    const categoryMatch = resolveCell("category", row.values.category);
    const featureMatch = resolveCell("feature", row.values.feature);
    const resolutionMatch = resolveCell("resolution", row.values.resolution);
    const actualSizeMatch = resolveCell("actualSize", row.values.actual_size);

    const seriesMatch =
      seriesByName.get(lookupKey(series)) ?? seriesByCode.get(lookupKey(series)) ?? null;
    if (seriesMatch && seriesMatch.recordStatus !== "active") {
      pushError(
        `Series "${seriesMatch.name}" is inactive. Activate it in Master data or use an active series.`,
      );
      rowOk = false;
    }

    if (!rowOk || !brandMatch) continue;

    // Import only updates: models are created by the SAP sync, never from a file.
    if (!existing) {
      pushError(
        `Model "${sku}" does not exist. Import only updates existing models — sync new ones from SAP.`,
      );
      continue;
    }

    // Every row the file keeps carries its brand to SAP, including ones ISMS is
    // about to skip: "unchanged" is measured against ISMS, and says nothing about
    // what SAP holds. Re-uploading the file is how a stale or blank `U_Brand` gets
    // repaired, so the push set cannot be limited to the planned writes. SAP gets
    // ISMS's spelling of the brand, not the file's.
    sapPushes.push({ sku, brand: brandMatch.name });

    // Blank optional cells leave existing values untouched.
    const nextStatus = statusProvided ? status : existing.status;
    const nextCategoryId = categoryMatch ? categoryMatch.id : existing.categoryId;
    const nextFeatureId = featureMatch ? featureMatch.id : existing.featureId;
    const nextResolutionId = resolutionMatch ? resolutionMatch.id : existing.resolutionId;
    const nextActualSizeId = actualSizeMatch ? actualSizeMatch.id : existing.actualSizeId;
    const labels = {
      category: categoryMatch?.name ?? existing.category?.name ?? null,
      feature: featureMatch?.name ?? existing.feature?.name ?? null,
      resolution: resolutionMatch?.name ?? existing.resolution?.name ?? null,
      actualSize: actualSizeMatch?.name ?? existing.actualSize?.name ?? null,
    };

    const changes: ModelImportFieldChange[] = [];
    pushChange(changes, "name", existing.name, name);
    pushLookupChange(changes, "brand", existing.brandId, existing.brand?.name, brandMatch);
    pushChange(changes, "series", existing.series?.name, seriesMatch?.name ?? series);
    pushLookupChange(
      changes,
      "category",
      existing.categoryId,
      existing.category?.name,
      categoryMatch ?? null,
    );
    pushLookupChange(
      changes,
      "feature",
      existing.featureId,
      existing.feature?.name,
      featureMatch ?? null,
    );
    pushLookupChange(
      changes,
      "resolution",
      existing.resolutionId,
      existing.resolution?.name,
      resolutionMatch ?? null,
    );
    pushLookupChange(
      changes,
      "actualSize",
      existing.actualSizeId,
      existing.actualSize?.name,
      actualSizeMatch ?? null,
    );
    if (statusProvided) {
      pushChange(changes, "status", existing.status, nextStatus);
    }

    // A new series name has no id yet — it is created at apply time.
    const seriesChanged = seriesMatch ? seriesMatch.id !== existing.seriesId : true;

    const rowPreview: ModelImportRowPlan = {
      rowNumber: row.rowNumber,
      sku,
      name,
      brand: brandMatch.name,
      series: seriesMatch?.name ?? series,
      ...labels,
      status: nextStatus,
      action: "skip",
      changes: [],
    };

    if (changes.length === 0 && !seriesChanged) {
      unchangedCount += 1;
      previewRows.push(rowPreview);
      continue;
    }

    const plan: RowPlanInternal = {
      ...rowPreview,
      action: "update",
      changes,
      modelId: existing.id,
      brandId: brandMatch.id,
      seriesId: seriesMatch?.id ?? null,
      categoryId: nextCategoryId,
      featureId: nextFeatureId,
      resolutionId: nextResolutionId,
      actualSizeId: nextActualSizeId,
      seriesName: series,
      statusProvided,
    };
    updateCount += 1;
    writes.push(plan);
    previewRows.push(plan);
  }

  const canApply = updateCount > 0 && errors.length === 0;

  return {
    preview: {
      rowCount: sheet.rows.length,
      // Update-only import; kept on the preview shape for the dialog.
      createCount: 0,
      updateCount,
      unchangedCount,
      canApply,
      sapBrandRowCount: sapPushes.length,
      errors,
      rows: previewRows.slice(0, 200),
    },
    writes,
    sapPushes,
  };
}

/**
 * Flush one chunk of planned writes in a fixed handful of statements.
 *
 * The old path cost up to 6 round trips per row (brand lookup/create, series
 * lookup/create, existence check, the write itself, plus one audit insert) and ran
 * them strictly one row at a time. Now: one lookup pass, one `createManyAndReturn`,
 * a bounded-concurrency pass for the per-row updates, and one batched audit insert.
 */
async function applyWriteSlice(
  tenantId: string,
  actorUserId: string,
  writes: RowPlanInternal[],
): Promise<ModelWriteCounts> {
  if (writes.length === 0) {
    return { modelsCreated: 0, modelsUpdated: 0, seriesCreated: 0 };
  }

  const { seriesIdByKey, seriesCreated } = await resolveSeriesIdsForChunk(tenantId, writes);

  const resolveSeriesId = (row: RowPlanInternal) =>
    row.seriesId ?? seriesIdByKey.get(lookupKey(row.seriesName)) ?? null;

  // One existence check for the whole chunk. Re-running Apply after a failure must
  // converge, so a planned create whose SKU now exists is skipped, not duplicated.
  const plannedCreates = writes.filter((row) => row.action === "create");
  const alreadyPresent = new Set<string>();
  if (plannedCreates.length > 0) {
    const existing = await prisma.productModel.findMany({
      where: { tenantId, skuCode: { in: plannedCreates.map((row) => row.sku) } },
      select: { skuCode: true },
    });
    for (const model of existing) alreadyPresent.add(lookupKey(model.skuCode));
  }

  const toCreate = plannedCreates.filter((row) => !alreadyPresent.has(lookupKey(row.sku)));
  const toUpdate = writes.filter(
    (row): row is RowPlanInternal & { modelId: string } =>
      row.action === "update" && row.modelId != null,
  );

  const auditRows: CreateAuditLogInput[] = [];

  let modelsCreated = 0;
  if (toCreate.length > 0) {
    const created = await prisma.productModel.createManyAndReturn({
      data: toCreate.map((row) => ({
        tenantId,
        skuCode: row.sku,
        name: row.name,
        brandId: row.brandId,
        seriesId: resolveSeriesId(row),
        categoryId: row.categoryId,
        featureId: row.featureId,
        resolutionId: row.resolutionId,
        actualSizeId: row.actualSizeId,
        status: row.status,
      })),
      skipDuplicates: true,
      select: { id: true, skuCode: true },
    });
    modelsCreated = created.length;
    for (const model of created) {
      auditRows.push({
        tenantId,
        userId: actorUserId,
        action: "model.created",
        entityType: "ProductModel",
        entityId: model.id,
        metadata: { skuCode: model.skuCode, source: "model-import" },
      });
    }
  }

  let modelsUpdated = 0;
  if (toUpdate.length > 0) {
    await mapWithConcurrency(toUpdate, WRITE_CONCURRENCY, async (row) => {
      await prisma.productModel.update({
        where: { id: row.modelId },
        data: {
          name: row.name,
          brandId: row.brandId,
          seriesId: resolveSeriesId(row),
          categoryId: row.categoryId,
          featureId: row.featureId,
          resolutionId: row.resolutionId,
          actualSizeId: row.actualSizeId,
          status: row.status,
        },
      });
    });
    modelsUpdated = toUpdate.length;
    for (const row of toUpdate) {
      auditRows.push({
        tenantId,
        userId: actorUserId,
        action: "model.updated",
        entityType: "ProductModel",
        entityId: row.modelId,
        metadata: {
          skuCode: row.sku,
          source: "model-import",
          changes: row.changes.map((c) => c.field),
        },
      });
    }
  }

  if (auditRows.length > 0) {
    await auditService.logMany(auditRows);
  }

  return { modelsCreated, modelsUpdated, seriesCreated };
}

function emptyChunkProgress(
  total: number,
  planKey: string | undefined,
  unchangedCount: number,
): ModelImportChunkProgress {
  return {
    processed: total,
    total,
    nextOffset: total,
    done: true,
    phase: "database",
    modelsCreated: 0,
    modelsUpdated: 0,
    seriesCreated: 0,
    sapBrandsUpdated: 0,
    sapBrandsMatched: 0,
    sapBrandsMissing: 0,
    sapBrandsFailed: 0,
    sapBrandFailures: [],
    modelsUnchanged: unchangedCount,
    planKey,
    result: {
      modelsCreated: 0,
      modelsUpdated: 0,
      modelsUnchanged: unchangedCount,
      seriesCreated: 0,
      sapBrandsUpdated: 0,
      sapBrandsFailed: 0,
    },
  };
}

/** Nothing was written — the client retries this offset with the workbook attached. */
function planExpiredProgress(offset: number): ModelImportChunkProgress {
  return {
    processed: offset,
    total: 0,
    nextOffset: offset,
    done: false,
    phase: "database",
    modelsCreated: 0,
    modelsUpdated: 0,
    seriesCreated: 0,
    sapBrandsUpdated: 0,
    sapBrandsMatched: 0,
    sapBrandsMissing: 0,
    sapBrandsFailed: 0,
    sapBrandFailures: [],
    planExpired: true,
  };
}

export const modelImportService = {
  async buildTemplate(tenantId: string): Promise<Buffer> {
    const rows = await loadTemplateRows(tenantId);
    return buildModelTemplateWorkbook(rows);
  },

  /**
   * Fetch the plan for this upload, building (and caching) it only on a miss.
   *
   * `planKey` is a server-derived digest handed to the client by `preview`. A cache
   * miss falls back to rebuilding from the uploaded file, so a cold or scaled-out
   * instance is slower but never wrong; callers with no file to fall back to get
   * `null` and are expected to ask the browser to re-send it.
   */
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

    const sheet = await readModelImportWorkbook(input.file);
    const plan = await buildPlan(input.tenantId, sheet);
    setCachedPlan(planKey, plan);
    return { plan, planKey };
  },

  async buildPlan(
    tenantId: string,
    file: Buffer,
  ): Promise<{ preview: ModelImportPreview; planKey: string }> {
    const resolved = await this.resolvePlan({ tenantId, file });
    if (!resolved) throw new Error("Could not read the file.");
    return { preview: resolved.plan.preview, planKey: resolved.planKey };
  },

  /**
   * Applies one chunk against the server-built plan.
   *
   * The browser passes the `planKey` `preview` handed it, so the plan is fetched
   * from the server-side cache instead of the workbook being re-uploaded and
   * re-diffed per chunk. The plan the browser saw is still never the source of the
   * writes. On a cache miss the response sets `planExpired` and the client retries
   * the same offset with the file attached.
   */
  async applyChunk(input: {
    tenantId: string;
    actorUserId: string;
    file?: Buffer;
    planKey?: string;
    offset: number;
  }): Promise<ModelImportChunkProgress> {
    const resolved = await this.resolvePlan(input);
    if (!resolved) return planExpiredProgress(input.offset);

    const { plan, planKey } = resolved;
    if (plan.preview.errors.length > 0) {
      const count = plan.preview.errors.length;
      throw new Error(
        `Fix ${count} problem${count === 1 ? "" : "s"} in the spreadsheet and upload again.`,
      );
    }

    // Two phases share one offset timeline, so the browser's loop and its progress
    // bar do not need to know there are two. First the ISMS writes — unchanged rows
    // are not work there — then the SAP brand push, which does cover them.
    const writes = plan.writes;
    const sapPushes = plan.sapPushes;
    const dbTotal = writes.length;
    const total = dbTotal + sapPushes.length;
    const unchangedCount = plan.preview.unchangedCount;

    if (total === 0 || input.offset >= total) {
      invalidatePlan(planKey);
      return emptyChunkProgress(total, planKey, unchangedCount);
    }

    if (input.offset < dbTotal) {
      const chunk = writes.slice(input.offset, input.offset + APPLY_CHUNK_SIZE);
      const written = await applyWriteSlice(input.tenantId, input.actorUserId, chunk);
      const nextOffset = input.offset + chunk.length;
      // Only true when nothing is queued for SAP; otherwise the push phase follows.
      const done = nextOffset >= total;
      if (done) invalidatePlan(planKey);

      return {
        processed: nextOffset,
        total,
        nextOffset,
        done,
        phase: "database",
        modelsCreated: written.modelsCreated,
        modelsUpdated: written.modelsUpdated,
        seriesCreated: written.seriesCreated,
        sapBrandsUpdated: 0,
        sapBrandsMatched: 0,
        sapBrandsMissing: 0,
        sapBrandsFailed: 0,
        sapBrandFailures: [],
        // Unchanged comes from the pre-write plan, so it is correct on every chunk.
        modelsUnchanged: unchangedCount,
        planKey,
        // Chunk counts are authoritative; client (and apply()) accumulate them.
        // Final result here is last-chunk only — callers must sum chunk deltas.
        result: done
          ? {
              modelsCreated: written.modelsCreated,
              modelsUpdated: written.modelsUpdated,
              modelsUnchanged: unchangedCount,
              seriesCreated: written.seriesCreated,
              sapBrandsUpdated: 0,
              sapBrandsFailed: 0,
            }
          : undefined,
      };
    }

    const sapOffset = input.offset - dbTotal;
    const sapChunk = sapPushes.slice(sapOffset, sapOffset + SAP_PUSH_CHUNK);
    const outcome = await modelBrandSapPushService.pushAndAudit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      rows: sapChunk,
      source: "model-import",
    });

    // An abort applies to the whole tenant, not this slice — walking the remaining
    // chunks would repeat the same failure and the same message per chunk.
    const nextOffset = outcome.aborted ? total : input.offset + sapChunk.length;
    const done = nextOffset >= total;
    if (done) invalidatePlan(planKey);

    return {
      processed: nextOffset,
      total,
      nextOffset,
      done,
      phase: "sap",
      modelsCreated: 0,
      modelsUpdated: 0,
      seriesCreated: 0,
      sapBrandsUpdated: outcome.updated,
      sapBrandsMatched: outcome.matched,
      sapBrandsMissing: outcome.missing,
      sapBrandsFailed: outcome.failed,
      sapBrandFailures: outcome.failures,
      sapBrandNotice: outcome.aborted,
      modelsUnchanged: unchangedCount,
      planKey,
      result: done
        ? {
            modelsCreated: 0,
            modelsUpdated: 0,
            modelsUnchanged: unchangedCount,
            seriesCreated: 0,
            sapBrandsUpdated: outcome.updated,
            sapBrandsFailed: outcome.failed,
          }
        : undefined,
    };
  },

  /**
   * Full apply via offset chunks (non-UI / backwards-compatible callers), and the
   * loop a background worker would run once the import moves onto a queue.
   */
  async apply(input: {
    tenantId: string;
    actorUserId: string;
    file: Buffer;
  }): Promise<ModelImportResult> {
    let offset = 0;
    let planKey: string | undefined;
    let modelsCreated = 0;
    let modelsUpdated = 0;
    let seriesCreated = 0;
    let modelsUnchanged = 0;
    let sapBrandsUpdated = 0;
    let sapBrandsFailed = 0;

    for (;;) {
      const progress = await this.applyChunk({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        file: input.file,
        planKey,
        offset,
      });
      if (progress.planKey) planKey = progress.planKey;
      if (progress.modelsUnchanged != null) {
        modelsUnchanged = progress.modelsUnchanged;
      }
      modelsCreated += progress.modelsCreated;
      modelsUpdated += progress.modelsUpdated;
      seriesCreated += progress.seriesCreated;
      sapBrandsUpdated += progress.sapBrandsUpdated;
      sapBrandsFailed += progress.sapBrandsFailed;
      if (progress.done) {
        return {
          modelsCreated,
          modelsUpdated,
          modelsUnchanged,
          seriesCreated,
          sapBrandsUpdated,
          sapBrandsFailed,
        };
      }
      offset = progress.nextOffset;
    }
  },
};
