import bcrypt from "bcryptjs";

import { auditService } from "@/features/audit/services/audit.service";
import { userRepository } from "@/features/users/repositories/user.repository";

export const profileService = {
  async getProfile(tenantId: string, userId: string) {
    const user = await userRepository.findById(tenantId, userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  },

  async updateProfile(input: {
    tenantId: string;
    userId: string;
    name: string;
    image?: string | null;
  }) {
    const user = await profileService.getProfile(input.tenantId, input.userId);

    const updated = await userRepository.updateProfile(input.tenantId, user.id, {
      name: input.name,
      image: input.image === undefined ? user.image : input.image,
    });

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "user.profile_updated",
      entityType: "User",
      entityId: user.id,
    });

    return updated;
  },

  async changePassword(input: {
    tenantId: string;
    userId: string;
    currentPassword: string;
    newPassword: string;
  }) {
    const user = await userRepository.findById(input.tenantId, input.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const isValid = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );
    if (!isValid) {
      throw new Error("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await userRepository.updatePasswordHash(
      input.tenantId,
      user.id,
      passwordHash,
    );

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.userId,
      action: "user.password_changed",
      entityType: "User",
      entityId: user.id,
    });
  },
};
