"use server";

import { revalidatePath } from "next/cache";

import { CUSTOM_DASHBOARD_MANAGE } from "@/features/custom-dashboards/constants/custom-dashboard-permissions";
import { sanitizeDashboardTemplate } from "@/features/custom-dashboards/lib/sanitize-template";
import { READY_MADE_DASHBOARDS, isReadyMadeKey } from "@/features/custom-dashboards/ready-made/ready-made-dashboards";
import {
  copyReadyMadeDashboardSchema,
  customDashboardDetailsSchema,
  customDashboardIdSchema,
  saveCustomDashboardTemplateSchema,
  updateCustomDashboardDetailsSchema,
  updateCustomDashboardPeriodSchema,
} from "@/features/custom-dashboards/schemas/custom-dashboard.schema";
import { customDashboardService } from "@/features/custom-dashboards/services/custom-dashboard.service";
import blankTemplate from "@/features/reporting/templates/dashboards/blank.mrt.json";
import { READY_MADE_TEMPLATES } from "@/features/reporting/templates/template-loaders";
import { requirePermission } from "@/lib/auth/permissions";
import { logger } from "@/lib/shared/logger";

type ActionResult<T = object> = ({ success: true } & T) | { success: false; error: string };

const NOT_FOUND = "Dashboard not found or you are not its owner";

function revalidateCustomDashboards(id?: string) {
  revalidatePath("/dashboard/custom");
  if (id) revalidatePath(`/dashboard/custom/${id}`);
}

export async function createCustomDashboardAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(CUSTOM_DASHBOARD_MANAGE);
  const parsed = customDashboardDetailsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid details" };

  try {
    const { id } = await customDashboardService.create(
      session.user.tenantId,
      session.user.id,
      parsed.data,
      blankTemplate as Record<string, unknown>,
    );
    revalidateCustomDashboards();
    return { success: true, id };
  } catch (error) {
    logger.error({ err: error, tenantId: session.user.tenantId }, "custom-dashboards: create failed");
    return { success: false, error: "Could not create the dashboard" };
  }
}

/** Copies a ready-made dashboard into the caller's own (private, editable) dashboards. */
export async function copyReadyMadeDashboardAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(CUSTOM_DASHBOARD_MANAGE);
  const parsed = copyReadyMadeDashboardSchema.safeParse(input);
  if (!parsed.success || !isReadyMadeKey(parsed.data.key)) return { success: false, error: "Unknown ready-made dashboard" };

  const readyMade = READY_MADE_DASHBOARDS[parsed.data.key];
  try {
    const template = (await READY_MADE_TEMPLATES[parsed.data.key]()).default as Record<string, unknown>;
    const { id } = await customDashboardService.create(
      session.user.tenantId,
      session.user.id,
      { name: `${readyMade.name} (my copy)`, description: readyMade.description, visibility: "PRIVATE" },
      template,
    );
    revalidateCustomDashboards();
    return { success: true, id };
  } catch (error) {
    logger.error({ err: error, key: parsed.data.key }, "custom-dashboards: copy ready-made failed");
    return { success: false, error: "Could not copy the dashboard" };
  }
}

export async function updateCustomDashboardDetailsAction(input: unknown): Promise<ActionResult> {
  const session = await requirePermission(CUSTOM_DASHBOARD_MANAGE);
  const parsed = updateCustomDashboardDetailsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid details" };

  const { id, ...details } = parsed.data;
  const updated = await customDashboardService.updateDetails(session.user.tenantId, session.user.id, id, details);
  if (!updated) return { success: false, error: NOT_FOUND };
  revalidateCustomDashboards(id);
  return { success: true };
}

export async function saveCustomDashboardTemplateAction(input: unknown): Promise<ActionResult> {
  const session = await requirePermission(CUSTOM_DASHBOARD_MANAGE);
  const parsed = saveCustomDashboardTemplateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid dashboard" };

  const sanitized = sanitizeDashboardTemplate(parsed.data.template);
  if (!sanitized.ok) return { success: false, error: sanitized.error };

  try {
    const saved = await customDashboardService.saveTemplate(
      session.user.tenantId,
      session.user.id,
      parsed.data.id,
      sanitized.template,
    );
    if (!saved) return { success: false, error: NOT_FOUND };
    revalidateCustomDashboards(parsed.data.id);
    return { success: true };
  } catch (error) {
    logger.error({ err: error, id: parsed.data.id }, "custom-dashboards: save failed");
    return { success: false, error: "Could not save the dashboard" };
  }
}

/** Sets the rolling period a dashboard opens on. Viewers can still pick another one. */
export async function updateCustomDashboardPeriodAction(input: unknown): Promise<ActionResult> {
  const session = await requirePermission(CUSTOM_DASHBOARD_MANAGE);
  const parsed = updateCustomDashboardPeriodSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid period" };

  try {
    const saved = await customDashboardService.savePeriod(
      session.user.tenantId,
      session.user.id,
      parsed.data.id,
      parsed.data.period,
    );
    if (!saved) return { success: false, error: NOT_FOUND };
    revalidateCustomDashboards(parsed.data.id);
    return { success: true };
  } catch (error) {
    logger.error({ err: error, id: parsed.data.id }, "custom-dashboards: save period failed");
    return { success: false, error: "Could not save the default period" };
  }
}

export async function deleteCustomDashboardAction(input: unknown): Promise<ActionResult> {
  const session = await requirePermission(CUSTOM_DASHBOARD_MANAGE);
  const parsed = customDashboardIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid dashboard" };

  const removed = await customDashboardService.remove(session.user.tenantId, session.user.id, parsed.data.id);
  if (!removed) return { success: false, error: NOT_FOUND };
  revalidateCustomDashboards();
  return { success: true };
}
