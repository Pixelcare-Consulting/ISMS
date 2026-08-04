"use server";

import { revalidatePath } from "next/cache";

import type { LookupRecordStatus } from "@prisma/client";

import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { serialNumberService } from "@/features/serial-numbers/services/serial-number.service";
import type {
  SerialNumberListSort,
  SerialNumberListSortDir,
} from "@/features/serial-numbers/repositories/serial-number.repository";
import { requirePermission } from "@/lib/auth/permissions";

const SERIAL_NUMBERS_ROUTE = "/inventory/serial-numbers";

const SERIAL_NUMBER_SORT_FIELDS = new Set<SerialNumberListSort>([
  "serialNo",
  "model",
  "recordStatus",
]);

function parseSerialNumberSort(value?: string): SerialNumberListSort | undefined {
  if (value && SERIAL_NUMBER_SORT_FIELDS.has(value as SerialNumberListSort)) {
    return value as SerialNumberListSort;
  }
  return undefined;
}

function parseSerialNumberSortDir(value?: string): SerialNumberListSortDir | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export async function listSerialNumbersAction(params: {
  page?: number;
  limit?: number;
  q?: string;
  status?: LookupRecordStatus;
  sort?: string;
  sortDir?: string;
}) {
  const session = await requirePermission("inventory.view");
  const limit = parseTablePageSize(params.limit);
  return serialNumberService.list(
    session.user.tenantId,
    { page: params.page, limit },
    { q: params.q, status: params.status },
    { field: parseSerialNumberSort(params.sort), dir: parseSerialNumberSortDir(params.sortDir) },
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
