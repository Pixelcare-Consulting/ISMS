"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orderingPolicyService } from "@/features/ordering/services/ordering-policy.service";
import { requirePermission } from "@/lib/auth/permissions";

const minutesSchema = z.number().int().min(0).max(1439).nullable();

const orderTypeSchema = z.enum(["manual", "special", "auto_replenish"]);

const updateSchema = z
  .object({
    globalLockedWeekdays: z.array(z.number().int().min(0).max(6)),
    dailyLockEnabled: z.boolean(),
    dailyLockStartMinutes: minutesSchema,
    dailyLockEndMinutes: minutesSchema,
    lockAppliesToOrderTypes: z.array(orderTypeSchema).min(1, {
      message: "Select at least one order module for company locks.",
    }),
  })
  .superRefine((data, ctx) => {
    if (!data.dailyLockEnabled) return;
    if (data.dailyLockStartMinutes == null || data.dailyLockEndMinutes == null) {
      ctx.addIssue({
        code: "custom",
        message: "Start and end times are required when the daily time lock is enabled.",
        path: ["dailyLockStartMinutes"],
      });
      return;
    }
    if (data.dailyLockStartMinutes >= data.dailyLockEndMinutes) {
      ctx.addIssue({
        code: "custom",
        message: "Start time must be earlier than end time (same-day window).",
        path: ["dailyLockEndMinutes"],
      });
    }
  });

export async function updateOrderingPolicyAction(input: unknown) {
  const session = await requirePermission("ordering_settings.manage");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    await orderingPolicyService.updatePolicy({
      tenantId: session.user.tenantId,
      actorUserId: session.user.id,
      globalLockedWeekdays: parsed.data.globalLockedWeekdays,
      dailyLockEnabled: parsed.data.dailyLockEnabled,
      dailyLockStartMinutes: parsed.data.dailyLockStartMinutes,
      dailyLockEndMinutes: parsed.data.dailyLockEndMinutes,
      lockAppliesToOrderTypes: parsed.data.lockAppliesToOrderTypes,
    });
    revalidatePath("/settings/ordering");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update ordering policy" };
  }
}
