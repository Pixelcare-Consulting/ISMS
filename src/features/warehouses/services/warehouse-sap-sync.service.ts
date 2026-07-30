import { auditService } from "@/features/audit/services/audit.service";
import type {
  SapMasterSyncResult,
  SapMasterSyncSkip,
} from "@/features/sap/schemas/sap-master-sync.schema";
import {
  fetchSapCollection,
  parseSapFlag,
} from "@/features/sap/services/sap-master-data";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { warehouseRepository } from "@/features/warehouses/repositories/warehouse.repository";

/** SAP B1 Service Layer entity holding warehouse master data (OWHS). */
const SAP_WAREHOUSE_ENTITY = "Warehouses";
const SAP_WAREHOUSE_SELECT = "WarehouseCode,WarehouseName,Inactive";

interface SapWarehouseRecord {
  WarehouseCode?: string | null;
  WarehouseName?: string | null;
  Inactive?: boolean | string | null;
}

function readSapRecord(record: SapWarehouseRecord) {
  return {
    code: (record.WarehouseCode ?? "").trim(),
    name: (record.WarehouseName ?? "").trim(),
    isInactive: parseSapFlag(record.Inactive),
  };
}

export const warehouseSapSyncService = {
  /**
   * Pull warehouse master data from SAP and upsert ISMS warehouses matched on code.
   *
   * Only `name` is synced. `isMain` is an ISMS-only concept with no SAP counterpart, so
   * it is never touched — new warehouses land with the schema default (false) and an
   * admin picks the main one. Warehouse locations (bins) are out of scope; SAP models
   * those as `BinLocations`, a separate entity.
   */
  async syncFromSap(tenantId: string, actorUserId: string): Promise<SapMasterSyncResult> {
    const creds = await sapServiceLayerService.getCredentials(tenantId);
    if (!creds) {
      throw new Error(
        "No active SAP Service Layer connection. Enable one under Settings → SAP Integration → Service Layer.",
      );
    }

    const records = await fetchSapCollection<SapWarehouseRecord>(creds, {
      entity: SAP_WAREHOUSE_ENTITY,
      select: SAP_WAREHOUSE_SELECT,
    });
    const existing = await warehouseRepository.listSapSyncSnapshot(tenantId);
    const byCode = new Map(existing.map((warehouse) => [warehouse.code, warehouse]));

    const skipped: SapMasterSyncSkip[] = [];
    const toCreate: { code: string; name: string }[] = [];
    const toUpdate: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    let unchanged = 0;

    for (const record of records) {
      const { code, name, isInactive } = readSapRecord(record);

      if (!code) {
        skipped.push({ sapCode: null, name: name || null, reason: "Missing warehouse code" });
        continue;
      }
      if (!name) {
        skipped.push({ sapCode: code, name: null, reason: "Missing warehouse name" });
        continue;
      }
      if (seen.has(code)) {
        skipped.push({ sapCode: code, name, reason: "Duplicate warehouse code in SAP response" });
        continue;
      }

      const match = byCode.get(code);

      // ISMS warehouses have no active/inactive flag, so a SAP-inactive warehouse has
      // nowhere to land. Don't create dead master data — but leave any existing ISMS
      // warehouse alone rather than silently retiring something still in use.
      if (isInactive && !match) {
        skipped.push({ sapCode: code, name, reason: "Inactive in SAP — not imported" });
        continue;
      }

      seen.add(code);

      if (!match) {
        toCreate.push({ code, name });
        continue;
      }
      if (match.name === name) {
        unchanged += 1;
        continue;
      }
      toUpdate.push({ id: match.id, name });
    }

    if (toCreate.length > 0 || toUpdate.length > 0) {
      await warehouseRepository.applySapSync(tenantId, { create: toCreate, update: toUpdate });
    }

    const result: SapMasterSyncResult = {
      fetched: records.length,
      created: toCreate.length,
      updated: toUpdate.length,
      unchanged,
      skipped,
      notInSap: existing.filter((warehouse) => !seen.has(warehouse.code)).length,
    };

    await auditService.log({
      tenantId,
      userId: actorUserId,
      action: "warehouse.sap_sync",
      entityType: "Warehouse",
      metadata: {
        entity: SAP_WAREHOUSE_ENTITY,
        fetched: result.fetched,
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        skipped: result.skipped.length,
        notInSap: result.notInSap,
      },
    });

    return result;
  },
};
