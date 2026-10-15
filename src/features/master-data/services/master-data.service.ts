import { auditService } from "@/features/audit/services/audit.service";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
import { modelBrandSapPushService } from "@/features/master-data/services/model-brand-sap-push.service";
import {
  MODEL_LOOKUP_FIELDS,
  loadModelLookupIndexes,
  lookupInactiveMessage,
  lookupNotAvailableMessage,
  type ModelLookupField,
} from "@/features/master-data/services/model-lookup-index";
import { z } from "zod";

const createBrandSchema = z.object({
  name: z.string().min(1).max(80),
  code: z.string().max(32).optional(),
});

const createModelSchema = z.object({
  skuCode: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  brandId: z.string().optional().nullable(),
  status: z.enum(["active", "hold", "retired"]).optional(),
});

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

export const masterDataService = {
  listBrands(tenantId: string) {
    return masterDataRepository.listBrands(tenantId);
  },

  listModels(tenantId: string, brandId?: string) {
    return masterDataRepository.listModels(tenantId, brandId);
  },

  async createBrand(input: {
    tenantId: string;
    actorUserId: string;
    name: string;
    code?: string;
  }) {
    const parsed = createBrandSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    try {
      const brand = await masterDataRepository.createBrand(input.tenantId, parsed.data);
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "brand.created",
        entityType: "Brand",
        entityId: brand.id,
        metadata: { name: brand.name },
      });
      return brand;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("A brand with this name already exists");
      }
      throw error;
    }
  },

  async createModel(input: {
    tenantId: string;
    actorUserId: string;
    skuCode: string;
    name: string;
    brandId?: string | null;
    status?: "active" | "hold" | "retired";
  }) {
    const parsed = createModelSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    try {
      const model = await masterDataRepository.createModel(input.tenantId, parsed.data);
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "model.created",
        entityType: "ProductModel",
        entityId: model.id,
        metadata: { skuCode: model.skuCode, name: model.name },
      });
      return model;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("A model with this SKU code already exists");
      }
      throw error;
    }
  },

  async updateModelStatus(input: {
    tenantId: string;
    actorUserId: string;
    modelId: string;
    status: "active" | "hold" | "retired";
  }) {
    const existing = await masterDataRepository.findModel(input.tenantId, input.modelId);
    if (!existing) throw new Error("Model not found");
    if (existing.status === input.status) {
      throw new Error("Status is unchanged");
    }

    const model = await masterDataRepository.updateModelStatus(
      input.tenantId,
      input.modelId,
      input.status,
    );

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "model.status_updated",
      entityType: "ProductModel",
      entityId: model.id,
      metadata: { skuCode: model.skuCode, from: existing.status, to: input.status },
    });

    return model;
  },

  /**
   * Re-point a model's lookups. Every changed id must exist in ISMS for this tenant and
   * be active; an unchanged one is left alone even if it has been deactivated since.
   *
   * A brand change is also pushed to SAP's `U_Brand`, because the item sync reads that
   * field back into `brandId`. SAP trouble never undoes the ISMS save — it comes back
   * as `sapWarning` for the user to act on.
   */
  async updateModelDetails(input: {
    tenantId: string;
    actorUserId: string;
    modelId: string;
    brandId: string;
    seriesId: string | null;
    categoryId: string | null;
    featureId: string | null;
    resolutionId: string | null;
    actualSizeId: string | null;
  }): Promise<{ sapWarning?: string }> {
    const existing = await masterDataRepository.findModel(input.tenantId, input.modelId);
    if (!existing) throw new Error("Model not found");

    const next: Record<ModelLookupField, string | null> = {
      brand: input.brandId,
      category: input.categoryId,
      feature: input.featureId,
      resolution: input.resolutionId,
      actualSize: input.actualSizeId,
    };
    const current: Record<ModelLookupField, string | null> = {
      brand: existing.brandId,
      category: existing.categoryId,
      feature: existing.featureId,
      resolution: existing.resolutionId,
      actualSize: existing.actualSizeId,
    };
    const changedLookups = MODEL_LOOKUP_FIELDS.filter((field) => next[field] !== current[field]);
    const seriesChanged = input.seriesId !== existing.seriesId;
    if (changedLookups.length === 0 && !seriesChanged) {
      throw new Error("Nothing changed");
    }

    const indexes = await loadModelLookupIndexes(input.tenantId);
    for (const field of changedLookups) {
      const id = next[field];
      if (!id) continue;
      const match = indexes[field].byId(id);
      if (!match) throw new Error(lookupNotAvailableMessage(field, id));
      if (!match.active) throw new Error(lookupInactiveMessage(field, match.name));
    }
    if (seriesChanged && input.seriesId) {
      const series = await masterDataRepository.findSeries(input.tenantId, input.seriesId);
      if (!series) throw new Error(`Series "${input.seriesId}" is not available in ISMS.`);
      if (series.recordStatus !== "active") {
        throw new Error(
          `Series "${series.name}" is inactive. Activate it in Master data or pick an active series.`,
        );
      }
    }

    const model = await masterDataRepository.updateModelDetails(
      input.tenantId,
      input.modelId,
      {
        brandId: input.brandId,
        seriesId: input.seriesId,
        categoryId: input.categoryId,
        featureId: input.featureId,
        resolutionId: input.resolutionId,
        actualSizeId: input.actualSizeId,
      },
      existing.brandId,
    );

    const changes: Record<string, { from: string | null; to: string | null }> = {};
    for (const field of changedLookups) {
      changes[field] = { from: current[field], to: next[field] };
    }
    if (seriesChanged) changes.series = { from: existing.seriesId, to: input.seriesId };
    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "model.updated",
      entityType: "ProductModel",
      entityId: model.id,
      metadata: { skuCode: model.skuCode, source: "model-edit", changes },
    });

    if (!changedLookups.includes("brand")) return {};

    const brandName = indexes.brand.byId(input.brandId)!.name;
    const outcome = await modelBrandSapPushService.pushAndAudit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      rows: [{ sku: model.skuCode, brand: brandName }],
      source: "model-edit",
    });
    const reason = outcome.aborted ?? outcome.failures[0]?.message;
    if (!reason) return {};
    return {
      sapWarning: `Saved in ISMS, but SAP's brand was not updated (${reason}). The next SAP sync may revert the brand.`,
    };
  },
};
