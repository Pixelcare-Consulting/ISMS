import { auditService } from "@/features/audit/services/audit.service";
import type { BranchScheduleInput } from "@/features/branches/repositories/branch.repository";
import { branchRepository } from "@/features/branches/repositories/branch.repository";
import {
  ALLOWED_MODEL_SHEET_NAME,
  BRANCH_IMPORT_FIELD_LABELS,
  BRANCH_SHEET_NAME,
  type BranchImportBranchPlan,
  type BranchImportChunkPhase,
  type BranchImportChunkProgress,
  type BranchImportFieldChange,
  type BranchImportPreview,
  type BranchImportResult,
  type BranchImportRowError,
} from "@/features/branches/schemas/branch-import.schema";
import {
  buildTemplateWorkbook,
  formatWeekdayListForTemplate,
  readImportWorkbook,
  type SheetRows,
} from "@/features/branches/services/branch-import.workbook";
import {
  getCachedPlan,
  planKeyFor,
  setCachedPlan,
} from "@/features/branches/services/branch-import.plan-cache";
import { upsertPsgBranches } from "@/features/branches/services/psg-branch-upsert";
import type { PsgBranchRow } from "@/features/branches/services/psg-branch-workbook";
import {
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
} from "@/features/orders/utils/order-window";
import { prisma } from "@/lib/database/client";
import { mapWithConcurrency } from "@/lib/shared/concurrency";

/**
 * Bulk branch import from the Branches workbook (or a PSG ISMS single sheet).
 *
 * Unknown sap_codes are created; existing ones are updated. Optional legacy
 * Allowed Models sheet still requires existing product models — never auto-created.
 */

const MAX_ROWS = 20_000;
/**
 * Chunk sizes are per HTTP round trip, not per query. Both phases now issue a fixed
 * handful of set-based queries per chunk regardless of size, so these are tuned for
 * responsive progress reporting and a safe request duration — not to limit fan-out.
 */
const CORE_CHUNK_SIZE = 250;
const ENRICH_CHUNK_SIZE = 150;
/** Independent per-row updates run in parallel; keep it modest so the pool holds up. */
const WRITE_CONCURRENCY = 8;

type BranchRecord = Awaited<ReturnType<typeof branchRepository.findManyBySapCodes>>[number];

interface BranchPlanInternal extends BranchImportBranchPlan {
  fields: {
    name?: string;
    status?: "active" | "inactive";
    branchAreaName?: string | null;
    dealerId?: string | null;
    primaryWarehouseId?: string | null;
    areaId?: string | null;
    regionId?: string | null;
    provinceId?: string | null;
    /** Present when alternate_branches cell was non-blank. */
    alternateSapCodes?: string[];
    schedule?: BranchScheduleInput;
    devantQuota?: number | null;
    hisenseQuota?: number | null;
  };
}

interface ImportPlan {
  preview: BranchImportPreview;
  /** Filtered preview/apply list (rows with something to do). */
  branches: BranchPlanInternal[];
  /** Full sap → plan map (includes unchanged rows) for stable enrich walks. */
  entryBySap: Map<string, BranchPlanInternal>;
  /** Stable enrich order: PSG sheet SAPs first, then models-only SAPs. */
  enrichKeys: string[];
  psgRows: PsgBranchRow[];
  /** Lowercased BranchArea name → id, resolved during the plan so enrich can reuse it. */
  branchAreaIdByName: Map<string, string>;
}

function lookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function isBlankOrDash(value: string | undefined | null): boolean {
  if (value == null) return true;
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

function splitList(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "-");
}

function parseWeekdays(raw: string | undefined): { days: number[] } | { error: string } | null {
  if (raw == null || isBlankOrDash(raw)) return null;
  const parts = splitList(raw);
  if (parts.length === 0) return null;
  const days: number[] = [];
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const n = Number.parseInt(part, 10);
      if (n < 0 || n > 6) {
        return { error: `Invalid weekday "${part}" (use 0–6 or Mon–Sun).` };
      }
      days.push(n);
      continue;
    }
    const lower = part.toLowerCase();
    const shortIdx = WEEKDAY_SHORT.findIndex(
      (label) => label.toLowerCase() === lower || label.toLowerCase() === lower.slice(0, 3),
    );
    const fullIdx = WEEKDAY_LABELS.findIndex(
      (label) => label.toLowerCase() === lower || label.toLowerCase().startsWith(lower),
    );
    const idx = shortIdx >= 0 ? shortIdx : fullIdx;
    if (idx < 0) {
      return { error: `Invalid weekday "${part}" (use 0–6 or Mon–Sun).` };
    }
    days.push(idx);
  }
  return { days: [...new Set(days)].sort((a, b) => a - b) };
}

function sameDayList(a: number[] | undefined | null, b: number[]): boolean {
  const left = [...(a ?? [])].sort((x, y) => x - y);
  if (left.length !== b.length) return false;
  return left.every((value, index) => value === b[index]);
}

