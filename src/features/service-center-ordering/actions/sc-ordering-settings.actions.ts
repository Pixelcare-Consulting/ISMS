"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  SAP_CODE_MAX,
  SC_ORDERING_SETTINGS_PATH,
} from "@/features/service-center-ordering/constants";
import { listSapProjects } from "@/features/service-center-ordering/services/sc-ordering-sap";
import { scOrderingSettingsService } from "@/features/service-center-ordering/services/sc-ordering-settings.service";
import { SC_ORDERS_CREATE } from "@/features/service-center-ops/constants/sc-permissions";
import { requirePermission } from "@/lib/auth/permissions";

const SETTINGS_PERMISSION = "ordering_settings.manage";

/** A SAP code: trimmed, upper-case as SAP stores them, blank → null. */
const optionalCode = z
  .string()
  .trim()
  .max(SAP_CODE_MAX)
  .transform((value) => (value ? value.toUpperCase() : null));

const defaultsSchema = z.object({
  warehouseCode: optionalCode,
  branchCode: optionalCode,
  departmentCode: optionalCode,
  cogsBranchCode: optionalCode,
});

const cardCodeSchema = z
  .string()
  .trim()
  .min(1, "Enter a customer code")
  .max(SAP_CODE_MAX)
  .transform((value) => value.toUpperCase());

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function updateScOrderingDefaultsAction(input: unknown) {
  const session = await requirePermission(SETTINGS_PERMISSION);
  const parsed = defaultsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  try {
    await scOrderingSettingsService.updateDefaults(
      session.user.tenantId,
      session.user.id,
      parsed.data,
    );
    revalidatePath(SC_ORDERING_SETTINGS_PATH);
    return { success: true as const };
  } catch (e) {
    return { error: errorMessage(e, "Failed to save the defaults") };
  }
}

export async function addScOrderingCustomerAction(input: unknown) {
  const session = await requirePermission(SETTINGS_PERMISSION);
  const parsed = cardCodeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid code" };
  try {
    await scOrderingSettingsService.addCustomer(session.user.tenantId, session.user.id, parsed.data);
    revalidatePath(SC_ORDERING_SETTINGS_PATH);
    return { success: true as const };
  } catch (e) {
    return { error: errorMessage(e, "Failed to add the customer") };
  }
}

export async function setPrimaryScOrderingCustomerAction(id: string) {
  const session = await requirePermission(SETTINGS_PERMISSION);
  try {
    await scOrderingSettingsService.setPrimaryCustomer(session.user.tenantId, session.user.id, id);
    revalidatePath(SC_ORDERING_SETTINGS_PATH);
    return { success: true as const };
  } catch (e) {
    return { error: errorMessage(e, "Failed to set the primary customer") };
  }
}

export async function removeScOrderingCustomerAction(id: string) {
  const session = await requirePermission(SETTINGS_PERMISSION);
  try {
    await scOrderingSettingsService.removeCustomer(session.user.tenantId, session.user.id, id);
    revalidatePath(SC_ORDERING_SETTINGS_PATH);
    return { success: true as const };
  } catch (e) {
    return { error: errorMessage(e, "Failed to remove the customer") };
  }
}

/** Customers and defaults for the service-center order form. */
export async function getScOrderSetupAction() {
  const session = await requirePermission(SC_ORDERS_CREATE);
  return scOrderingSettingsService.get(session.user.tenantId);
}

export async function listSapProjectsForScOrderAction() {
  const session = await requirePermission(SC_ORDERS_CREATE);
  try {
    return { success: true as const, data: await listSapProjects(session.user.tenantId) };
  } catch (e) {
    return { error: errorMessage(e, "Failed to load SAP projects") };
  }
}
