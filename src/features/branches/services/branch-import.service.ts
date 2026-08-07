import { auditService } from "@/features/audit/services/audit.service";
import type { BranchScheduleInput } from "@/features/branches/repositories/branch.repository";
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
  formatWeekdayListForTemplate,
  readImportWorkbook,
  type SheetRows,
} from "@/features/branches/services/branch-import.workbook";
import { upsertPsgBranches } from "@/features/branches/services/psg-branch-upsert";
import type { PsgBranchRow } from "@/features/branches/services/psg-branch-workbook";
import {
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
} from "@/features/orders/utils/order-window";
import { prisma } from "@/lib/database/client";

/**
 * Bulk branch import from the Branches workbook (or a PSG ISMS single sheet).
 *
 * Unknown sap_codes are created; existing ones are updated. Optional legacy
 * Allowed Models sheet still requires existing product models — never auto-created.
 */

const MAX_ROWS = 20_000;
const APPLY_CHUNK_SIZE = 25;

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
  branches: BranchPlanInternal[];
  psgRows: PsgBranchRow[];
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

function resolveByCodeOrName<
  T extends { id: string; name: string; code?: string | null; sapCode?: string | null },
>(items: T[], raw: string): T | null {
  const key = lookupKey(raw);
  return (
    items.find(
      (item) =>
        lookupKey(item.name) === key ||
        (item.code != null && lookupKey(item.code) === key) ||
        (item.sapCode != null && lookupKey(item.sapCode) === key),
    ) ?? null
  );
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
          const dealer = resolveByCodeOrName(dealers, raw);
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
          const warehouse = resolveByCodeOrName(warehouses, raw);
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
          const area = resolveByCodeOrName(areas, raw);
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
          const region = resolveByCodeOrName(regions, raw);
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
          const province = resolveByCodeOrName(provinces, raw);
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
        const match = branchAreas.find((a) => lookupKey(a.name) === lookupKey(branchAreaName));
        if (!match) {
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

    // Re-resolve branch ids after creates (for models, alternates, schedule, FKs).
    const sapCodesNeedingResolve = [
      ...new Set([
        ...branches.map((entry) => entry.sapCode),
        ...branches.flatMap((entry) => entry.fields.alternateSapCodes ?? []),
      ]),
    ];
    const resolvedBranches = sapCodesNeedingResolve.length
      ? await branchRepository.findManyBySapCodes(input.tenantId, sapCodesNeedingResolve)
      : [];
    const idBySap = new Map(resolvedBranches.map((b) => [lookupKey(b.sapCode), b.id]));

    // Resolve branch_area names created by PSG upsert for FK patching.
    const branchAreaNames = [
      ...new Set(
        branches
          .map((entry) => entry.fields.branchAreaName)
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    const branchAreaRows = branchAreaNames.length
      ? await prisma.branchArea.findMany({
          where: { tenantId: input.tenantId, name: { in: branchAreaNames } },
          select: { id: true, name: true },
        })
      : [];
    const branchAreaIdByName = new Map(
      branchAreaRows.map((row) => [lookupKey(row.name), row.id]),
    );

    for (let i = 0; i < branches.length; i += APPLY_CHUNK_SIZE) {
      const chunk = branches.slice(i, i + APPLY_CHUNK_SIZE);
      await prisma.$transaction(
        async (tx) => {
          for (const entry of chunk) {
            const branchId = entry.branchId || idBySap.get(lookupKey(entry.sapCode));
            if (!branchId) continue;

            const data: {
              dealerId?: string | null;
              primaryWarehouseId?: string | null;
              areaId?: string | null;
              branchAreaId?: string | null;
              regionId?: string | null;
              provinceId?: string | null;
            } = {};

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

            if (Object.keys(data).length > 0) {
              await tx.branch.update({
                where: { id: branchId, tenantId: input.tenantId },
                data,
              });
            }

            if (entry.fields.alternateSapCodes !== undefined) {
              const alternateIds = entry.fields.alternateSapCodes
                .map((code) => idBySap.get(lookupKey(code)))
                .filter((id): id is string => Boolean(id) && id !== branchId);
              await tx.alternateWarehouse.deleteMany({ where: { branchId } });
              if (alternateIds.length > 0) {
                await tx.alternateWarehouse.createMany({
                  data: alternateIds.map((alternateBranchId) => ({
                    branchId,
                    alternateBranchId,
                  })),
                  skipDuplicates: true,
                });
              }
            }

            if (entry.fields.schedule) {
              await tx.branchDeliverySchedule.upsert({
                where: { branchId },
                create: {
                  tenantId: input.tenantId,
                  branchId,
                  frequencyCodeId: entry.fields.schedule.frequencyCodeId,
                  deliveryDays: entry.fields.schedule.deliveryDays,
                  orderDays: entry.fields.schedule.orderDays,
                  notes: entry.fields.schedule.notes ?? null,
                },
                update: {
                  frequencyCodeId: entry.fields.schedule.frequencyCodeId,
                  deliveryDays: entry.fields.schedule.deliveryDays,
                  orderDays: entry.fields.schedule.orderDays,
                  notes: entry.fields.schedule.notes ?? null,
                },
              });
            }

            if (entry.allowedModelsToAdd.length > 0) {
              await tx.branchAllowedModel.createMany({
                data: entry.allowedModelsToAdd.map((model) => ({
                  tenantId: input.tenantId,
                  branchId,
                  modelId: model.modelId,
                })),
                skipDuplicates: true,
              });
            }
          }
        },
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
