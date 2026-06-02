import bcrypt from "bcryptjs";

import { auditService } from "@/features/audit/services/audit.service";
import {
  filterTenantVisibleRoles,
  filterTenantVisibleUsers,
  isProviderOnlyRole,
  userHasProviderOnlyRole,
} from "@/features/roles/constants/role.constants";
import { departmentRepository } from "@/features/users/repositories/department.repository";
import { roleRepository } from "@/features/users/repositories/role.repository";
import { userRepository } from "@/features/users/repositories/user.repository";

import { updateUserSchema } from "@/features/users/schemas/update-user.schema";

export const userService = {
  async listUsers(tenantId: string, isPlatformOperator = false) {
    const users = await userRepository.listByTenant(tenantId);
    return isPlatformOperator ? users : filterTenantVisibleUsers(users);
  },

  async listRoles(tenantId: string) {
    const roles = await roleRepository.listByTenant(tenantId);
    return filterTenantVisibleRoles(roles);
  },

  async listDepartments(tenantId: string) {
    return departmentRepository.listByTenant(tenantId);
  },

  async createUser(input: {
    tenantId: string;
    actorUserId?: string;
    email: string;
    name: string;
    password: string;
    roleSlug?: string;
    departmentId?: string | null;
  }) {
    const existing = await userRepository.findByEmail(
      input.tenantId,
      input.email,
    );
    if (existing) {
      throw new Error("User with this email already exists");
    }

    if (input.departmentId) {
      const department = await departmentRepository.findById(
        input.tenantId,
        input.departmentId,
      );
      if (!department) {
        throw new Error("Department not found");
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await userRepository.create({
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      passwordHash,
      departmentId: input.departmentId ?? null,
    });

    const roleSlug = input.roleSlug ?? "employee";
    if (isProviderOnlyRole(roleSlug)) {
      throw new Error("This role cannot be assigned");
    }
    const role = await roleRepository.findBySlug(input.tenantId, roleSlug);
    if (role) {
      await userRepository.assignRole(user.id, role.id);
    }

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "user.created",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
    });

    return userRepository.findById(input.tenantId, user.id);
  },

  async updateUser(input: {
    tenantId: string;
    actorUserId: string;
    userId: string;
    name: string;
    roleSlug: string;
    departmentId?: string | null;
    password?: string;
  }) {
    const parsed = updateUserSchema.safeParse({
      userId: input.userId,
      name: input.name,
      roleSlug: input.roleSlug,
      departmentId: input.departmentId,
      password: input.password,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const user = await userRepository.findById(input.tenantId, input.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (userHasProviderOnlyRole(user.userRoles)) {
      throw new Error("This user cannot be modified");
    }

    if (input.departmentId) {
      const department = await departmentRepository.findById(
        input.tenantId,
        input.departmentId,
      );
      if (!department) {
        throw new Error("Department not found");
      }
    }

    if (isProviderOnlyRole(input.roleSlug)) {
      throw new Error("This role cannot be assigned");
    }

    const role = await roleRepository.findBySlug(input.tenantId, input.roleSlug);
    if (!role) {
      throw new Error("Role not found");
    }

    await userRepository.update(input.tenantId, input.userId, {
      name: parsed.data.name,
      departmentId: parsed.data.departmentId ?? null,
    });

    await userRepository.setRoles(input.userId, [role.id]);

    if (parsed.data.password) {
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      await userRepository.updatePasswordHash(
        input.tenantId,
        input.userId,
        passwordHash,
      );
    }

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "user.updated",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
    });

    return userRepository.findById(input.tenantId, input.userId);
  },

  async deleteUser(input: {
    tenantId: string;
    actorUserId: string;
    userId: string;
  }) {
    if (input.actorUserId === input.userId) {
      throw new Error("You cannot delete your own account");
    }

    const user = await userRepository.findById(input.tenantId, input.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (userHasProviderOnlyRole(user.userRoles)) {
      throw new Error("This user cannot be deleted");
    }

    await userRepository.softDelete(input.tenantId, input.userId);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "user.deleted",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
    });
  },
};
