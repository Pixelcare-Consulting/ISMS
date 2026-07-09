import type { LookupRecordStatus } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import {
  LOOKUP_ENTITIES,
  type LookupEntityConfig,
  type LookupEntityKey,
} from "@/features/lookups/constants/lookup-registry";
import { lookupRepository } from "@/features/lookups/repositories/lookup.repository";
import {
  lookupStatusSchema,
  lookupWriteSchema,
  type LookupWriteInput,
} from "@/features/lookups/schemas/lookup.schema";

interface LookupActorContext {
  tenantId: string;
  actorUserId: string;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

function duplicateMessage(config: LookupEntityConfig): string {
  return config.code
    ? `A ${config.singular} with this name or code already exists`
    : `A ${config.singular} with this name already exists`;
}

function buildWriteData(
  config: LookupEntityConfig,
  input: LookupWriteInput,
): Record<string, unknown> {
  const data: Record<string, unknown> = { name: input.name };

  if (config.code) {
    const code = input.code?.trim() ?? "";
    if (config.code.required && !code) {
      throw new Error("Code is required");
    }
    data.code = code || null;
  }

  if (config.parent) {
    const parentId = input.parentId?.trim() ?? "";
    if (config.parent.required && !parentId) {
      throw new Error(`${config.parent.label} is required`);
    }
    data[config.parent.field] = parentId || null;
  }

  if (config.classField) {
    const classValue = input.class?.trim() ?? "";
    data.class = classValue || null;
  }

  return data;
}

async function requireValidParent(
  config: LookupEntityConfig,
  tenantId: string,
  data: Record<string, unknown>,
) {
  if (!config.parent) return;
  const parentId = data[config.parent.field];
  if (typeof parentId !== "string" || !parentId) return;
  const parent = await lookupRepository.findParent(config.parent.key, tenantId, parentId);
  if (!parent) {
    throw new Error(`Invalid ${config.parent.label.toLowerCase()}`);
  }
}

export const lookupService = {
  list(entity: LookupEntityKey, tenantId: string) {
    return lookupRepository.list(entity, tenantId);
  },

  async listParentOptions(entity: LookupEntityKey, tenantId: string) {
    const config = LOOKUP_ENTITIES[entity];
    if (!config.parent) return [];
    const rows = await lookupRepository.listParentOptions(config.parent.key, tenantId);
    return rows.map((row) => ({ id: row.id, name: row.name }));
  },

  async create(entity: LookupEntityKey, ctx: LookupActorContext, input: unknown) {
    const config = LOOKUP_ENTITIES[entity];
    const parsed = lookupWriteSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const data = buildWriteData(config, parsed.data);
    await requireValidParent(config, ctx.tenantId, data);

    try {
      const row = await lookupRepository.create(entity, ctx.tenantId, data);
      await auditService.log({
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        action: `${config.auditKey}.created`,
        entityType: config.auditEntity,
        entityId: row.id,
        metadata: { name: row.name },
      });
      return row;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error(duplicateMessage(config));
      }
      throw error;
    }
  },

  async update(
    entity: LookupEntityKey,
    ctx: LookupActorContext,
    id: string,
    input: unknown,
  ) {
    const config = LOOKUP_ENTITIES[entity];
    const parsed = lookupWriteSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await lookupRepository.findById(entity, ctx.tenantId, id);
    if (!existing) {
      throw new Error("Record not found");
    }

    const data = buildWriteData(config, parsed.data);
    await requireValidParent(config, ctx.tenantId, data);

    try {
      const row = await lookupRepository.update(entity, ctx.tenantId, id, data);
      await auditService.log({
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        action: `${config.auditKey}.updated`,
        entityType: config.auditEntity,
        entityId: row.id,
        metadata: { name: row.name, previousName: existing.name },
      });
      return row;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error(duplicateMessage(config));
      }
      throw error;
    }
  },

  async setStatus(
    entity: LookupEntityKey,
    ctx: LookupActorContext,
    id: string,
    input: unknown,
  ) {
    const config = LOOKUP_ENTITIES[entity];
    const parsed = lookupStatusSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await lookupRepository.findById(entity, ctx.tenantId, id);
    if (!existing) {
      throw new Error("Record not found");
    }

    const recordStatus: LookupRecordStatus = parsed.data.recordStatus;
    const row = await lookupRepository.update(entity, ctx.tenantId, id, {
      recordStatus,
    });
    await auditService.log({
      tenantId: ctx.tenantId,
      userId: ctx.actorUserId,
      action: `${config.auditKey}.status_changed`,
      entityType: config.auditEntity,
      entityId: row.id,
      metadata: { name: row.name, from: existing.recordStatus, to: recordStatus },
    });
    return row;
  },
};