function sameSapList(a: string[], b: string[]): boolean {
  const left = a.map(lookupKey).sort();
  const right = b.map(lookupKey).sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function pushChange(
  changes: BranchImportFieldChange[],
  field: string,
  from: string,
  to: string,
) {
  if (from === to) return;
  changes.push({
    field,
    label: BRANCH_IMPORT_FIELD_LABELS[field] ?? field,
    from,
    to,
  });
}

type Lookupable = { id: string; name: string; code?: string | null; sapCode?: string | null };

/**
 * Index a master-data table by every key a sheet cell may spell it with (name, code,
 * sap code). Built once per plan instead of scanning the array per row per column —
 * the linear scan made resolution O(rows x columns x table size).
 *
 * First writer wins so the behaviour matches the old `Array.find` (earliest match).
 */
function indexByCodeOrName<T extends Lookupable>(items: T[]): Map<string, T> {
  const index = new Map<string, T>();
  const put = (raw: string | null | undefined, item: T) => {
    if (raw == null) return;
    const key = lookupKey(raw);
    if (!key || index.has(key)) return;
    index.set(key, item);
  };
  for (const item of items) {
    put(item.name, item);
    put(item.code, item);
    put(item.sapCode, item);
  }
  return index;
}

function resolveByCodeOrName<T extends Lookupable>(
  index: Map<string, T>,
  raw: string,
): T | null {
  return index.get(lookupKey(raw)) ?? null;
}

function plannedResultFor(
  preview: BranchImportPreview,
  echoed: BranchImportResult | undefined,
): BranchImportResult {
  return (
    echoed ?? {
      branchesCreated: preview.branchCreateCount,
      branchesUpdated: preview.branchUpdateCount,
      allowedModelsAdded: preview.allowedModelAddCount,
      unchanged: preview.unchangedCount,
    }
  );
}

/**
 * The cached plan is gone (cold instance, or the apply outran the TTL). Ask the
 * browser to re-send the workbook for this same chunk instead of failing the import.
 */
function planExpiredProgress(
  phase: BranchImportChunkPhase,
  offset: number,
): BranchImportChunkProgress {
  return {
    processed: offset,
    total: 0,
    nextOffset: offset,
    phase,
    done: false,
    planExpired: true,
  };
}

async function logImportSummary(
  input: { tenantId: string; actorUserId: string },
  preview: BranchImportPreview,
  plannedResult: BranchImportResult,
): Promise<void> {
  await auditService.log({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: "branch.imported",
    entityType: "Branch",
    entityId: "bulk",
    metadata: {
      branchRows: preview.branchRowCount,
      allowedModelRows: preview.allowedModelRowCount,
      branchesCreated: plannedResult.branchesCreated,
      branchesUpdated: plannedResult.branchesUpdated,
      allowedModelsAdded: plannedResult.allowedModelsAdded,
    },
  });
}

/**
 * Write one enrich chunk as a handful of set-based statements.
 *
 * The row-at-a-time version issued up to five sequential statements per branch inside
 * a single transaction, so a chunk cost hundreds of round trips and could not be made
 * larger without blowing the transaction timeout. Here each kind of write is collected
 * across the whole chunk first, then flushed once.
 *
 * The FK updates are the only per-row statements left (each row sets a different set
 * of columns); they run concurrently and are idempotent, so a retry of a failed chunk
 * re-applies the same values.
 */
async function applyEnrichWrites(input: {
  tenantId: string;
  chunk: BranchPlanInternal[];
  idBySap: Map<string, string>;
  branchAreaIdByName: Map<string, string>;
}): Promise<void> {
  const { tenantId, chunk, idBySap, branchAreaIdByName } = input;

  interface BranchUpdate {
    branchId: string;
    data: {
      dealerId?: string | null;
      primaryWarehouseId?: string | null;
      areaId?: string | null;
      branchAreaId?: string | null;
      regionId?: string | null;
      provinceId?: string | null;
    };
  }

  const fkUpdates: BranchUpdate[] = [];
  const alternateOwnerIds: string[] = [];
  const alternateLinks: { branchId: string; alternateBranchId: string }[] = [];
  const scheduleWrites: { branchId: string; schedule: BranchScheduleInput }[] = [];
  const allowedModelLinks: { tenantId: string; branchId: string; modelId: string }[] = [];

  for (const entry of chunk) {
    const branchId = entry.branchId || idBySap.get(lookupKey(entry.sapCode));
    if (!branchId) continue;

    const data: BranchUpdate["data"] = {};
    if (entry.fields.dealerId !== undefined) data.dealerId = entry.fields.dealerId;
    if (entry.fields.primaryWarehouseId !== undefined) {
      data.primaryWarehouseId = entry.fields.primaryWarehouseId;
    }
    if (entry.fields.areaId !== undefined) data.areaId = entry.fields.areaId;
    if (entry.fields.regionId !== undefined) data.regionId = entry.fields.regionId;
    if (entry.fields.provinceId !== undefined) data.provinceId = entry.fields.provinceId;
    if (entry.fields.branchAreaName) {
      const areaId = branchAreaIdByName.get(lookupKey(entry.fields.branchAreaName));
      if (areaId) data.branchAreaId = areaId;
    }
    if (Object.keys(data).length > 0) fkUpdates.push({ branchId, data });

    if (entry.fields.alternateSapCodes !== undefined) {
      alternateOwnerIds.push(branchId);
      for (const code of entry.fields.alternateSapCodes) {
        const alternateBranchId = idBySap.get(lookupKey(code));
        if (alternateBranchId && alternateBranchId !== branchId) {
          alternateLinks.push({ branchId, alternateBranchId });
        }
      }
    }

    if (entry.fields.schedule) {
      scheduleWrites.push({ branchId, schedule: entry.fields.schedule });
    }

    for (const model of entry.allowedModelsToAdd) {
      allowedModelLinks.push({ tenantId, branchId, modelId: model.modelId });
    }
  }

  await mapWithConcurrency(fkUpdates, WRITE_CONCURRENCY, async (update) => {
    await prisma.branch.update({
      where: { id: update.branchId, tenantId },
      data: update.data,
    });
  });

  // Alternates are declarative: clear every owner in the chunk, then insert once.
  // The pair stays in a transaction — it is the only replace-in-place write here, so
  // a crash between the two halves would silently drop a branch's alternates.
  if (alternateOwnerIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.alternateWarehouse.deleteMany({
        where: { branchId: { in: alternateOwnerIds } },
      });
      if (alternateLinks.length > 0) {
        await tx.alternateWarehouse.createMany({
          data: alternateLinks,
          skipDuplicates: true,
        });
      }
    });
  }

  if (scheduleWrites.length > 0) {
    const existing = await prisma.branchDeliverySchedule.findMany({
      where: { branchId: { in: scheduleWrites.map((write) => write.branchId) } },
      select: { branchId: true },
    });
    const hasSchedule = new Set(existing.map((row) => row.branchId));

    const toCreate = scheduleWrites.filter((write) => !hasSchedule.has(write.branchId));
    if (toCreate.length > 0) {
      await prisma.branchDeliverySchedule.createMany({
        data: toCreate.map((write) => ({
          tenantId,
          branchId: write.branchId,
          frequencyCodeId: write.schedule.frequencyCodeId,
          deliveryDays: write.schedule.deliveryDays,
          orderDays: write.schedule.orderDays,
          notes: write.schedule.notes ?? null,
        })),
        skipDuplicates: true,
      });
    }

    const toUpdate = scheduleWrites.filter((write) => hasSchedule.has(write.branchId));
    await mapWithConcurrency(toUpdate, WRITE_CONCURRENCY, async (write) => {
      await prisma.branchDeliverySchedule.update({
        where: { branchId: write.branchId },
        data: {
          frequencyCodeId: write.schedule.frequencyCodeId,
          deliveryDays: write.schedule.deliveryDays,
          orderDays: write.schedule.orderDays,
          notes: write.schedule.notes ?? null,
        },
      });
    });
  }

  if (allowedModelLinks.length > 0) {
    await prisma.branchAllowedModel.createMany({
      data: allowedModelLinks,
      skipDuplicates: true,
    });
  }
}

