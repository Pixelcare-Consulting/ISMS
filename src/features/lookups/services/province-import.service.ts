import type { LookupRecordStatus } from "@prisma/client";

import { auditService } from "@/features/audit/services/audit.service";
import type { CreateAuditLogInput } from "@/features/audit/repositories/audit-log.repository";
import {
  PROVINCE_IMPORT_MAX_ROWS,
  type ProvinceImportFieldChange,
  type ProvinceImportPreview,
  type ProvinceImportResult,
  type ProvinceImportRowError,
} from "@/features/lookups/schemas/province-import.schema";
import {
  buildProvinceTemplateWorkbook,
  readProvinceImportWorkbook,
  type ProvinceSheetRow,
} from "@/features/lookups/services/province-import.workbook";
import { prisma } from "@/lib/database/client";

const NAME_MAX_LENGTH = 120;
const STATUS_VALUES: readonly LookupRecordStatus[] = ["active", "inactive"];

export interface ExistingProvince {
  id: string;
  name: string;
  regionId: string | null;
  recordStatus: LookupRecordStatus;
}

export interface RegionOption {
  id: string;
  name: string;
}

interface PlannedCreate {
  rowNumber: number;
  name: string;
  regionId: string | null;
  recordStatus: LookupRecordStatus;
}

interface PlannedUpdate {
  rowNumber: number;
  id: string;
  name: string;
  data: { regionId?: string; recordStatus?: LookupRecordStatus };
  changes: ProvinceImportFieldChange[];
}

export interface ProvinceImportPlan {
  preview: ProvinceImportPreview;
  creates: PlannedCreate[];
  updates: PlannedUpdate[];
}

function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

function statusLabel(status: LookupRecordStatus): string {
  return status === "active" ? "Active" : "Inactive";
}

/**
 * Diff the uploaded rows against the tenant's provinces. Pure — the caller loads the
 * data, so preview and apply share one rule set and apply never trusts the browser.
 */
export function planProvinceImport(
  rows: ProvinceSheetRow[],
  existing: ExistingProvince[],
  regions: RegionOption[],
): ProvinceImportPlan {
  const provinceByName = new Map(existing.map((row) => [nameKey(row.name), row]));
  const regionByName = new Map(regions.map((row) => [nameKey(row.name), row]));
  const regionNameById = new Map(regions.map((row) => [row.id, row.name]));
  const seen = new Map<string, number>();

  const errors: ProvinceImportRowError[] = [];
  const creates: PlannedCreate[] = [];
  const updates: PlannedUpdate[] = [];
  let unchangedCount = 0;

  if (rows.length > PROVINCE_IMPORT_MAX_ROWS) {
    errors.push({
      rowNumber: 1,
      province: "—",
      message: `The file has ${rows.length} rows; the limit is ${PROVINCE_IMPORT_MAX_ROWS}.`,
    });
  }

  for (const { rowNumber, values } of rows) {
    const name = (values.name ?? "").trim();
    const regionText = (values.region ?? "").trim();
    const statusText = (values.status ?? "").trim().toLowerCase();
    const rowErrors: string[] = [];

    if (!name) rowErrors.push("Province name is required.");
    if (name.length > NAME_MAX_LENGTH) {
      rowErrors.push(`Province name is longer than ${NAME_MAX_LENGTH} characters.`);
    }

    const firstRow = name ? seen.get(nameKey(name)) : undefined;
    if (firstRow !== undefined) {
      rowErrors.push(`Duplicate of row ${firstRow}.`);
    } else if (name) {
      seen.set(nameKey(name), rowNumber);
    }

    const region = regionText ? regionByName.get(nameKey(regionText)) : undefined;
    if (regionText && !region) {
      rowErrors.push(`Region "${regionText}" was not found or is inactive.`);
    }

    const status = statusText as LookupRecordStatus;
    if (statusText && !STATUS_VALUES.includes(status)) {
      rowErrors.push(`Status must be active or inactive, not "${values.status}".`);
    }

    if (rowErrors.length > 0) {
      for (const message of rowErrors) {
        errors.push({ rowNumber, province: name || "—", message });
      }
      continue;
    }

    const match = provinceByName.get(nameKey(name));
    if (!match) {
      creates.push({
        rowNumber,
        name,
        regionId: region?.id ?? null,
        recordStatus: statusText ? status : "active",
      });
      continue;
    }

    const data: PlannedUpdate["data"] = {};
    const changes: ProvinceImportFieldChange[] = [];
    if (region && region.id !== match.regionId) {
      data.regionId = region.id;
      changes.push({
        label: "Region",
        from: (match.regionId && regionNameById.get(match.regionId)) || "—",
        to: region.name,
      });
    }
    if (statusText && status !== match.recordStatus) {
      data.recordStatus = status;
      changes.push({
        label: "Status",
        from: statusLabel(match.recordStatus),
        to: statusLabel(status),
      });
    }

    if (changes.length === 0) {
      unchangedCount += 1;
      continue;
    }
    updates.push({ rowNumber, id: match.id, name: match.name, data, changes });
  }

  const regionNameOf = (id: string | null) => (id ? regionNameById.get(id) ?? "—" : "—");

  return {
    creates,
    updates,
    preview: {
      rowCount: rows.length,
      createCount: creates.length,
      updateCount: updates.length,
      unchangedCount,
      rows: [
        ...creates.map((row) => ({
          rowNumber: row.rowNumber,
          name: row.name,
          action: "create" as const,
          changes: [
            { label: "Region", from: "—", to: regionNameOf(row.regionId) },
            { label: "Status", from: "—", to: statusLabel(row.recordStatus) },
          ],
        })),
        ...updates.map((row) => ({
          rowNumber: row.rowNumber,
          name: row.name,
          action: "update" as const,
          changes: row.changes,
        })),
      ].sort((a, b) => a.rowNumber - b.rowNumber),
      errors,
      canApply: errors.length === 0 && creates.length + updates.length > 0,
    },
  };
}

