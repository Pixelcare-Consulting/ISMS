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
  buildModelTemplateWorkbook,
  readModelImportWorkbook,
  type ModelTemplateRow,
  type SheetRows,
} from "@/features/master-data/services/model-import.workbook";
import { prisma } from "@/lib/database/client";

const MAX_ROWS = 20_000;
const APPLY_CHUNK_SIZE = 40;

type ExistingModel = {
  id: string;
  skuCode: string;
  name: string;
  status: "active" | "hold" | "retired";
  brandId: string | null;
  seriesId: string | null;
  featureId: string | null;
  resolutionId: string | null;
  actualSizeId: string | null;
  brand: { name: string } | null;
  series: { name: string } | null;
  feature: { name: string } | null;
  resolution: { name: string } | null;
  actualSize: { name: string } | null;
};

interface RowPlanInternal extends ModelImportRowPlan {
  modelId: string | null;
  brandId: string | null;
  seriesId: string | null;
  featureId: string | null;
  resolutionId: string | null;
  actualSizeId: string | null;
  brandName: string;
  seriesName: string;
  statusProvided: boolean;
}

interface ImportPlan {
  preview: ModelImportPreview;
  writes: RowPlanInternal[];
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

async function loadTemplateRows(tenantId: string): Promise<ModelTemplateRow[]> {
  const models = await prisma.productModel.findMany({
    where: { tenantId },
    select: {
      skuCode: true,
      name: true,
      status: true,
      brand: { select: { name: true } },
      series: { select: { name: true } },
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
    feature: model.feature?.name ?? "",
    resolution: model.resolution?.name ?? "",
    actualSize: model.actualSize?.name ?? "",
    status: model.status,
  }));
}

async function resolveBrandSeriesIds(
  tenantId: string,
  row: RowPlanInternal,
  brandIdByName: Map<string, string>,
  seriesIdByName: Map<string, string>,
  counters: { brandsCreated: number; seriesCreated: number },
): Promise<{ brandId: string; seriesId: string }> {
  let brandId = row.brandId ?? brandIdByName.get(lookupKey(row.brandName)) ?? null;
  if (!brandId) {
    const existingBrand = await prisma.brand.findUnique({
      where: { tenantId_name: { tenantId, name: row.brandName } },
      select: { id: true },
    });
    if (existingBrand) {
      brandId = existingBrand.id;
    } else {
      const brand = await prisma.brand.create({
        data: {
          tenantId,
          name: row.brandName,
          code: row.brandName.slice(0, 4).toUpperCase(),
        },
        select: { id: true },
      });
      brandId = brand.id;
      counters.brandsCreated += 1;
    }
    brandIdByName.set(lookupKey(row.brandName), brandId);
  }

  let seriesId = row.seriesId ?? seriesIdByName.get(lookupKey(row.seriesName)) ?? null;
  if (!seriesId) {
    const existingSeries = await prisma.series.findUnique({
      where: { tenantId_name: { tenantId, name: row.seriesName } },
      select: { id: true },
    });
    if (existingSeries) {
      seriesId = existingSeries.id;
    } else {
      const series = await prisma.series.create({
        data: {
          tenantId,
          name: row.seriesName,
          recordStatus: "active",
        },
        select: { id: true },
      });
      seriesId = series.id;
      counters.seriesCreated += 1;
    }
    seriesIdByName.set(lookupKey(row.seriesName), seriesId);
  }

  return { brandId, seriesId };
}

async function buildPlan(tenantId: string, sheet: SheetRows): Promise<ImportPlan> {
  if (sheet.rows.length > MAX_ROWS) {
    throw new Error(`Too many rows (max ${MAX_ROWS}). Split the file and try again.`);
  }

  const [existingModels, brands, seriesList, features, resolutions, actualSizes] =
    await Promise.all([
      prisma.productModel.findMany({
        where: { tenantId },
        select: {
          id: true,
          skuCode: true,
          name: true,
          status: true,
          brandId: true,
          seriesId: true,
          featureId: true,
          resolutionId: true,
          actualSizeId: true,
          brand: { select: { name: true } },
          series: { select: { name: true } },
          feature: { select: { name: true } },
          resolution: { select: { name: true } },
          actualSize: { select: { name: true } },
        },
      }),
      prisma.brand.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      prisma.series.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      prisma.feature.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      prisma.resolution.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      prisma.actualSize.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    ]);

  const existingBySku = new Map<string, ExistingModel>();
  for (const model of existingModels) {
    existingBySku.set(lookupKey(model.skuCode), model);
  }
  const brandByName = new Map(brands.map((b) => [lookupKey(b.name), b.id]));
  const seriesByName = new Map(seriesList.map((s) => [lookupKey(s.name), s.id]));
  const featureByName = new Map(features.map((f) => [lookupKey(f.name), f.id]));
  const resolutionByName = new Map(resolutions.map((r) => [lookupKey(r.name), r.id]));
  const actualSizeByName = new Map(actualSizes.map((a) => [lookupKey(a.name), a.id]));

  const errors: ModelImportRowError[] = [];
  const previewRows: ModelImportRowPlan[] = [];
  const writes: RowPlanInternal[] = [];
  const seenInFile = new Set<string>();
  let createCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;

  for (const row of sheet.rows) {
    const sku = (row.values.sku ?? "").trim();
    const name = (row.values.name ?? "").trim();
    const brand = (row.values.brand ?? "").trim();
    const series = (row.values.series ?? "").trim();
    const featureRaw = row.values.feature;
    const resolutionRaw = row.values.resolution;
    const actualSizeRaw = row.values.actual_size;
    const statusRaw = row.values.status;
    const statusProvided = !isBlankOrDash(statusRaw);
    const featureProvided = !isBlankOrDash(featureRaw);
    const resolutionProvided = !isBlankOrDash(resolutionRaw);
    const actualSizeProvided = !isBlankOrDash(actualSizeRaw);

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

    let featureId: string | null = null;
    let resolutionId: string | null = null;
    let actualSizeId: string | null = null;
    let rowOk = true;

    if (featureProvided) {
      featureId = featureByName.get(lookupKey(featureRaw!)) ?? null;
      if (!featureId) {
        pushError(`Feature "${featureRaw}" was not found. Create it in Master data first.`);
        rowOk = false;
      }
    }
    if (resolutionProvided) {
      resolutionId = resolutionByName.get(lookupKey(resolutionRaw!)) ?? null;
      if (!resolutionId) {
        pushError(
          `Resolution "${resolutionRaw}" was not found. Create it in Master data first.`,
        );
        rowOk = false;
      }
    }
    if (actualSizeProvided) {
      actualSizeId = actualSizeByName.get(lookupKey(actualSizeRaw!)) ?? null;
      if (!actualSizeId) {
        pushError(
          `Actual size "${actualSizeRaw}" was not found. Create it in Master data first.`,
        );
        rowOk = false;
      }
    }

    if (!rowOk) continue;

    const existing = existingBySku.get(skuKey) ?? null;
    const brandId = brandByName.get(lookupKey(brand)) ?? null;
    const seriesId = seriesByName.get(lookupKey(series)) ?? null;
    const featureLabel = featureProvided ? featureRaw!.trim() : null;
    const resolutionLabel = resolutionProvided ? resolutionRaw!.trim() : null;
    const actualSizeLabel = actualSizeProvided ? actualSizeRaw!.trim() : null;

    if (!existing) {
      const plan: RowPlanInternal = {
        rowNumber: row.rowNumber,
        sku,
        name,
        brand,
        series,
        feature: featureLabel,
        resolution: resolutionLabel,
        actualSize: actualSizeLabel,
        status,
        action: "create",
        changes: [],
        modelId: null,
        brandId,
        seriesId,
        featureId,
        resolutionId,
        actualSizeId,
        brandName: brand,
        seriesName: series,
        statusProvided: true,
      };
      createCount += 1;
      writes.push(plan);
      previewRows.push(plan);
      continue;
    }

    // Update path — blank optional cells leave existing values untouched.
    const nextStatus = statusProvided ? status : existing.status;
    const nextFeatureId = featureProvided ? featureId : existing.featureId;
    const nextResolutionId = resolutionProvided ? resolutionId : existing.resolutionId;
    const nextActualSizeId = actualSizeProvided ? actualSizeId : existing.actualSizeId;
    const nextFeatureLabel = featureProvided
      ? featureLabel
      : (existing.feature?.name ?? null);
    const nextResolutionLabel = resolutionProvided
      ? resolutionLabel
      : (existing.resolution?.name ?? null);
    const nextActualSizeLabel = actualSizeProvided
      ? actualSizeLabel
      : (existing.actualSize?.name ?? null);

    const changes: ModelImportFieldChange[] = [];
    pushChange(changes, "name", existing.name, name);
    pushChange(changes, "brand", existing.brand?.name, brand);
    pushChange(changes, "series", existing.series?.name, series);
    if (featureProvided) {
      pushChange(changes, "feature", existing.feature?.name, featureLabel);
    }
    if (resolutionProvided) {
      pushChange(changes, "resolution", existing.resolution?.name, resolutionLabel);
    }
    if (actualSizeProvided) {
      pushChange(changes, "actualSize", existing.actualSize?.name, actualSizeLabel);
    }
    if (statusProvided) {
      pushChange(changes, "status", existing.status, nextStatus);
    }

    // Brand/series id may still be null if names are new — treat as a change when names differ.
    const brandNameChanged =
      lookupKey(existing.brand?.name ?? "") !== lookupKey(brand);
    const seriesNameChanged =
      lookupKey(existing.series?.name ?? "") !== lookupKey(series);

    if (changes.length === 0 && !brandNameChanged && !seriesNameChanged) {
      unchangedCount += 1;
      previewRows.push({
        rowNumber: row.rowNumber,
        sku,
        name,
        brand,
        series,
        feature: nextFeatureLabel,
        resolution: nextResolutionLabel,
        actualSize: nextActualSizeLabel,
        status: nextStatus,
        action: "skip",
        changes: [],
      });
      continue;
    }

    const plan: RowPlanInternal = {
      rowNumber: row.rowNumber,
      sku,
      name,
      brand,
      series,
      feature: nextFeatureLabel,
      resolution: nextResolutionLabel,
      actualSize: nextActualSizeLabel,
      status: nextStatus,
      action: "update",
      changes,
      modelId: existing.id,
      brandId,
      seriesId,
      featureId: nextFeatureId,
      resolutionId: nextResolutionId,
      actualSizeId: nextActualSizeId,
      brandName: brand,
      seriesName: series,
      statusProvided,
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
): Promise<Omit<ModelImportResult, "modelsUnchanged">> {
  let modelsCreated = 0;
  let modelsUpdated = 0;
  const counters = { brandsCreated: 0, seriesCreated: 0 };
  const brandIdByName = new Map<string, string>();
  const seriesIdByName = new Map<string, string>();

  for (const row of writes) {
    const { brandId, seriesId } = await resolveBrandSeriesIds(
      tenantId,
      row,
      brandIdByName,
      seriesIdByName,
      counters,
    );

    if (row.action === "create") {
      const existing = await prisma.productModel.findUnique({
        where: { tenantId_skuCode: { tenantId, skuCode: row.sku } },
        select: { id: true },
      });
      if (existing) continue;

      const model = await prisma.productModel.create({
        data: {
          tenantId,
          skuCode: row.sku,
          name: row.name,
          brandId,
          seriesId,
          featureId: row.featureId,
          resolutionId: row.resolutionId,
          actualSizeId: row.actualSizeId,
          status: row.status,
        },
        select: { id: true, skuCode: true },
      });
      modelsCreated += 1;

      await auditService.log({
        tenantId,
        userId: actorUserId,
        action: "model.created",
        entityType: "ProductModel",
        entityId: model.id,
        metadata: { skuCode: model.skuCode, source: "model-import" },
      });
      continue;
    }

    if (row.action === "update" && row.modelId) {
      await prisma.productModel.update({
        where: { id: row.modelId },
        data: {
          name: row.name,
          brandId,
          seriesId,
          featureId: row.featureId,
          resolutionId: row.resolutionId,
          actualSizeId: row.actualSizeId,
          status: row.status,
        },
      });
      modelsUpdated += 1;

      await auditService.log({
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

  return {
    modelsCreated,
    modelsUpdated,
    brandsCreated: counters.brandsCreated,
    seriesCreated: counters.seriesCreated,
  };
}

export const modelImportService = {
  async buildTemplate(tenantId: string): Promise<Buffer> {
    const rows = await loadTemplateRows(tenantId);
    return buildModelTemplateWorkbook(rows);
  },

  async buildPlan(
    tenantId: string,
    file: Buffer,
  ): Promise<{ preview: ModelImportPreview }> {
    const sheet = await readModelImportWorkbook(file);
    const plan = await buildPlan(tenantId, sheet);
    return { preview: plan.preview };
  },

  async applyChunk(input: {
    tenantId: string;
    actorUserId: string;
    file: Buffer;
    offset: number;
  }): Promise<ModelImportChunkProgress> {
    const sheet = await readModelImportWorkbook(input.file);
    // Validate the full workbook once so mid-import rebuilds cannot hide row errors.
    const fullPlan = await buildPlan(input.tenantId, sheet);
    if (fullPlan.preview.errors.length > 0) {
      throw new Error(
        `Fix ${fullPlan.preview.errors.length} problem${fullPlan.preview.errors.length === 1 ? "" : "s"} in the spreadsheet and upload again.`,
      );
    }

    const total = sheet.rows.length;
    // Pre-write unchanged is only trustworthy on offset 0 (before any chunk writes).
    const plannedUnchanged =
      input.offset === 0 ? fullPlan.preview.unchangedCount : undefined;

    if (total === 0 || fullPlan.writes.length === 0) {
      const result: ModelImportResult = {
        modelsCreated: 0,
        modelsUpdated: 0,
        modelsUnchanged: fullPlan.preview.unchangedCount,
        brandsCreated: 0,
        seriesCreated: 0,
      };
      return {
        processed: total,
        total,
        nextOffset: total,
        done: true,
        modelsCreated: 0,
        modelsUpdated: 0,
        brandsCreated: 0,
        seriesCreated: 0,
        modelsUnchanged: result.modelsUnchanged,
        result,
      };
    }

    if (input.offset >= total) {
      return {
        processed: total,
        total,
        nextOffset: total,
        done: true,
        modelsCreated: 0,
        modelsUpdated: 0,
        brandsCreated: 0,
        seriesCreated: 0,
      };
    }

    // Slice the stable sheet row list (not the shrinking writes array). Re-plan
    // only this slice against the current DB so already-applied rows become skips.
    const sliceSheet: SheetRows = {
      present: sheet.present,
      columns: sheet.columns,
      rows: sheet.rows.slice(input.offset, input.offset + APPLY_CHUNK_SIZE),
    };
    const slicePlan = await buildPlan(input.tenantId, sliceSheet);
    const written = await applyWriteSlice(
      input.tenantId,
      input.actorUserId,
      slicePlan.writes,
    );
    const nextOffset = input.offset + sliceSheet.rows.length;
    const done = nextOffset >= total;

    return {
      processed: nextOffset,
      total,
      nextOffset,
      done,
      modelsCreated: written.modelsCreated,
      modelsUpdated: written.modelsUpdated,
      brandsCreated: written.brandsCreated,
      seriesCreated: written.seriesCreated,
      modelsUnchanged: plannedUnchanged,
      // Chunk counts are authoritative; client (and apply()) accumulate them.
      // Final result here is last-chunk only — callers must sum chunk deltas.
      result: done
        ? {
            modelsCreated: written.modelsCreated,
            modelsUpdated: written.modelsUpdated,
            modelsUnchanged: plannedUnchanged ?? 0,
            brandsCreated: written.brandsCreated,
            seriesCreated: written.seriesCreated,
          }
        : undefined,
    };
  },

  /** Full apply via offset chunks (non-UI / backwards-compatible callers). */
  async apply(input: {
    tenantId: string;
    actorUserId: string;
    file: Buffer;
  }): Promise<ModelImportResult> {
    let offset = 0;
    let modelsCreated = 0;
    let modelsUpdated = 0;
    let brandsCreated = 0;
    let seriesCreated = 0;
    let modelsUnchanged = 0;

    for (;;) {
      const progress = await this.applyChunk({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        file: input.file,
        offset,
      });
      if (offset === 0 && progress.modelsUnchanged != null) {
        modelsUnchanged = progress.modelsUnchanged;
      }
      modelsCreated += progress.modelsCreated;
      modelsUpdated += progress.modelsUpdated;
      brandsCreated += progress.brandsCreated;
      seriesCreated += progress.seriesCreated;
      if (progress.done) {
        return {
          modelsCreated,
          modelsUpdated,
          modelsUnchanged,
          brandsCreated,
          seriesCreated,
        };
      }
      offset = progress.nextOffset;
    }
  },
};