export const branchImportService = {
  /** Template pre-filled with active branches (form-aligned columns). */
  async buildTemplate(tenantId: string): Promise<Buffer> {
    const branches = await branchRepository.listActiveForTemplate(tenantId);
    return buildTemplateWorkbook(
      branches.map((branch) => ({
        sapCode: branch.sapCode,
        name: branch.name,
        status: branch.status,
        dealer: branch.dealer?.sapCode?.trim() || branch.dealer?.name || "",
        primaryWarehouse: branch.primaryWarehouse?.code || branch.primaryWarehouse?.name || "",
        branchArea: branch.branchArea?.name || "",
        area: branch.area?.code || branch.area?.name || "",
        region: branch.region?.name || "",
        province: branch.province?.name || "",
        alternateBranches: branch.alternateWarehouses
          .map((row) => row.alternateBranch.sapCode)
          .filter(Boolean)
          .join(","),
        frequencyCode: branch.deliveryScheduleConfig?.frequencyCode.code || "",
        deliveryDays: branch.deliveryScheduleConfig
          ? formatWeekdayListForTemplate(branch.deliveryScheduleConfig.deliveryDays)
          : "",
        orderDays: branch.deliveryScheduleConfig
          ? formatWeekdayListForTemplate(branch.deliveryScheduleConfig.orderDays)
          : "",
        scheduleNotes: branch.deliveryScheduleConfig?.notes || "",
      })),
    );
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
    const sheetLabel = psgStyle ? (branchSheet.present ? "ISMS" : BRANCH_SHEET_NAME) : BRANCH_SHEET_NAME;
    const columns = branchSheet.columns;

    // Last-wins on sap_code within the branch sheet (PSG duplicates).
    const lastBranchRowBySap = new Map<
      string,
      { rowNumber: number; values: Record<string, string> }
    >();
    for (const row of branchSheet.rows) {
      const sapCode = row.values.sapcode?.trim() ?? "";
      // Blank sap_code rows are trailing padding in most exports — silently skipped.
      if (isBlankOrDash(sapCode)) continue;
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

    // Also collect alternate SAP codes for lookup.
    const alternateSapCodes: string[] = [];
    for (const row of lastBranchRowBySap.values()) {
      const raw = row.values.alternatebranches?.trim() ?? "";
      if (!isBlankOrDash(raw)) {
        alternateSapCodes.push(...splitList(raw));
      }
    }
    const allSapCodes = [...new Set([...sapCodes, ...alternateSapCodes])];

    const skuCodes = [
      ...new Set(
        allowedSheet.rows
          .map((row) => row.values.skucode?.trim())
          .filter((code): code is string => Boolean(code)),
      ),
    ];

    const [branches, models, dealers, warehouses, areas, branchAreas, regions, provinces, frequencyCodes] =
      await Promise.all([
        allSapCodes.length
          ? branchRepository.findManyBySapCodes(tenantId, allSapCodes)
          : Promise.resolve([]),
        skuCodes.length
          ? branchRepository.findModelsBySkuCodes(tenantId, skuCodes)
          : Promise.resolve([]),
        prisma.dealer.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, name: true, sapCode: true },
        }),
        prisma.warehouse.findMany({
          where: { tenantId },
          select: { id: true, name: true, code: true },
        }),
        prisma.area.findMany({
          where: { tenantId },
          select: { id: true, name: true, code: true },
        }),
        prisma.branchArea.findMany({
          where: { tenantId },
          select: { id: true, name: true },
        }),
        prisma.region.findMany({
          where: { tenantId },
          select: { id: true, name: true },
        }),
        prisma.province.findMany({
          where: { tenantId },
          select: { id: true, name: true },
        }),
        prisma.frequencyCode.findMany({
          where: { tenantId },
          select: { id: true, code: true },
        }),
      ]);

    const branchBySapCode = new Map(branches.map((b) => [lookupKey(b.sapCode), b]));
    const modelBySku = new Map(models.map((m) => [lookupKey(m.skuCode), m]));
    const frequencyByCode = new Map(frequencyCodes.map((f) => [lookupKey(f.code), f]));
    const dealerIndex = indexByCodeOrName(dealers);
    const warehouseIndex = indexByCodeOrName(warehouses);
    const areaIndex = indexByCodeOrName(areas);
    const regionIndex = indexByCodeOrName(regions);
    const provinceIndex = indexByCodeOrName(provinces);
    const branchAreaByName = new Map(branchAreas.map((a) => [lookupKey(a.name), a]));

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

    function cellPresent(key: string): boolean {
      return columns.has(key);
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
      const devantQuota = parseQuota(row.values.devantquota);
      const hisenseQuota = resolveHisenseQuota(row.values);

      // Branch area: new template uses branch_area; PSG uses AREA as branch area.
      let branchAreaName: string | null | undefined;
      if (cellPresent("brancharea")) {
        const raw = row.values.brancharea?.trim() ?? "";
        branchAreaName = isBlankOrDash(raw) ? undefined : raw;
      } else if (psgStyle && cellPresent("area")) {
        const raw = row.values.area?.trim() ?? "";
        branchAreaName = isBlankOrDash(raw) ? undefined : raw;
      }

      const changes: BranchImportFieldChange[] = [];
      const fields: BranchPlanInternal["fields"] = {};
      const isCreate = !existing;
      let rowHasError = false;

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
        if (branchAreaName) fields.branchAreaName = branchAreaName;
        if (devantQuota != null) fields.devantQuota = devantQuota;
        if (hisenseQuota != null) fields.hisenseQuota = hisenseQuota;
        pushChange(changes, "name", "—", name);
        if (status) pushChange(changes, "status", "—", status);
        if (branchAreaName) pushChange(changes, "branchArea", "—", branchAreaName);
      } else if (existing) {
        if (nameRaw && nameRaw !== existing.name) {
          fields.name = nameRaw;
          pushChange(changes, "name", existing.name, nameRaw);
        }
        if (status && status !== existing.status) {
          fields.status = status;
          pushChange(changes, "status", existing.status, status);
        }
        if (branchAreaName && (existing.branchArea?.name ?? null) !== branchAreaName) {
          fields.branchAreaName = branchAreaName;
          pushChange(
            changes,
            "branchArea",
            display(existing.branchArea?.name),
            branchAreaName,
          );
        }
        if (devantQuota != null) {
          fields.devantQuota = devantQuota;
          pushChange(changes, "devantQuota", "—", String(devantQuota));
        }
        if (hisenseQuota != null) {
          fields.hisenseQuota = hisenseQuota;
          pushChange(changes, "hisenseQuota", "—", String(hisenseQuota));
        }
      }

      // Dealer
      if (cellPresent("dealer")) {
        const raw = row.values.dealer?.trim() ?? "";
        if (!isBlankOrDash(raw)) {
          const dealer = resolveByCodeOrName(dealerIndex, raw);
          if (!dealer) {
            errors.push({
              sheet: sheetLabel,
              rowNumber: row.rowNumber,
              sapCode,
              message: `Dealer "${raw}" was not found (use SAP code or name).`,
            });
            rowHasError = true;
          } else if (isCreate || existing?.dealerId !== dealer.id) {
            fields.dealerId = dealer.id;
            const from = existing?.dealer?.sapCode || existing?.dealer?.name || null;
            pushChange(changes, "dealer", display(from), dealer.sapCode || dealer.name);
          }
        }
      }

      // Primary warehouse
      if (cellPresent("primarywarehouse")) {
        const raw = row.values.primarywarehouse?.trim() ?? "";
        if (!isBlankOrDash(raw)) {
          const warehouse = resolveByCodeOrName(warehouseIndex, raw);
          if (!warehouse) {
            errors.push({
              sheet: sheetLabel,
              rowNumber: row.rowNumber,
              sapCode,
              message: `Primary warehouse "${raw}" was not found (use code or name).`,
            });
            rowHasError = true;
          } else if (isCreate || existing?.primaryWarehouseId !== warehouse.id) {
            fields.primaryWarehouseId = warehouse.id;
            const from =
              existing?.primaryWarehouse?.code || existing?.primaryWarehouse?.name || null;
            pushChange(
              changes,
              "primaryWarehouse",
              display(from),
              warehouse.code || warehouse.name,
            );
          }
        }
      }

      // Geo area (only when not PSG-AREA-as-branch-area)
      if (cellPresent("area") && (cellPresent("brancharea") || !psgStyle)) {
        const raw = row.values.area?.trim() ?? "";
        if (!isBlankOrDash(raw)) {
          const area = resolveByCodeOrName(areaIndex, raw);
          if (!area) {
            errors.push({
              sheet: sheetLabel,
              rowNumber: row.rowNumber,
              sapCode,
              message: `Area "${raw}" was not found (use code or name).`,
            });
            rowHasError = true;
          } else if (isCreate || existing?.areaId !== area.id) {
            fields.areaId = area.id;
            const from = existing?.area?.code || existing?.area?.name || null;
            pushChange(changes, "area", display(from), area.code || area.name);
          }
        }
      }

      // Region
      if (cellPresent("region")) {
        const raw = row.values.region?.trim() ?? "";
        if (!isBlankOrDash(raw)) {
          const region = resolveByCodeOrName(regionIndex, raw);
          if (!region) {
            errors.push({
              sheet: sheetLabel,
              rowNumber: row.rowNumber,
              sapCode,
              message: `Region "${raw}" was not found.`,
            });
            rowHasError = true;
          } else if (isCreate || existing?.regionId !== region.id) {
            fields.regionId = region.id;
            pushChange(changes, "region", display(existing?.region?.name), region.name);
          }
        }
      }

      // Province
      if (cellPresent("province")) {
        const raw = row.values.province?.trim() ?? "";
        if (!isBlankOrDash(raw)) {
          const province = resolveByCodeOrName(provinceIndex, raw);
          if (!province) {
            errors.push({
              sheet: sheetLabel,
              rowNumber: row.rowNumber,
              sapCode,
              message: `Province "${raw}" was not found.`,
            });
            rowHasError = true;
          } else if (isCreate || existing?.provinceId !== province.id) {
            fields.provinceId = province.id;
            pushChange(changes, "province", display(existing?.province?.name), province.name);
          }
        }
      }

      // New-template branch_area against existing BranchArea master (PSG still auto-creates via upsert).
      if (branchAreaName && cellPresent("brancharea") && !psgStyle) {
        if (!branchAreaByName.has(lookupKey(branchAreaName))) {
          errors.push({
            sheet: sheetLabel,
            rowNumber: row.rowNumber,
            sapCode,
            message: `Branch area "${branchAreaName}" was not found.`,
          });
          rowHasError = true;
        }
      }

      // Alternate branches
      if (cellPresent("alternatebranches")) {
        const raw = row.values.alternatebranches?.trim() ?? "";
        if (!isBlankOrDash(raw)) {
          const codes = splitList(raw);
          const resolvedCodes: string[] = [];
          for (const altCode of codes) {
            if (lookupKey(altCode) === key) continue; // skip self
            const existingAlt = branchBySapCode.get(lookupKey(altCode));
            if (existingAlt || createSapKeys.has(lookupKey(altCode))) {
              resolvedCodes.push(existingAlt?.sapCode ?? altCode);
              continue;
            }
            errors.push({
              sheet: sheetLabel,
              rowNumber: row.rowNumber,
              sapCode,
              message: `Alternate branch "${altCode}" was not found.`,
            });
            rowHasError = true;
          }
          if (!rowHasError) {
            const fromCodes =
              existing?.alternateWarehouses.map((rowAlt) => rowAlt.alternateBranch.sapCode) ?? [];
            if (isCreate || !sameSapList(fromCodes, resolvedCodes)) {
              fields.alternateSapCodes = resolvedCodes;
              pushChange(
                changes,
                "alternateBranches",
                fromCodes.length ? fromCodes.join(", ") : "—",
                resolvedCodes.length ? resolvedCodes.join(", ") : "—",
              );
            }
          }
        }
      }

      // Schedule — only when frequency_code is present and non-blank
      if (cellPresent("frequencycode")) {
        const freqRaw = row.values.frequencycode?.trim() ?? "";
        if (!isBlankOrDash(freqRaw)) {
          const frequency = frequencyByCode.get(lookupKey(freqRaw));
          if (!frequency) {
            errors.push({
              sheet: sheetLabel,
              rowNumber: row.rowNumber,
              sapCode,
              message: `Frequency code "${freqRaw}" was not found.`,
            });
            rowHasError = true;
          } else {
            const deliveryParsed = parseWeekdays(row.values.deliverydays);
            const orderParsed = parseWeekdays(row.values.orderdays);
            if (deliveryParsed && "error" in deliveryParsed) {
              errors.push({
                sheet: sheetLabel,
                rowNumber: row.rowNumber,
                sapCode,
                message: `delivery_days: ${deliveryParsed.error}`,
              });
              rowHasError = true;
            } else if (orderParsed && "error" in orderParsed) {
              errors.push({
                sheet: sheetLabel,
                rowNumber: row.rowNumber,
                sapCode,
                message: `order_days: ${orderParsed.error}`,
              });
              rowHasError = true;
            } else {
              const deliveryDays =
                deliveryParsed && "days" in deliveryParsed
                  ? deliveryParsed.days
                  : (existing?.deliveryScheduleConfig?.deliveryDays ?? []);
              const orderDays =
                orderParsed && "days" in orderParsed
                  ? orderParsed.days
                  : (existing?.deliveryScheduleConfig?.orderDays ?? []);
              if (deliveryDays.length === 0) {
                errors.push({
                  sheet: sheetLabel,
                  rowNumber: row.rowNumber,
                  sapCode,
                  message: "delivery_days is required when frequency_code is set.",
                });
                rowHasError = true;
              } else if (orderDays.length === 0) {
                errors.push({
                  sheet: sheetLabel,
                  rowNumber: row.rowNumber,
                  sapCode,
                  message: "order_days is required when frequency_code is set.",
                });
                rowHasError = true;
              } else {
                const notesRaw = cellPresent("schedulenotes")
                  ? (row.values.schedulenotes ?? "").trim()
                  : (existing?.deliveryScheduleConfig?.notes ?? "");
                const notes = notesRaw || null;
                fields.schedule = {
                  frequencyCodeId: frequency.id,
                  deliveryDays,
                  orderDays,
                  notes,
                };
                const existingSchedule = existing?.deliveryScheduleConfig;
                if (
                  isCreate ||
                  !existingSchedule ||
                  existingSchedule.frequencyCodeId !== frequency.id ||
                  !sameDayList(existingSchedule.deliveryDays, deliveryDays) ||
                  !sameDayList(existingSchedule.orderDays, orderDays) ||
                  (existingSchedule.notes ?? "") !== (notes ?? "")
                ) {
                  pushChange(
                    changes,
                    "frequencyCode",
                    display(existingSchedule?.frequencyCode.code),
                    frequency.code,
                  );
                  pushChange(
                    changes,
                    "deliveryDays",
                    existingSchedule
                      ? formatWeekdayListForTemplate(existingSchedule.deliveryDays)
                      : "—",
                    formatWeekdayListForTemplate(deliveryDays),
                  );
                  pushChange(
                    changes,
                    "orderDays",
                    existingSchedule
                      ? formatWeekdayListForTemplate(existingSchedule.orderDays)
                      : "—",
                    formatWeekdayListForTemplate(orderDays),
                  );
                  if (cellPresent("schedulenotes")) {
                    pushChange(
                      changes,
                      "scheduleNotes",
                      display(existingSchedule?.notes),
                      display(notes),
                    );
                  }
                }
              }
            }
          }
        }
      }

      if (rowHasError) continue;

      // Always feed the shared upsert path (creates + area/status/quotas; preserves dealer/geo).
      psgRows.push({
        name: fields.name ?? name,
        sapCode,
        areaName: fields.branchAreaName ?? branchAreaName ?? null,
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

    // --- Optional legacy Allowed Models sheet ---------------------------------
    const modelsBySap = new Map<
      string,
      Map<string, { modelId: string; skuCode: string; name: string }>
    >();

    for (const row of allowedSheet.rows) {
      const resolved = resolveBranchForModels(ALLOWED_MODEL_SHEET_NAME, row);
      if (!resolved) continue;

      const sapCode = resolved.sapCode;
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
        entry.isCreate ||
        entry.changes.length > 0 ||
        entry.allowedModelsToAdd.length > 0 ||
        entry.fields.dealerId !== undefined ||
        entry.fields.primaryWarehouseId !== undefined ||
        entry.fields.areaId !== undefined ||
        entry.fields.regionId !== undefined ||
        entry.fields.provinceId !== undefined ||
        entry.fields.alternateSapCodes !== undefined ||
        entry.fields.schedule !== undefined,
    );

    const branchCreateCount = plan.filter((entry) => entry.isCreate).length;
    const branchUpdateCount = plan.filter(
      (entry) => !entry.isCreate && (entry.changes.length > 0 || entry.fields.schedule !== undefined),
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

    // Stable enrich walk order: branch-sheet PSG rows first, then models-only SAPs.
    const enrichKeys: string[] = [];
    const enrichSeen = new Set<string>();
    for (const row of psgRows) {
      const key = lookupKey(row.sapCode);
      if (enrichSeen.has(key)) continue;
      enrichSeen.add(key);
      enrichKeys.push(key);
    }
    for (const key of planBySap.keys()) {
      if (enrichSeen.has(key)) continue;
      enrichSeen.add(key);
      enrichKeys.push(key);
    }

    return {
      branches: plan,
      entryBySap: planBySap,
      enrichKeys,
      psgRows,
      branchAreaIdByName: new Map(
        branchAreas.map((area) => [lookupKey(area.name), area.id]),
      ),
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

  /**
   * Memoised `buildPlan`. Every chunk of an apply needs the same plan, and rebuilding
   * it means re-parsing the workbook and re-running the master-data queries — by far
   * the dominant cost of a large import.
   *
   * `planKey` is a server-derived digest handed to the client by `preview`. A cache
   * miss falls back to rebuilding from the uploaded file, so a cold or scaled-out
   * instance is slower but never wrong; callers that have no file to fall back to
   * get `null` and are expected to ask the browser to re-send it.
   */
  async resolvePlan(input: {
    tenantId: string;
    file?: Buffer;
    planKey?: string;
  }): Promise<{ plan: ImportPlan; planKey: string } | null> {
    if (input.planKey) {
      const cached = getCachedPlan<ImportPlan>(input.planKey);
      if (cached) return { plan: cached, planKey: input.planKey };
    }
    if (!input.file) return null;

    const planKey = planKeyFor(input.tenantId, input.file);
    const cached = getCachedPlan<ImportPlan>(planKey);
    if (cached) return { plan: cached, planKey };

    const plan = await this.buildPlan(input.tenantId, input.file);
    setCachedPlan(planKey, plan);
    return { plan, planKey };
  },

  /**
   * Core phase: upsert name/status/area/quotas for a slice of PSG rows.
   * When core finishes, response advances to `enrich` at offset 0 (not done yet).
   */
  async applyCoreChunk(input: {
    tenantId: string;
    file?: Buffer;
    planKey?: string;
    offset: number;
    plannedResult?: BranchImportResult;
  }): Promise<BranchImportChunkProgress> {
    const resolved = await this.resolvePlan(input);
    if (!resolved) return planExpiredProgress("core", input.offset);

    const { plan, planKey } = resolved;
    const { preview, psgRows } = plan;
    if (preview.errors.length > 0) {
      throw new Error("Fix the reported rows before importing.");
    }

    // Totals come from the cached pre-write plan, so they stay accurate for the whole
    // apply. `input.plannedResult` is still honoured for clients that echo it.
    const plannedResult = plannedResultFor(preview, input.plannedResult);

    const total = psgRows.length;
    if (total === 0 || input.offset >= total) {
      return {
        processed: total,
        total,
        nextOffset: 0,
        phase: "enrich",
        done: false,
        planKey,
        plannedResult,
      };
    }

    const chunk = psgRows.slice(input.offset, input.offset + CORE_CHUNK_SIZE);
    await upsertPsgBranches(prisma, input.tenantId, chunk);
    const nextOffset = input.offset + chunk.length;

    if (nextOffset >= total) {
      return {
        processed: total,
        total,
        nextOffset: 0,
        phase: "enrich",
        done: false,
        planKey,
        plannedResult,
      };
    }

    return {
      processed: nextOffset,
      total,
      nextOffset,
      phase: "core",
      done: false,
      planKey,
      plannedResult,
    };
  },

  /**
   * Enrich phase: FKs, alternates, schedule, allowed models, and per-row audits
   * for a stable slice of file SAP codes (not the shrinking post-core plan list).
   * Bulk import audit only on the last slice.
   */
  async applyEnrichChunk(input: {
    tenantId: string;
    actorUserId: string;
    file?: Buffer;
    planKey?: string;
    offset: number;
    plannedResult?: BranchImportResult;
  }): Promise<BranchImportChunkProgress> {
    const resolved = await this.resolvePlan(input);
    if (!resolved) return planExpiredProgress("enrich", input.offset);

    const { plan, planKey } = resolved;
    const { preview, entryBySap, enrichKeys, branchAreaIdByName } = plan;
    if (preview.errors.length > 0) {
      throw new Error("Fix the reported rows before importing.");
    }

    const plannedResult = plannedResultFor(preview, input.plannedResult);

    const total = enrichKeys.length;
    if (total === 0 || input.offset >= total) {
      if (total === 0) await logImportSummary(input, preview, plannedResult);
      return {
        processed: total,
        total,
        nextOffset: total,
        phase: "enrich",
        done: true,
        planKey,
        plannedResult,
        result: plannedResult,
      };
    }

    const chunk = enrichKeys
      .slice(input.offset, input.offset + ENRICH_CHUNK_SIZE)
      .map((key) => entryBySap.get(key))
      .filter((entry): entry is BranchPlanInternal => Boolean(entry));

    // Re-resolve branch ids after creates (for models, alternates, schedule, FKs).
    const sapCodesNeedingResolve = [
      ...new Set([
        ...chunk.map((entry) => entry.sapCode),
        ...chunk.flatMap((entry) => entry.fields.alternateSapCodes ?? []),
      ]),
    ];
    const resolvedBranches = sapCodesNeedingResolve.length
      ? await branchRepository.findIdsBySapCodes(input.tenantId, sapCodesNeedingResolve)
      : [];
    const idBySap = new Map(resolvedBranches.map((b) => [lookupKey(b.sapCode), b.id]));

    await applyEnrichWrites({
      tenantId: input.tenantId,
      chunk,
      idBySap,
      branchAreaIdByName,
    });

    await auditService.logMany(
      chunk.map((entry) => ({
        tenantId: input.tenantId,
        userId: input.actorUserId,
        action: entry.isCreate
          ? "branch.created"
          : entry.changes.length > 0
            ? "branch.updated"
            : "branch.allowed_models.added",
        entityType: "Branch",
        entityId: entry.branchId || idBySap.get(lookupKey(entry.sapCode)) || entry.sapCode,
        metadata: {
          source: "excel-import",
          sapCode: entry.sapCode,
          isCreate: entry.isCreate,
          changedFields: entry.changes.map((change) => change.field),
          allowedModelsAdded: entry.allowedModelsToAdd.map((model) => model.skuCode),
        },
      })),
    );

    const nextOffset = input.offset + chunk.length;
    const done = nextOffset >= total;
    if (done) await logImportSummary(input, preview, plannedResult);

    return {
      processed: nextOffset,
      total,
      nextOffset,
      phase: "enrich",
      done,
      planKey,
      plannedResult,
      result: done ? plannedResult : undefined,
    };
  },

  async applyChunk(input: {
    tenantId: string;
    actorUserId: string;
    file?: Buffer;
    planKey?: string;
    phase: BranchImportChunkPhase;
    offset: number;
    plannedResult?: BranchImportResult;
  }): Promise<BranchImportChunkProgress> {
    if (input.phase === "core") {
      return this.applyCoreChunk({
        tenantId: input.tenantId,
        file: input.file,
        planKey: input.planKey,
        offset: input.offset,
        plannedResult: input.plannedResult,
      });
    }
    return this.applyEnrichChunk({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      file: input.file,
      planKey: input.planKey,
      offset: input.offset,
      plannedResult: input.plannedResult,
    });
  },

  /**
   * Full apply via core then enrich chunks. Used by non-UI callers, and the loop a
   * background worker will run once the import moves onto a queue (step 2).
   */
  async apply(input: {
    tenantId: string;
    actorUserId: string;
    file: Buffer;
  }): Promise<BranchImportResult> {
    let phase: BranchImportChunkPhase = "core";
    let offset = 0;
    let planKey: string | undefined;
    let plannedResult: BranchImportResult | undefined;

    for (;;) {
      const progress = await this.applyChunk({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        file: input.file,
        planKey,
        phase,
        offset,
        plannedResult,
      });
      if (progress.planKey) planKey = progress.planKey;
      if (progress.plannedResult) plannedResult = progress.plannedResult;
      if (progress.done) {
        if (!progress.result) {
          throw new Error("Import finished without a result.");
        }
        return progress.result;
      }
      phase = progress.phase;
      offset = progress.nextOffset;
    }
  },
};

export type { SheetRows };