async function loadPlan(tenantId: string, file: Buffer): Promise<ProvinceImportPlan> {
  const rows = await readProvinceImportWorkbook(file);
  const [existing, regions] = await Promise.all([
    prisma.province.findMany({
      where: { tenantId },
      select: { id: true, name: true, regionId: true, recordStatus: true },
    }),
    prisma.region.findMany({
      where: { tenantId, recordStatus: "active" },
      select: { id: true, name: true },
    }),
  ]);
  return planProvinceImport(rows, existing, regions);
}

export const provinceImportService = {
  async buildTemplate(tenantId: string): Promise<Buffer> {
    const provinces = await prisma.province.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { name: true, recordStatus: true, region: { select: { name: true } } },
    });
    return buildProvinceTemplateWorkbook(
      provinces.map((row) => ({
        name: row.name,
        region: row.region?.name ?? "",
        status: row.recordStatus,
      })),
    );
  },

  async preview(tenantId: string, file: Buffer): Promise<ProvinceImportPreview> {
    return (await loadPlan(tenantId, file)).preview;
  },

  /** Re-plans from the file and writes in one transaction: all rows land or none do. */
  async apply(input: {
    tenantId: string;
    actorUserId: string;
    file: Buffer;
  }): Promise<ProvinceImportResult> {
    const { tenantId, actorUserId, file } = input;
    const plan = await loadPlan(tenantId, file);
    if (plan.preview.errors.length > 0) {
      throw new Error("The file has problems. Upload it again to see them.");
    }

    const auditRows: CreateAuditLogInput[] = [];
    try {
      await prisma.$transaction(async (tx) => {
        for (const row of plan.creates) {
          const created = await tx.province.create({
            data: {
              tenantId,
              name: row.name,
              regionId: row.regionId,
              recordStatus: row.recordStatus,
            },
            select: { id: true },
          });
          auditRows.push({
            tenantId,
            userId: actorUserId,
            action: "province.created",
            entityType: "Province",
            entityId: created.id,
            metadata: { name: row.name, source: "province-import" },
          });
        }
        for (const row of plan.updates) {
          await tx.province.update({ where: { id: row.id, tenantId }, data: row.data });
          auditRows.push({
            tenantId,
            userId: actorUserId,
            action: "province.updated",
            entityType: "Province",
            entityId: row.id,
            metadata: {
              name: row.name,
              changes: row.changes.map((change) => ({ ...change })),
              source: "province-import",
            },
          });
        }
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        throw new Error(
          "A province in the file was added by someone else in the meantime. Upload the file again.",
        );
      }
      throw error;
    }

    if (auditRows.length > 0) await auditService.logMany(auditRows);

    return {
      created: plan.creates.length,
      updated: plan.updates.length,
      unchanged: plan.preview.unchangedCount,
    };
  },
};
