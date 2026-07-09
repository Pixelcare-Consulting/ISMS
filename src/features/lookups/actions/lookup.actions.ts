"use server";

import { revalidatePath } from "next/cache";

import {
  isLookupEntityKey,
  lookupEntityRoute,
  type LookupEntityKey,
} from "@/features/lookups/constants/lookup-registry";
import { lookupService } from "@/features/lookups/services/lookup.service";
import { requirePermission } from "@/lib/auth/permissions";

export async function listLookupsAction(entity: LookupEntityKey) {
  const session = await requirePermission("master_data.manage");
  if (!isLookupEntityKey(entity)) {
    throw new Error("Unknown lookup type");
  }
  return lookupService.list(entity, session.user.tenantId);
}

export async function listLookupParentOptionsAction(entity: LookupEntityKey) {
  const session = await requirePermission("master_data.manage");
  if (!isLookupEntityKey(entity)) {
    throw new Error("Unknown lookup type");
  }
  return lookupService.listParentOptions(entity, session.user.tenantId);
}

export async function createLookupAction(entity: LookupEntityKey, input: unknown) {
  const session = await requirePermission("master_data.manage");
  if (!isLookupEntityKey(entity)) return { error: "Unknown lookup type" };
  try {
    const row = await lookupService.create(
      entity,
      { tenantId: session.user.tenantId, actorUserId: session.user.id },
      input,
    );
    revalidatePath(lookupEntityRoute(entity));
    return { success: true as const, row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create record" };
  }
}

export async function updateLookupAction(
  entity: LookupEntityKey,
  id: string,
  input: unknown,
) {
  const session = await requirePermission("master_data.manage");
  if (!isLookupEntityKey(entity)) return { error: "Unknown lookup type" };
  try {
    const row = await lookupService.update(
      entity,
      { tenantId: session.user.tenantId, actorUserId: session.user.id },
      id,
      input,
    );
    revalidatePath(lookupEntityRoute(entity));
    return { success: true as const, row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update record" };
  }
}

export async function setLookupStatusAction(
  entity: LookupEntityKey,
  id: string,
  input: unknown,
) {
  const session = await requirePermission("master_data.manage");
  if (!isLookupEntityKey(entity)) return { error: "Unknown lookup type" };
  try {
    const row = await lookupService.setStatus(
      entity,
      { tenantId: session.user.tenantId, actorUserId: session.user.id },
      id,
      input,
    );
    revalidatePath(lookupEntityRoute(entity));
    return { success: true as const, row };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update status" };
  }
}
