import bcrypt from "bcryptjs";

import { auditService } from "@/features/audit/services/audit.service";
import {
  filterTenantVisibleRoles,
  filterTenantVisibleUsers,
  isProviderOnlyRole,
  userHasProviderOnlyRole,
} from "@/features/roles/constants/role.constants";
import {
  disableAccountDeniedReason,
  resetSessionDeniedReason,
} from "@/features/users/lib/user-account-guards";
import { departmentRepository } from "@/features/users/repositories/department.repository";
import { roleRepository } from "@/features/users/repositories/role.repository";
import { userRepository } from "@/features/users/repositories/user.repository";
import { updateUserSchema } from "@/features/users/schemas/update-user.schema";
import { syncCredentialAccountPassword } from "@/lib/auth/auth";

async function resolveAssignableRoles(input: {
  tenantId: string;
  roleSlugs: string[];
  allowProviderOnlyRoles?: boolean;
}) {
  const slugs = [
    ...new Set(input.roleSlugs.map((slug) => slug.trim()).filter(Boolean)),
  ];
  if (slugs.length === 0) {
    throw new Error("At least one role is required");
  }

  const roles: NonNullable<
    Awaited<ReturnType<typeof roleRepository.findBySlug>>
  >[] = [];
  for (const slug of slugs) {
    if (!input.allowProviderOnlyRoles && isProviderOnlyRole(slug)) {
      throw new Error("This role cannot be assigned");
    }
    const role = await roleRepository.findBySlug(input.tenantId, slug);
    if (!role) {
      throw new Error("Role not found");
    }
    roles.push(role);
  }
  return roles;
}

export const userService = {
  async listUsers(tenantId: string, isPlatformOperator = false) {
    const users = await userRepository.listByTenant(tenantId);
    return isPlatformOperator ? users : filterTenantVisibleUsers(users);
  },

  async listRoles(tenantId: string, includeProviderOnlyRoles = false) {
    const roles = await roleRepository.listByTenant(tenantId);
    return includeProviderOnlyRoles
      ? roles
      : filterTenantVisibleRoles(roles);
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
    roleSlugs: string[];
    departmentId?: string | null;
    allowProviderOnlyRoles?: boolean;
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

    const roles = await resolveAssignableRoles({
      tenantId: input.tenantId,
      roleSlugs: input.roleSlugs,
      allowProviderOnlyRoles: input.allowProviderOnlyRoles,
    });

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await userRepository.create({
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      passwordHash,
      departmentId: input.departmentId ?? null,
      mustChangePassword: false,
    });
    await syncCredentialAccountPassword(user.id, passwordHash);

    for (const role of roles) {
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
    roleSlugs: string[];
    departmentId?: string | null;
    password?: string;
    allowProviderOnlyRoles?: boolean;
  }) {
    const parsed = updateUserSchema.safeParse({
      userId: input.userId,
      name: input.name,
      roleSlugs: input.roleSlugs,
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

    if (
      !input.allowProviderOnlyRoles &&
      userHasProviderOnlyRole(user.userRoles)
    ) {
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

    const roles = await resolveAssignableRoles({
      tenantId: input.tenantId,
      roleSlugs: parsed.data.roleSlugs,
      allowProviderOnlyRoles: input.allowProviderOnlyRoles,
    });

    await userRepository.update(input.tenantId, input.userId, {
      name: parsed.data.name,
      departmentId: parsed.data.departmentId ?? null,
    });

    await userRepository.setRoles(
      input.userId,
      roles.map((role) => role.id),
    );

    if (parsed.data.password) {
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      await userRepository.updatePasswordHash(
        input.tenantId,
        input.userId,
        passwordHash,
      );
      await syncCredentialAccountPassword(input.userId, passwordHash);
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
    allowProviderOnlyRoles?: boolean;
  }) {
    if (input.actorUserId === input.userId) {
      throw new Error("You cannot delete your own account");
    }

    const user = await userRepository.findById(input.tenantId, input.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (
      !input.allowProviderOnlyRoles &&
      userHasProviderOnlyRole(user.userRoles)
    ) {
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
  /** Clears stuck sessions (e.g. forgot to sign out) so the user can sign in again. */
  async resetUserSessions(input: {
    tenantId: string;
    actorUserId: string;
    userId: string;
  }) {
    const user = await userRepository.findById(input.tenantId, input.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const denied = resetSessionDeniedReason({
      actorUserId: input.actorUserId,
      targetUserId: input.userId,
      targetRoles: user.userRoles,
    });
    if (denied) {
      throw new Error(denied);
    }

    const cleared = await userRepository.deleteSessions(user.id);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "user.session_reset",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email, sessionsCleared: cleared },
    });

    return { cleared };
  },

  /** Signs the person out everywhere and blocks the next sign-in. Separate from delete. */
  async disableUser(input: {
    tenantId: string;
    actorUserId: string;
    userId: string;
  }) {
    const user = await userRepository.findById(input.tenantId, input.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const denied = disableAccountDeniedReason({
      actorUserId: input.actorUserId,
      targetUserId: input.userId,
      targetRoles: user.userRoles,
    });
    if (denied) {
      throw new Error(denied);
    }

    await userRepository.setDisabledAt(input.tenantId, input.userId, new Date());
    const cleared = await userRepository.deleteSessions(user.id);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "user.disabled",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email, sessionsCleared: cleared },
    });
  },

  /** Turns an account back on. Does not create a session. */
  async enableUser(input: {
    tenantId: string;
    actorUserId: string;
    userId: string;
  }) {
    const user = await userRepository.findById(input.tenantId, input.userId);
    if (!user) {
      throw new Error("User not found");
    }

    await userRepository.setDisabledAt(input.tenantId, input.userId, null);

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "user.enabled",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
    });
  },
};
