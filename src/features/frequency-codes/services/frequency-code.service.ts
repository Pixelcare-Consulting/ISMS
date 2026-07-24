import { auditService } from "@/features/audit/services/audit.service";
import { frequencyCodeRepository } from "@/features/frequency-codes/repositories/frequency-code.repository";
import { frequencyCodeSchema } from "@/features/frequency-codes/schemas/frequency-code.schema";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

function isForeignKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2003"
  );
}

export const frequencyCodeService = {
  list(tenantId: string) {
    return frequencyCodeRepository.listByTenant(tenantId);
  },

  async create(input: { tenantId: string; actorUserId: string } & Record<string, unknown>) {
    const parsed = frequencyCodeSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

    try {
      const code = await frequencyCodeRepository.create(input.tenantId, parsed.data);
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "frequency_code.created",
        entityType: "FrequencyCode",
        entityId: code.id,
        metadata: { code: code.code, frequency: code.frequency },
      });
      return code;
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new Error("A frequency code with this code already exists");
      throw error;
    }
  },

  async update(input: { tenantId: string; actorUserId: string; id: string } & Record<string, unknown>) {
    const parsed = frequencyCodeSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");

    try {
      const code = await frequencyCodeRepository.update(input.tenantId, input.id, parsed.data);
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "frequency_code.updated",
        entityType: "FrequencyCode",
        entityId: code.id,
        metadata: { code: code.code, frequency: code.frequency },
      });
      return code;
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new Error("A frequency code with this code already exists");
      throw error;
    }
  },

  async delete(input: { tenantId: string; actorUserId: string; id: string }) {
    const existing = await frequencyCodeRepository.findById(input.tenantId, input.id);
    if (!existing) throw new Error("Frequency code not found");
    if (existing._count.branchSchedules > 0) {
      throw new Error(
        `Cannot delete — ${existing._count.branchSchedules} branch(es) use this code.`,
      );
    }

    try {
      await frequencyCodeRepository.delete(input.tenantId, input.id);
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "frequency_code.deleted",
        entityType: "FrequencyCode",
        entityId: input.id,
        metadata: { code: existing.code },
      });
    } catch (error) {
      if (isForeignKeyError(error)) {
        throw new Error("Cannot delete — this code is in use by one or more branches.");
      }
      throw error;
    }
  },
};
