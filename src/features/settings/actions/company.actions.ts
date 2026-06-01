"use server";

import { revalidatePath, updateTag } from "next/cache";

import { companySettingsSchema } from "@/features/settings/schemas/company-settings.schema";
import { tenantService } from "@/features/tenants/services/tenant.service";
import { requireCompanyManage } from "@/lib/auth/permissions";

export async function updateCompanySettingsAction(input: {
  name: string;
  tagline: string;
  logo?: string | null;
}) {
  const session = await requireCompanyManage();
  const parsed = companySettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await tenantService.updateBranding(
      session.user.tenantId,
      session.user.id,
      parsed.data,
    );
    revalidatePath("/", "layout");
    revalidatePath("/settings/company");
    updateTag(`tenant-branding-${session.user.tenantId}`);
    return { success: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to update company settings",
    };
  }
}
