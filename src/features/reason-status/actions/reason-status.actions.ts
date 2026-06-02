"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { requirePermission } from "@/lib/auth/permissions";
import type { ReasonStatusCategory } from "@prisma/client";

const createCodeSchema = z.object({
  category: z.enum([
    "inventory_system",
    "pullout_reason",
    "delivery_workflow",
    "transfer_workflow",
    "pullout_workflow",
  ]),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(32),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

const updateCodeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  recordStatus: z.enum(["active", "inactive"]).optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export async function listReasonStatusesAction() {
  const session = await requirePermission("status_settings.manage");
  return reasonStatusService.listForTenant(session.user.tenantId);
}

export async function listReasonStatusCodesAction(category: ReasonStatusCategory) {
  const session = await requirePermission("inventory.view");
  const codes = await reasonStatusService.listActiveCodes(
    session.user.tenantId,
    category,
  );
  return codes.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    category: c.reasonStatus.category,
  }));
}

export async function createReasonStatusCodeAction(input: unknown) {
  const session = await requirePermission("status_settings.manage");
  const parsed = createCodeSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  try {
    const code = await reasonStatusService.createCode({
      tenantId: session.user.tenantId,
      category: parsed.data.category,
      name: parsed.data.name,
      code: parsed.data.code,
      sortOrder: parsed.data.sortOrder,
    });
    revalidatePath("/settings/status");
    return { success: true as const, code };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create status code" };
  }
}

export async function updateReasonStatusCodeAction(codeId: string, input: unknown) {
  const session = await requirePermission("status_settings.manage");
  const parsed = updateCodeSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid input" };

  try {
    const code = await reasonStatusService.updateCode(session.user.tenantId, codeId, parsed.data);
    revalidatePath("/settings/status");
    revalidatePath("/inventory");
    revalidatePath("/logistics");
    revalidatePath("/logistics/deliveries");
    revalidatePath("/logistics/transfers");
    revalidatePath("/logistics/pickups");
    return { success: true as const, code };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update status code" };
  }
}
