import { auditService } from "@/features/audit/services/audit.service";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import {
  ALLOWED_MODEL_SHEET_NAME,
  BRANCH_IMPORT_FIELD_LABELS,
  BRANCH_SHEET_NAME,
  type BranchImportBranchPlan,
  type BranchImportPreview,
  type BranchImportResult,
  type BranchImportRowError,
} from "@/features/branches/schemas/branch-import.schema";
import {
  buildTemplateWorkbook,
  readImportWorkbook,
  type SheetRows,
} from "@/features/branches/services/branch-import.workbook";
import { prisma } from "@/lib/database/client";

/**
 * Bulk branch import from the two-sheet workbook.
 *
 * Update-only by design: branches and product models referenced by the file must
 * already exist — anything missing is a row error, never a silent create. The only
 * records the import adds are `BranchAllowedModel` links, and nothing is deleted.
 */

const MAX_ROWS = 20_000;
const APPLY_CHUNK_SIZE = 25;

type BranchRecord = Awaited<ReturnType<typeof branchRepository.findManyBySapCodes>>[number];

interface BranchPlanInternal extends BranchImportBranchPlan {
  /** Prisma update payload; empty when only allowed models changed. */
  fields: { name?: string };
}

interface ImportPlan {
  preview: BranchImportPreview;
  branches: BranchPlanInternal[];
}

