import { auditService } from "@/features/audit/services/audit.service";
import { departmentRepository } from "@/features/users/repositories/department.repository";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from "@/features/users/schemas/department.schema";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

export const departmentService = {
  listDepartments(tenantId: string) {
    return departmentRepository.listByTenant(tenantId);
  },

  seedDefaultDepartments(tenantId: string, names: readonly string[]) {
    return departmentRepository.createMany(tenantId, names);
  },

  async createDepartment(input: {
    tenantId: string;
    actorUserId: string;
    name: string;
  }) {
    const parsed = createDepartmentSchema.safeParse({ name: input.name });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    try {
      const department = await departmentRepository.create(input.tenantId, {
        name: parsed.data.name,
      });

      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "department.created",
        entityType: "Department",
        entityId: department.id,
        metadata: { name: department.name },
      });

      return department;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("A department with this name already exists");
      }
      throw error;
    }
  },

  async updateDepartment(input: {
    tenantId: string;
    actorUserId: string;
    departmentId: string;
    name: string;
  }) {
    const parsed = updateDepartmentSchema.safeParse({
      departmentId: input.departmentId,
      name: input.name,
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await departmentRepository.findById(
      input.tenantId,
      parsed.data.departmentId,
    );
    if (!existing) {
      throw new Error("Department not found");
    }

    try {
      const department = await departmentRepository.update(
        input.tenantId,
        parsed.data.departmentId,
        { name: parsed.data.name },
      );

      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: "department.updated",
        entityType: "Department",
        entityId: department.id,
        metadata: { name: department.name },
      });

      return department;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error("A department with this name already exists");
      }
      throw error;
    }
  },

  async deleteDepartment(input: {
    tenantId: string;
    actorUserId: string;
    departmentId: string;
  }) {
    const department = await departmentRepository.findById(
      input.tenantId,
      input.departmentId,
    );
    if (!department) {
      throw new Error("Department not found");
    }

    const assignedUsers = await departmentRepository.countUsers(
      input.tenantId,
      input.departmentId,
    );
    if (assignedUsers > 0) {
      throw new Error(
        `Cannot delete department while ${assignedUsers} user${assignedUsers === 1 ? "" : "s"} are assigned`,
      );
    }

    await departmentRepository.softDelete(input.tenantId, input.departmentId);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "department.deleted",
      entityType: "Department",
      entityId: department.id,
      metadata: { name: department.name },
    });
  },
};
