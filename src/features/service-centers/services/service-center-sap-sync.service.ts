import { sapText } from "@/features/sap/services/sap-master-data";
import { runSapSync } from "@/features/sap/services/sap-sync-engine";
import { serviceCenterRepository } from "@/features/service-centers/repositories/service-center.repository";
import type { SapSyncEntity } from "@/features/sap/types/sap-sync-entity";
import type { SapSyncResult } from "@/features/sap/schemas/sap-master-sync.schema";

/**
 * Cost centre master data (OPRC, Service Layer `ProfitCenters`) on dimension 5 → ISMS
 * service centres, matched on `sapCode`.
 *
 * SAP keeps every cost centre in one master and tells them apart by which of its five
 * cost-accounting dimensions each belongs to (`InWhichDimension`); the company reserves
 * dimension 5 for its service centres. Filtered server-side on that dimension so the
 * split happens in SAP and a cost centre on any other dimension is never fetched.
 * Inactive cost centres are excluded the same way, so one SAP closes out simply stops
 * coming back from the sync.
 *
 * Syncs `name` only. Area, dealer type, dealer area and mode of payment are ISMS-only
 * classifications with no SAP counterpart, so a service centre created here lands with
 * them unset and a later sync never touches them. Status is ISMS-managed too: a new row
 * lands `active`, and updates leave status alone rather than reviving something an admin
 * deactivated on purpose. Locations are ISMS-only as well.
 *
 * Field names confirmed against the live company database (`GET /ProfitCenters`):
 * `CenterCode`, `CenterName`, `InWhichDimension` (integer) and `Active` (`tYES`/`tNO`).
 */

/** The cost-accounting dimension SAP files service centres under. */
export const SAP_SERVICE_CENTER_DIMENSION = 5;

interface ServiceCenterRecord {
  sapCode: string;
  name: string;
}

export const serviceCenterSyncEntity: SapSyncEntity<ServiceCenterRecord> = {
  key: "service-center",
  noun: { one: "service centre", many: "service centres" },

  entity: "ProfitCenters",
  select: "CenterCode,CenterName",
  filter: `InWhichDimension eq ${SAP_SERVICE_CENTER_DIMENSION} and Active eq 'tYES'`,
  keyField: "CenterCode",
  keyKind: "string",

  audit: { action: "service_center.sap_sync", entityType: "ServiceCenter" },

  parse(row) {
    const sapCode = sapText(row.CenterCode);
    if (!sapCode) return { skip: "SAP cost centre has no code" };

    const name = sapText(row.CenterName);
    if (!name) return { skip: "SAP cost centre has no name", example: sapCode };

    return { record: { sapCode, name } };
  },

  applyPage(tenantId, records) {
    return serviceCenterRepository.applySapSyncPage(tenantId, records);
  },
};

export const serviceCenterSapSyncService = {
  /** Pull SAP cost centres on dimension 5 and upsert ISMS service centres. */
  syncFromSap(
    tenantId: string,
    actorUserId: string | null,
    options?: { budgetMs?: number },
  ): Promise<SapSyncResult> {
    return runSapSync(tenantId, serviceCenterSyncEntity, actorUserId, options);
  },
};
