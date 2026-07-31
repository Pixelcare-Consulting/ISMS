import { auditService } from "@/features/audit/services/audit.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import {
  ALLOWED_MODEL_SHEET_NAME,
  BRANCH_IMPORT_FIELD_LABELS,
  BRANCH_SHEET_NAME,
  type BranchImportBranchPlan,
  type BranchImportFieldChange,
  type BranchImportPreview,
  type BranchImportResult,
  type BranchImportRowError,
} from "@/features/branches/schemas/branch-import.schema";
import {
  buildTemplateWorkbook,
  readImportWorkbook,
  type SheetRows,
} from "@/features/branches/services/branch-import.workbook";
import { upsertPsgBranches } from "@/features/branches/services/psg-branch-upsert";
import type { PsgBranchRow } from "@/features/branches/services/psg-branch-workbook";
import { prisma } from "@/lib/database/client";

/**
 * Bulk branch import from the two-sheet workbook or a PSG ISMS single sheet.
 *
 * Unknown sap_codes are created; existing ones are updated (name / status / area /
 * quotas). Allowed Models still require existing product models — never auto-created.
 */

const MAX_ROWS = 20_000;
const APPLY_CHUNK_SIZE = 25;

type BranchRecord = Awaited<ReturnType<typeof branchRepository.findManyBySapCodes>>[number];

interface BranchPlanInternal extends BranchImportBranchPlan {
  fields: {
    name?: string;
    status?: "active" | "inactive";
    branchAreaName?: string | null;
    devantQuota?: number | null;
    hisenseQuota?: number | null;
  };
}

interface ImportPlan {
  preview: BranchImportPreview;
  branches: BranchPlanInternal[];
  psgRows: PsgBranchRow[];
}

function lookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function isBlankOrDash(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || trimmed === "-";
}

function parseQuota(raw: string | undefined): number | null {
  if (raw == null || isBlankOrDash(raw)) return null;
  const normalized = raw.replace(/,/g, "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapStatus(raw: string | undefined): "active" | "inactive" | null {
  if (raw == null || !raw.trim()) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "inactive" || normalized === "in-active" || normalized === "disabled") {
    return "inactive";
  }
  if (normalized === "active" || normalized === "enabled") return "active";
  return "active";
}

function resolveHisenseQuota(values: Record<string, string>): number | null {
  const combined = parseQuota(values.hisensequota);
  if (combined != null) return combined;
  const bl = parseQuota(values.hisenseblquota);
  const wl = parseQuota(values.hisensewlquota);
  if (bl != null && wl != null) return bl + wl;
  if (bl != null) return bl;
  if (wl != null) return wl;
  return null;
}

function display(value: string | null | undefined): string {
  return value?.trim() ? value : "—";
}

