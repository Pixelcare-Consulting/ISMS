import { hasPermission } from "@/lib/auth/permissions";

/**
 * SAP integration / Sync from SAP permission.
 *
 * Seeded on Super Admin, Tenant Admin, and Logistics (see `prisma/seed-data.ts`).
 * Branch operational roles (PS, TL, etc.) do not get this — they can view stock
 * but must not pull master data from SAP.
 */
export const SAP_MANAGE = "sap.manage";

/** True when the user may run one-way SAP → ISMS syncs (UI + server actions). */
export function canSyncFromSap(permissions: string[] | undefined): boolean {
  return hasPermission(permissions, SAP_MANAGE);
}
