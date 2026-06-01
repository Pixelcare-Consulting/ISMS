import { auditService } from "@/features/audit/services/audit.service";
import { masterDataRepository } from "@/features/master-data/repositories/master-data.repository";
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
};