export const branchImportService = {
  /** Template pre-filled with active branches, so SAP codes always resolve. */
  async buildTemplate(tenantId: string): Promise<Buffer> {
    const branches = await branchRepository.listActiveForTemplate(tenantId);
    return buildTemplateWorkbook(branches);
  },

  /**
   * Parse + validate + diff. Writes nothing; `apply` re-runs this on the same file
   * so the browser never gets to hand us a mutation plan.
   */
  async buildPlan(tenantId: string, file: Buffer): Promise<ImportPlan> {
    const workbook = await readImportWorkbook(file);
    const { branches: branchSheet, allowedModels: allowedSheet, psgStyle } = workbook;

    if (!branchSheet.columns.has("sapcode")) {
      throw new Error(
        `The branches sheet needs a sap_code / BRANCH CODE column. Download the template or upload a PSG ISMS workbook.`,
      );
    }
    if (allowedSheet.present && allowedSheet.rows.length > 0) {
      if (!allowedSheet.columns.has("sapcode") || !allowedSheet.columns.has("skucode")) {
        throw new Error(
          `The "${ALLOWED_MODEL_SHEET_NAME}" sheet needs sap_code and sku_code columns.`,
        );
      }
    }

    const totalRows = branchSheet.rows.length + allowedSheet.rows.length;
    if (totalRows === 0) throw new Error("The file has no data rows.");
    if (totalRows > MAX_ROWS) {
      throw new Error(`The file has ${totalRows} rows; the limit is ${MAX_ROWS}.`);
    }

    const errors: BranchImportRowError[] = [];
    const sheetLabel = psgStyle ? branchSheet.present ? "ISMS" : BRANCH_SHEET_NAME : BRANCH_SHEET_NAME;

    // Last-wins on sap_code within the branch sheet (PSG duplicates).
    const lastBranchRowBySap = new Map<
      string,
      { rowNumber: number; values: Record<string, string> }
    >();
    let skippedEmpty = 0;
    for (const row of branchSheet.rows) {
      const sapCode = row.values.sapcode?.trim() ?? "";
      if (isBlankOrDash(sapCode)) {
        skippedEmpty += 1;
        continue;
      }
      lastBranchRowBySap.set(lookupKey(sapCode), { rowNumber: row.rowNumber, values: row.values });
    }

    const sapCodes = [
      ...new Set([
        ...[...lastBranchRowBySap.values()].map((r) => r.values.sapcode!.trim()),
        ...allowedSheet.rows
          .map((row) => row.values.sapcode?.trim())
          .filter((code): code is string => Boolean(code) && !isBlankOrDash(code)),
      ]),
    ];
    const skuCodes = [
      ...new Set(
        allowedSheet.rows
          .map((row) => row.values.skucode?.trim())
          .filter((code): code is string => Boolean(code)),
      ),
    ];

    const [branches, models] = await Promise.all([
      sapCodes.length
        ? branchRepository.findManyBySapCodes(tenantId, sapCodes)
        : Promise.resolve([]),
      skuCodes.length
        ? branchRepository.findModelsBySkuCodes(tenantId, skuCodes)
        : Promise.resolve([]),
    ]);

    const branchBySapCode = new Map(branches.map((b) => [lookupKey(b.sapCode), b]));
    const modelBySku = new Map(models.map((m) => [lookupKey(m.skuCode), m]));

    const createSapKeys = new Set<string>();
    for (const [key] of lastBranchRowBySap) {
      if (!branchBySapCode.has(key)) createSapKeys.add(key);
    }

    /** Resolve for allowed-models: must exist in DB or be created from branch sheet. */
    function resolveBranchForModels(
      sheet: string,
      row: { rowNumber: number; values: Record<string, string> },
    ): BranchRecord | { sapCode: string; pendingCreate: true } | null {
      const sapCode = row.values.sapcode?.trim() ?? "";
      if (!sapCode || isBlankOrDash(sapCode)) {
        errors.push({ sheet, rowNumber: row.rowNumber, sapCode: "", message: "sap_code is empty." });
        return null;
      }
      const existing = branchBySapCode.get(lookupKey(sapCode));
      if (existing) return existing;
      if (createSapKeys.has(lookupKey(sapCode))) {
        return { sapCode, pendingCreate: true };
      }
      errors.push({
        sheet,
        rowNumber: row.rowNumber,
        sapCode,
        message: `Branch "${sapCode}" does not exist and is not in the Branches sheet to create.`,
      });
      return null;
    }

    // --- Sheet 1: branch creates / updates ------------------------------------
    const planBySap = new Map<string, BranchPlanInternal>();
    const psgRows: PsgBranchRow[] = [];

    for (const [, row] of lastBranchRowBySap) {
      const sapCode = row.values.sapcode!.trim();
      const key = lookupKey(sapCode);
      const existing = branchBySapCode.get(key);
      const nameRaw = row.values.branchname?.trim() ?? "";
      const name = nameRaw || existing?.name || sapCode;
      const status = mapStatus(row.values.status);
      const areaRaw = row.values.area?.trim() ?? "";
      const areaName = isBlankOrDash(areaRaw) ? null : areaRaw || null;
      const devantQuota = parseQuota(row.values.devantquota);
      const hisenseQuota = resolveHisenseQuota(row.values);

      const changes: BranchImportFieldChange[] = [];
      const fields: BranchPlanInternal["fields"] = {};
      const isCreate = !existing;

      if (isCreate) {
        if (!nameRaw && !name) {
          errors.push({
            sheet: sheetLabel,
            rowNumber: row.rowNumber,
            sapCode,
            message: "branch_name is required when creating a new branch.",
          });
          continue;
        }
        fields.name = name;
        if (status) fields.status = status;
        if (areaName) fields.branchAreaName = areaName;
        if (devantQuota != null) fields.devantQuota = devantQuota;
        if (hisenseQuota != null) fields.hisenseQuota = hisenseQuota;
        changes.push({
          field: "name",
          label: BRANCH_IMPORT_FIELD_LABELS.name,
          from: "—",
          to: name,
        });
        if (status) {
          changes.push({
            field: "status",
            label: BRANCH_IMPORT_FIELD_LABELS.status,
            from: "—",
            to: status,
          });
        }
        if (areaName) {
          changes.push({
            field: "area",
            label: BRANCH_IMPORT_FIELD_LABELS.area,
            from: "—",
            to: areaName,
          });
        }
      } else if (existing) {
        if (nameRaw && nameRaw !== existing.name) {
          fields.name = nameRaw;
          changes.push({
            field: "name",
            label: BRANCH_IMPORT_FIELD_LABELS.name,
            from: existing.name,
            to: nameRaw,
          });
        }
        if (status && status !== existing.status) {
          fields.status = status;
          changes.push({
            field: "status",
            label: BRANCH_IMPORT_FIELD_LABELS.status,
            from: existing.status,
            to: status,
          });
        }
        if (areaName) {
          fields.branchAreaName = areaName;
          const fromArea = existing.branchArea?.name ?? null;
          if (fromArea !== areaName) {
            changes.push({
              field: "area",
              label: BRANCH_IMPORT_FIELD_LABELS.area,
              from: display(fromArea),
              to: areaName,
            });
          }
        }
        if (devantQuota != null) {
          fields.devantQuota = devantQuota;
          changes.push({
            field: "devantQuota",
            label: BRANCH_IMPORT_FIELD_LABELS.devantQuota,
            from: "—",
            to: String(devantQuota),
          });
        }
        if (hisenseQuota != null) {
          fields.hisenseQuota = hisenseQuota;
          changes.push({
            field: "hisenseQuota",
            label: BRANCH_IMPORT_FIELD_LABELS.hisenseQuota,
            from: "—",
            to: String(hisenseQuota),
          });
        }
      }

      // Always feed the shared upsert path (creates + area/status/quotas; preserves dealer/geo).
      psgRows.push({
        name: fields.name ?? name,
        sapCode,
        areaName: fields.branchAreaName ?? areaName,
        status: fields.status ?? status ?? existing?.status ?? "active",
        devantQuota: fields.devantQuota ?? null,
        hisenseQuota: fields.hisenseQuota ?? null,
        sourceRowNumber: row.rowNumber,
      });

      planBySap.set(key, {
        branchId: existing?.id ?? "",
        sapCode,
        name: fields.name ?? existing?.name ?? name,
        isCreate,
        changes,
        fields,
        allowedModelsToAdd: [],
        allowedModelsAlreadyPresent: 0,
      });
    }

    // --- Sheet 2: allowed models ----------------------------------------------
    const modelsBySap = new Map<
      string,
      Map<string, { modelId: string; skuCode: string; name: string }>
    >();

    for (const row of allowedSheet.rows) {
      const resolved = resolveBranchForModels(ALLOWED_MODEL_SHEET_NAME, row);
      if (!resolved) continue;

      const sapCode = "pendingCreate" in resolved ? resolved.sapCode : resolved.sapCode;
      const skuCode = row.values.skucode?.trim() ?? "";
      if (!skuCode) {
        errors.push({
          sheet: ALLOWED_MODEL_SHEET_NAME,
          rowNumber: row.rowNumber,
          sapCode,
          message: "sku_code is empty.",
        });
        continue;
      }

      const model = modelBySku.get(lookupKey(skuCode));
      if (!model) {
        errors.push({
          sheet: ALLOWED_MODEL_SHEET_NAME,
          rowNumber: row.rowNumber,
          sapCode,
          message: `Model "${skuCode}" does not exist. Please add it in Product models first, then try again.`,
        });
        continue;
      }

      const bucket = modelsBySap.get(lookupKey(sapCode)) ?? new Map();
      bucket.set(model.id, { modelId: model.id, skuCode: model.skuCode, name: model.name });
      modelsBySap.set(lookupKey(sapCode), bucket);
    }

    const existingBranchIds = branches.map((b) => b.id);
    const existingAllowed = existingBranchIds.length
      ? await branchRepository.findAllowedModelsByBranchIds(tenantId, existingBranchIds)
      : [];
    const allowedByBranch = new Map<string, Set<string>>();
    for (const link of existingAllowed) {
      const set = allowedByBranch.get(link.branchId) ?? new Set<string>();
      set.add(link.modelId);
      allowedByBranch.set(link.branchId, set);
    }

    for (const [sapKey, modelMap] of modelsBySap) {
      let entry = planBySap.get(sapKey);
      if (!entry) {
        const existing = branchBySapCode.get(sapKey);
        if (!existing) continue;
        entry = {
          branchId: existing.id,
          sapCode: existing.sapCode,
          name: existing.name,
          isCreate: false,
          changes: [],
          fields: {},
          allowedModelsToAdd: [],
          allowedModelsAlreadyPresent: 0,
        };
        planBySap.set(sapKey, entry);
      }

      const alreadyAllowed = entry.branchId
        ? (allowedByBranch.get(entry.branchId) ?? new Set<string>())
        : new Set<string>();
      const candidates = [...modelMap.values()];
      entry.allowedModelsToAdd = candidates.filter((m) => !alreadyAllowed.has(m.modelId));
      entry.allowedModelsAlreadyPresent = candidates.length - entry.allowedModelsToAdd.length;
    }

    const plan = [...planBySap.values()].filter(
      (entry) =>
        entry.isCreate || entry.changes.length > 0 || entry.allowedModelsToAdd.length > 0,
    );

    const branchCreateCount = plan.filter((entry) => entry.isCreate).length;
    const branchUpdateCount = plan.filter(
      (entry) => !entry.isCreate && entry.changes.length > 0,
    ).length;
    const allowedModelAddCount = plan.reduce(
      (total, entry) => total + entry.allowedModelsToAdd.length,
      0,
    );

    const touchedSaps = new Set(plan.map((entry) => lookupKey(entry.sapCode)));
    const unchangedCount =
      lastBranchRowBySap.size +
      [...modelsBySap.keys()].filter((k) => !lastBranchRowBySap.has(k)).length -
      touchedSaps.size;

    void skippedEmpty;

    return {
      branches: plan,
      psgRows,
      preview: {
        branchRowCount: branchSheet.rows.length,
        allowedModelRowCount: allowedSheet.rows.length,
        branches: plan.map((entry) => ({
          branchId: entry.branchId || `new:${entry.sapCode}`,
          sapCode: entry.sapCode,
          name: entry.name,
          isCreate: entry.isCreate,
          changes: entry.changes,
          allowedModelsToAdd: entry.allowedModelsToAdd,
          allowedModelsAlreadyPresent: entry.allowedModelsAlreadyPresent,
        })),
        unchangedCount: Math.max(0, unchangedCount),
        branchCreateCount,
        branchUpdateCount,
        allowedModelAddCount,
        errors,
        canApply: errors.length === 0 && plan.length > 0,
      },
    };
  },

  async apply(input: {
    tenantId: string;
    actorUserId: string;
    file: Buffer;
  }): Promise<BranchImportResult> {
    const { preview, branches, psgRows } = await this.buildPlan(input.tenantId, input.file);

    if (preview.errors.length > 0) {
      throw new Error("Fix the reported rows before importing.");
    }

    // Shared upsert: creates missing sap_codes, updates name/status/area/quotas.
    if (psgRows.length > 0) {
      await upsertPsgBranches(prisma, input.tenantId, psgRows);
    }

    // Re-resolve branch ids for allowed models (after creates).
    const sapCodesNeedingModels = [
      ...new Set(
        branches
          .filter((entry) => entry.allowedModelsToAdd.length > 0)
          .map((entry) => entry.sapCode),
      ),
    ];
    const resolvedBranches = sapCodesNeedingModels.length
      ? await branchRepository.findManyBySapCodes(input.tenantId, sapCodesNeedingModels)
      : [];
    const idBySap = new Map(resolvedBranches.map((b) => [lookupKey(b.sapCode), b.id]));

    for (let i = 0; i < branches.length; i += APPLY_CHUNK_SIZE) {
      const chunk = branches.slice(i, i + APPLY_CHUNK_SIZE);
      await prisma.$transaction(
        chunk.flatMap((entry) => {
          if (entry.allowedModelsToAdd.length === 0) return [];
          const branchId = entry.branchId || idBySap.get(lookupKey(entry.sapCode));
          if (!branchId) return [];
          return [
            prisma.branchAllowedModel.createMany({
              data: entry.allowedModelsToAdd.map((model) => ({
                tenantId: input.tenantId,
                branchId,
                modelId: model.modelId,
              })),
              skipDuplicates: true,
            }),
          ];
        }),
        { timeout: 30_000 },
      );
    }

    for (const entry of branches) {
      const branchId =
        entry.branchId || idBySap.get(lookupKey(entry.sapCode)) || entry.sapCode;
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: entry.isCreate
          ? "branch.created"
          : entry.changes.length > 0
            ? "branch.updated"
            : "branch.allowed_models.added",
        entityType: "Branch",
        entityId: branchId,
        metadata: {
          source: "excel-import",
          sapCode: entry.sapCode,
          isCreate: entry.isCreate,
          changedFields: entry.changes.map((change) => change.field),
          allowedModelsAdded: entry.allowedModelsToAdd.map((model) => model.skuCode),
        },
      });
    }

    await auditService.log({
      tenantId: input.tenantId,
      userId: input.actorUserId,
      action: "branch.imported",
      entityType: "Branch",
      entityId: "bulk",
      metadata: {
        branchRows: preview.branchRowCount,
        allowedModelRows: preview.allowedModelRowCount,
        branchesCreated: preview.branchCreateCount,
        branchesUpdated: preview.branchUpdateCount,
        allowedModelsAdded: preview.allowedModelAddCount,
      },
    });

    return {
      branchesCreated: preview.branchCreateCount,
      branchesUpdated: preview.branchUpdateCount,
      allowedModelsAdded: preview.allowedModelAddCount,
      unchanged: preview.unchangedCount,
    };
  },
};

export type { SheetRows };