function lookupKey(value: string): string {
  return value.trim().toLowerCase();
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
    const { branches: branchSheet, allowedModels: allowedSheet } = workbook;

    if (!branchSheet.columns.has("sapcode")) {
      throw new Error(
        `The "${BRANCH_SHEET_NAME}" sheet needs a sap_code column. Download the template to start from the right layout.`,
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

    const sapCodes = [
      ...new Set(
        [...branchSheet.rows, ...allowedSheet.rows]
          .map((row) => row.values.sapcode?.trim())
          .filter((code): code is string => Boolean(code)),
      ),
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

    /** Resolve a sheet's sap_code cell, recording an error when it doesn't match. */
    function resolveBranch(
      sheet: string,
      row: { rowNumber: number; values: Record<string, string> },
    ): BranchRecord | null {
      const sapCode = row.values.sapcode?.trim() ?? "";
      if (!sapCode) {
        errors.push({ sheet, rowNumber: row.rowNumber, sapCode: "", message: "sap_code is empty." });
        return null;
      }
      const branch = branchBySapCode.get(lookupKey(sapCode));
      if (!branch) {
        errors.push({
          sheet,
          rowNumber: row.rowNumber,
          sapCode,
          message: `Branch "${sapCode}" does not exist. Please add it in Branches first, then try again.`,
        });
        return null;
      }
      return branch;
    }

    // --- Sheet 1: branch names -------------------------------------------------
    const nameByBranchId = new Map<string, { name: string; rowNumber: number }>();

    for (const row of branchSheet.rows) {
      const branch = resolveBranch(BRANCH_SHEET_NAME, row);
      if (!branch) continue;

      const name = row.values.branchname?.trim() ?? "";
      if (!name) continue; // Blank means "leave it alone" — never blank out a name.

      const seen = nameByBranchId.get(branch.id);
      if (seen && seen.name !== name) {
        errors.push({
          sheet: BRANCH_SHEET_NAME,
          rowNumber: row.rowNumber,
          sapCode: branch.sapCode,
          message: `Conflicting name for branch "${branch.sapCode}" (row ${seen.rowNumber} says "${seen.name}", this row says "${name}").`,
        });
        continue;
      }
      if (!seen) nameByBranchId.set(branch.id, { name, rowNumber: row.rowNumber });
    }

    // --- Sheet 2: allowed models ----------------------------------------------
    const modelsByBranchId = new Map<
      string,
      Map<string, { modelId: string; skuCode: string; name: string }>
    >();

    for (const row of allowedSheet.rows) {
      const branch = resolveBranch(ALLOWED_MODEL_SHEET_NAME, row);
      if (!branch) continue;

      const skuCode = row.values.skucode?.trim() ?? "";
      if (!skuCode) {
        errors.push({
          sheet: ALLOWED_MODEL_SHEET_NAME,
          rowNumber: row.rowNumber,
          sapCode: branch.sapCode,
          message: "sku_code is empty.",
        });
        continue;
      }

      const model = modelBySku.get(lookupKey(skuCode));
      if (!model) {
        errors.push({
          sheet: ALLOWED_MODEL_SHEET_NAME,
          rowNumber: row.rowNumber,
          sapCode: branch.sapCode,
          message: `Model "${skuCode}" does not exist. Please add it in Product models first, then try again.`,
        });
        continue;
      }

      const bucket = modelsByBranchId.get(branch.id) ?? new Map();
      bucket.set(model.id, { modelId: model.id, skuCode: model.skuCode, name: model.name });
      modelsByBranchId.set(branch.id, bucket);
    }

    // --- Diff against what is already stored -----------------------------------
    const touchedBranchIds = [
      ...new Set([...nameByBranchId.keys(), ...modelsByBranchId.keys()]),
    ];
    const existingAllowed = touchedBranchIds.length
      ? await branchRepository.findAllowedModelsByBranchIds(tenantId, touchedBranchIds)
      : [];
    const allowedByBranch = new Map<string, Set<string>>();
    for (const link of existingAllowed) {
      const set = allowedByBranch.get(link.branchId) ?? new Set<string>();
      set.add(link.modelId);
      allowedByBranch.set(link.branchId, set);
    }

    const branchById = new Map(branches.map((b) => [b.id, b]));
    const plan: BranchPlanInternal[] = [];

    for (const branchId of touchedBranchIds) {
      const branch = branchById.get(branchId);
      if (!branch) continue;

      const fields: { name?: string } = {};
      const changes = [];
      const nextName = nameByBranchId.get(branchId)?.name;
      if (nextName && nextName !== branch.name) {
        fields.name = nextName;
        changes.push({
          field: "name",
          label: BRANCH_IMPORT_FIELD_LABELS.name,
          from: branch.name,
          to: nextName,
        });
      }

      const alreadyAllowed = allowedByBranch.get(branchId) ?? new Set<string>();
      const candidates = [...(modelsByBranchId.get(branchId)?.values() ?? [])];
      const allowedModelsToAdd = candidates.filter((m) => !alreadyAllowed.has(m.modelId));

      if (changes.length === 0 && allowedModelsToAdd.length === 0) continue;

      plan.push({
        branchId,
        sapCode: branch.sapCode,
        name: branch.name,
        changes,
        fields,
        allowedModelsToAdd,
        allowedModelsAlreadyPresent: candidates.length - allowedModelsToAdd.length,
      });
    }

    const branchUpdateCount = plan.filter((entry) => entry.changes.length > 0).length;
    const allowedModelAddCount = plan.reduce(
      (total, entry) => total + entry.allowedModelsToAdd.length,
      0,
    );
    const touched = new Set(plan.map((entry) => entry.branchId));
    const unchangedCount = touchedBranchIds.filter((id) => !touched.has(id)).length;

    return {
      branches: plan,
      preview: {
        branchRowCount: branchSheet.rows.length,
        allowedModelRowCount: allowedSheet.rows.length,
        branches: plan.map((entry) => ({
          branchId: entry.branchId,
          sapCode: entry.sapCode,
          name: entry.name,
          changes: entry.changes,
          allowedModelsToAdd: entry.allowedModelsToAdd,
          allowedModelsAlreadyPresent: entry.allowedModelsAlreadyPresent,
        })),
        unchangedCount,
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
    const { preview, branches } = await this.buildPlan(input.tenantId, input.file);

    if (preview.errors.length > 0) {
      throw new Error("Fix the reported rows before importing.");
    }

    for (let i = 0; i < branches.length; i += APPLY_CHUNK_SIZE) {
      const chunk = branches.slice(i, i + APPLY_CHUNK_SIZE);
      await prisma.$transaction(
        chunk.flatMap((entry) => {
          const operations = [];

          if (entry.changes.length > 0) {
            operations.push(
              prisma.branch.update({
                where: { id: entry.branchId, tenantId: input.tenantId },
                data: entry.fields,
              }),
            );
          }

          if (entry.allowedModelsToAdd.length > 0) {
            operations.push(
              prisma.branchAllowedModel.createMany({
                data: entry.allowedModelsToAdd.map((model) => ({
                  tenantId: input.tenantId,
                  branchId: entry.branchId,
                  modelId: model.modelId,
                })),
                skipDuplicates: true,
              }),
            );
          }

          return operations;
        }),
        { timeout: 30_000 },
      );
    }

    for (const entry of branches) {
      await auditService.log({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: entry.changes.length > 0 ? "branch.updated" : "branch.allowed_models.added",
        entityType: "Branch",
        entityId: entry.branchId,
        metadata: {
          source: "excel-import",
          sapCode: entry.sapCode,
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
        branchesUpdated: preview.branchUpdateCount,
        allowedModelsAdded: preview.allowedModelAddCount,
      },
    });

    return {
      branchesUpdated: preview.branchUpdateCount,
      allowedModelsAdded: preview.allowedModelAddCount,
      unchanged: preview.unchangedCount,
    };
  },
};

export type { SheetRows };
