"use server";

import { revalidatePath } from "next/cache";

import type { LookupRecordStatus } from "@prisma/client";

import { serialNumberService } from "@/features/serial-numbers/services/serial-number.service";
import { requirePermission } from "@/lib/auth/permissions";

const SERIAL_NUMBERS_ROUTE = "/inventory/serial-numbers";

export async function listSerialNumbersAction(params: {
  page?: number;
  q?: string;
  status?: LookupRecordStatus;
}) {
  const session = await requirePermission("inventory.view");
  return serialNumberService.list(
    session.user.tenantId,
    { page: params.page, limit: 10 },
    { q: params.q, status: params.status },
  );
}

export async function getSerialNumberKpisAction() {
  const session = await requirePermission("inventory.view");
  return serialNumberService.getKpis(session.user.tenantId);
}

export async function listSerialModelOptionsAction() {
  const session = await requirePermission("inventory.manage");
  return serialNumberService.listModelOptions(session.user.tenantId);
}

export async function getSerialTraceabilityAction(id: string) {
  const session = await requirePermission("inventory.view");
  return serialNumberService.getTraceability(session.user.tenantId, id);
}

export async function createSerialNumberAction(input: unknown) {
  const session = await requirePermission("inventory.manage");
  try {
    const row = await serialNumberService.create(
      { tenantId: session.user.tenantId, actorUserId: session.user.id },
      input,
    );
    revalidatePath(SERIAL_NUMBERS_ROUTE);
    return { success: true as const, row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create serial number" };
  }
}

export async function updateSerialNumberAction(id: string, input: unknown) {
  const session = await requirePermission("inventory.manage");
  try {
    const row = await serialNumberService.update(
      { tenantId: session.user.tenantId, actorUserId: session.user.id },
      id,
      input,
    );
    revalidatePath(SERIAL_NUMBERS_ROUTE);
    return { success: true as const, row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update serial number" };
  }
}

export async function setSerialNumberStatusAction(id: string, input: unknown) {
  const session = await requirePermission("inventory.manage");
  try {
    const row = await serialNumberService.setStatus(
      { tenantId: session.user.tenantId, actorUserId: session.user.id },
      id,
      input,
    );
    revalidatePath(SERIAL_NUMBERS_ROUTE);
    return { success: true as const, row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update status" };
  }
}
