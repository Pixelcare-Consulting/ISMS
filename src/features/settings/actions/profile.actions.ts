"use server";

import { revalidatePath, updateTag } from "next/cache";

import {
  changePasswordSchema,
  updateProfileSchema,
} from "@/features/settings/schemas/profile-settings.schema";
import { profileService } from "@/features/settings/services/profile.service";
import { requireAuth } from "@/lib/auth/permissions";

export async function updateProfileAction(input: {
  name: string;
  image?: string | null;
}) {
  const session = await requireAuth();
  const parsed = updateProfileSchema.safeParse(input);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const user = await profileService.updateProfile({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      name: parsed.data.name,
      image: parsed.data.image,
    });

    revalidatePath("/settings/profile");
    revalidatePath("/", "layout");
    updateTag(`user-profile-${session.user.id}`);

    return {
      success: true,
      user: {
        name: user.name,
        image: user.image,
      },
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update profile",
    };
  }
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  const session = await requireAuth();
  const parsed = changePasswordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await profileService.changePassword({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });

    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to change password",
    };
  }
}
