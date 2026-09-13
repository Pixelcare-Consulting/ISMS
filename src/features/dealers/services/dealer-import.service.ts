import type { CreateAuditLogInput } from "@/features/audit/repositories/audit-log.repository";
import { auditService } from "@/features/audit/services/audit.service";
import {
  DEALER_IMPORT_FIELD_LABELS,
  DEALER_SHEET_NAME,
  type DealerImportChunkProgress,
  type DealerImportFieldChange,
  type DealerImportPreview,
  type DealerImportResult,
  type DealerImportRowError,
  type DealerImportRowPlan,
} from "@/features/dealers/schemas/dealer-import.schema";
import {
  buildDealerTemplateWorkbook,
  readDealerImportWorkbook,
  type DealerTemplateRow,
  type SheetRows,
} from "@/features/dealers/services/dealer-import.workbook";
import { prisma } from "@/lib/database/client";
import type { BranchStatus } from "@/lib/database/generated/prisma/client";
import { mapWithConcurrency } from "@/lib/shared/concurrency";
import {
  getCachedPlan,
  invalidatePlan,
  planKeyFor,
  setCachedPlan,
} from "@/lib/shared/import-plan-cache";

const MAX_ROWS = 20_000;
const APPLY_CHUNK_SIZE = 250;
const WRITE_CONCURRENCY = 8;
const PLAN_NAMESPACE = "dealer-import";

/** Everything a write needs, resolved at plan time so the apply never re-reads the sheet. */
interface DealerWriteFields {
  sapCode?: string | null;
  name?: string;
  status?: BranchStatus;
  areaId?: string | null;
  dealerTypeId?: string | null;
  dealerAreaId?: string | null;
  modeOfPaymentId?: string | null;
}

interface RowPlanInternal extends DealerImportRowPlan {
  /** Existing dealer id, or null when this row creates. */
  dealerId: string | null;
  fields: DealerWriteFields;
}

interface ImportPlan {
  preview: DealerImportPreview;
  writes: RowPlanInternal[];
}

interface Named {
  id: string;
  name: string;
}

function lookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function isBlankOrDash(value: string | undefined | null): boolean {
  if (value == null) return true;
  const trimmed = value.trim();
  return !trimmed || trimmed === "-";
}

function display(value: string | null | undefined): string {
  if (value == null) return "—";
  const text = String(value).trim();
  return text ? text : "—";
}

function mapStatus(raw: string | undefined): BranchStatus | null {
  if (raw == null || !raw.trim()) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "inactive" || normalized === "in-active" || normalized === "disabled") {
    return "inactive";
  }
  if (normalized === "active" || normalized === "enabled") return "active";
  return null;
}

function pushChange(
  changes: DealerImportFieldChange[],
  field: keyof typeof DEALER_IMPORT_FIELD_LABELS,
  from: string | null | undefined,
  to: string | null | undefined,
) {
  const fromDisplay = display(from);
  const toDisplay = display(to);
  if (fromDisplay === toDisplay) return;
  changes.push({
    field,
    label: DEALER_IMPORT_FIELD_LABELS[field] ?? field,
    from: fromDisplay,
    to: toDisplay,
  });
}

/** Index lookups by name (and code, where the model has one), first occurrence wins. */
function indexByCodeOrName<T extends Named & { code?: string }>(items: T[]): Map<string, T> {
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
  }
  return index;
}

async function loadTemplateRows(tenantId: string): Promise<DealerTemplateRow[]> {
  const dealers = await prisma.dealer.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      sapCode: true,
      name: true,
      status: true,
      area: { select: { code: true } },
      dealerType: { select: { name: true } },
      dealerArea: { select: { name: true } },
      modeOfPayment: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  return dealers.map((dealer) => ({
    sapCode: dealer.sapCode ?? "",
    name: dealer.name,
    status: dealer.status,
    area: dealer.area?.code ?? "",
    dealerType: dealer.dealerType?.name ?? "",
    dealerArea: dealer.dealerArea?.name ?? "",
    modeOfPayment: dealer.modeOfPayment?.name ?? "",
  }));
}

async function buildPlan(tenantId: string, sheet: SheetRows): Promise<ImportPlan> {
  if (sheet.rows.length > MAX_ROWS) {
    throw new Error(`Too many rows (max ${MAX_ROWS}). Split the file and try again.`);
  }

  const [dealers, areas, dealerTypes, dealerAreas, modes] = await Promise.all([
    prisma.dealer.findMany({
      where: { tenantId },
      select: {
        id: true,
        sapCode: true,
        name: true,
        status: true,
        deletedAt: true,
        area: { select: { id: true, code: true, name: true } },
        dealerType: { select: { id: true, name: true } },
        dealerArea: { select: { id: true, name: true } },
        modeOfPayment: { select: { id: true, name: true } },
      },
    }),
    prisma.area.findMany({ where: { tenantId }, select: { id: true, code: true, name: true } }),
    prisma.dealerType.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.dealerArea.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.modeOfPayment.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);

  // Soft-deleted dealers still hold their unique sapCode, so they are indexed by code
  // (a row for one reports as a problem rather than a constraint error) but never by
  // name — a live dealer must not be shadowed by a deleted namesake.
  const bySapCode = new Map<string, (typeof dealers)[number]>();
  const byName = new Map<string, (typeof dealers)[number][]>();
  for (const dealer of dealers) {
    if (dealer.sapCode) bySapCode.set(lookupKey(dealer.sapCode), dealer);
    if (dealer.deletedAt) continue;
    const key = lookupKey(dealer.name);
    const list = byName.get(key);
    if (list) list.push(dealer);
    else byName.set(key, [dealer]);
  }

  const areaIndex = indexByCodeOrName(areas);
  const dealerTypeIndex = indexByCodeOrName(dealerTypes);
  const dealerAreaIndex = indexByCodeOrName(dealerAreas);
  const modeIndex = indexByCodeOrName(modes);

  const errors: DealerImportRowError[] = [];
  const previewRows: DealerImportRowPlan[] = [];
  const writes: RowPlanInternal[] = [];
  const seenSapCodes = new Map<string, number>();
  const seenNames = new Map<string, number>();
  let createCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;

  for (const row of sheet.rows) {
    const sapCodeRaw = row.values.sapcode?.trim() ?? "";
    const nameRaw = row.values.name?.trim() ?? "";
    const sapCode = isBlankOrDash(sapCodeRaw) ? null : sapCodeRaw;
    const label = sapCode ?? (nameRaw || "—");

    let rowHasError = false;
    const pushError = (message: string) => {
      errors.push({ sheet: DEALER_SHEET_NAME, rowNumber: row.rowNumber, dealer: label, message });
      rowHasError = true;
    };

    if (sapCode && sapCode.length > 32) pushError("SAP code must be 32 characters or fewer.");
    if (nameRaw.length > 120) pushError("Dealer name must be 120 characters or fewer.");

    // Duplicates within the file: first row wins, later ones are reported, so two rows
    // never race for the same dealer inside one chunk.
    if (sapCode) {
      const key = lookupKey(sapCode);
      const first = seenSapCodes.get(key);
      if (first != null) pushError(`Duplicate of row ${first} (same SAP code). Keep one row per dealer.`);
      else seenSapCodes.set(key, row.rowNumber);
    } else if (nameRaw) {
      const key = lookupKey(nameRaw);
      const first = seenNames.get(key);
      if (first != null) pushError(`Duplicate of row ${first} (same name, no SAP code). Keep one row per dealer.`);
      else seenNames.set(key, row.rowNumber);
    }

    // Resolve which dealer, if any, this row is about.
    let existing: (typeof dealers)[number] | null = null;
    if (sapCode) {
      existing = bySapCode.get(lookupKey(sapCode)) ?? null;
      if (existing?.deletedAt) {
        pushError(`SAP code "${sapCode}" belongs to a deleted dealer. Restore it before importing.`);
      }
    } else if (nameRaw) {
      const matches = byName.get(lookupKey(nameRaw)) ?? [];
      if (matches.length > 1) {
        pushError(
          `${matches.length} dealers are named "${nameRaw}". Add dealer_sap_code to say which one.`,
        );
      } else {
        existing = matches[0] ?? null;
      }
    }

    const isCreate = existing === null;
    if (isCreate && !nameRaw) {
      pushError("dealer_name is required when creating a new dealer.");
    }

    const status = mapStatus(row.values.status);
    if (!isBlankOrDash(row.values.status) && !status) {
      pushError(`Status "${row.values.status}" is not recognised (use active or inactive).`);
    }

    // Lookups: blank leaves the field alone; a value must resolve to existing master data.
    const resolveLookup = <T extends Named>(
      key: "area" | "dealertype" | "dealerarea" | "modeofpayment",
      index: Map<string, T>,
      what: string,
    ): T | null | undefined => {
      const raw = row.values[key]?.trim() ?? "";
      if (isBlankOrDash(raw)) return undefined;
      const found = index.get(lookupKey(raw));
      if (!found) pushError(`${what} "${raw}" was not found. Create it in Settings first.`);
      return found ?? null;
    };
    const area = resolveLookup("area", areaIndex, "Area");
    const dealerType = resolveLookup("dealertype", dealerTypeIndex, "Dealer type");
    const dealerArea = resolveLookup("dealerarea", dealerAreaIndex, "Dealer area");
    const mode = resolveLookup("modeofpayment", modeIndex, "Mode of payment");

    if (rowHasError) continue;

    const changes: DealerImportFieldChange[] = [];
    const fields: DealerWriteFields = {};

    if (isCreate) {
      fields.name = nameRaw;
      fields.sapCode = sapCode;
      fields.status = status ?? "active";
      fields.areaId = area?.id ?? null;
      fields.dealerTypeId = dealerType?.id ?? null;
      fields.dealerAreaId = dealerArea?.id ?? null;
      fields.modeOfPaymentId = mode?.id ?? null;
      pushChange(changes, "name", null, nameRaw);
      if (sapCode) pushChange(changes, "sapCode", null, sapCode);
      pushChange(changes, "status", null, fields.status);
      if (area) pushChange(changes, "area", null, area.name);
      if (dealerType) pushChange(changes, "dealerType", null, dealerType.name);
      if (dealerArea) pushChange(changes, "dealerArea", null, dealerArea.name);
      if (mode) pushChange(changes, "modeOfPayment", null, mode.name);
    } else if (existing) {
      if (nameRaw && nameRaw !== existing.name) {
        fields.name = nameRaw;
        pushChange(changes, "name", existing.name, nameRaw);
      }
      if (status && status !== existing.status) {
        fields.status = status;
        pushChange(changes, "status", existing.status, status);
      }
      if (area && existing.area?.id !== area.id) {
        fields.areaId = area.id;
        pushChange(changes, "area", existing.area?.name, area.name);
      }
      if (dealerType && existing.dealerType?.id !== dealerType.id) {
        fields.dealerTypeId = dealerType.id;
        pushChange(changes, "dealerType", existing.dealerType?.name, dealerType.name);
      }
      if (dealerArea && existing.dealerArea?.id !== dealerArea.id) {
        fields.dealerAreaId = dealerArea.id;
        pushChange(changes, "dealerArea", existing.dealerArea?.name, dealerArea.name);
      }
      if (mode && existing.modeOfPayment?.id !== mode.id) {
        fields.modeOfPaymentId = mode.id;
        pushChange(changes, "modeOfPayment", existing.modeOfPayment?.name, mode.name);
      }
    }

    const base = {
      rowNumber: row.rowNumber,
      sapCode: sapCode ?? existing?.sapCode ?? null,
      name: nameRaw || existing?.name || "",
    };

    if (!isCreate && changes.length === 0) {
      unchangedCount += 1;
      previewRows.push({ ...base, action: "skip", changes: [] });
      continue;
    }

    const plan: RowPlanInternal = {
      ...base,
      action: isCreate ? "create" : "update",
      changes,
      dealerId: existing?.id ?? null,
      fields,
    };
    if (isCreate) createCount += 1;
    else updateCount += 1;
    writes.push(plan);
    previewRows.push(plan);
  }

  const canApply = (createCount > 0 || updateCount > 0) && errors.length === 0;

  return {
    preview: {
      rowCount: sheet.rows.length,
      createCount,
      updateCount,
      unchangedCount,
      canApply,
      errors,
      rows: previewRows.slice(0, 200),
    },
    writes,
  };
}

async function applyWriteSlice(
  tenantId: string,
  actorUserId: string,
  writes: RowPlanInternal[],
): Promise<{ created: number; updated: number }> {
  if (writes.length === 0) return { created: 0, updated: 0 };

  const toCreate = writes.filter((row) => row.dealerId === null);
  const toUpdate = writes.filter(
    (row): row is RowPlanInternal & { dealerId: string } => row.dealerId !== null,
  );

  const auditRows: CreateAuditLogInput[] = [];
  let created = 0;

  if (toCreate.length > 0) {
    // Row by row rather than `createMany`: a create can still collide on `sapCode` with
    // something written since the plan was built, and one collision must not reject the
    // other 249. The unique index is what stops a duplicate, so a collision surfaces as
    // the row's own error.
    await mapWithConcurrency(toCreate, WRITE_CONCURRENCY, async (row) => {
      const dealer = await prisma.dealer.create({
        data: {
          tenantId,
          name: row.fields.name ?? row.name,
          sapCode: row.fields.sapCode ?? null,
          status: row.fields.status ?? "active",
          areaId: row.fields.areaId ?? null,
          dealerTypeId: row.fields.dealerTypeId ?? null,
          dealerAreaId: row.fields.dealerAreaId ?? null,
          modeOfPaymentId: row.fields.modeOfPaymentId ?? null,
        },
        select: { id: true },
      });
      created += 1;
      auditRows.push({
        tenantId,
        userId: actorUserId,
        action: "dealer.created",
        entityType: "Dealer",
        entityId: dealer.id,
        metadata: { sapCode: row.sapCode, name: row.name, source: "dealer-import" },
      });
    });
  }

  let updated = 0;
  if (toUpdate.length > 0) {
    await mapWithConcurrency(toUpdate, WRITE_CONCURRENCY, async (row) => {
      await prisma.dealer.update({
        where: { id: row.dealerId, tenantId },
        data: row.fields,
      });
      updated += 1;
      auditRows.push({
        tenantId,
        userId: actorUserId,
        action: "dealer.updated",
        entityType: "Dealer",
        entityId: row.dealerId,
        metadata: {
          sapCode: row.sapCode,
          name: row.name,
          source: "dealer-import",
          changes: row.changes.map((change) => change.field),
        },
      });
    });
  }

  if (auditRows.length > 0) {
    await auditService.logMany(auditRows);
  }

  return { created, updated };
}

function emptyChunkProgress(
  total: number,
  planKey: string | undefined,
  unchangedCount: number,
): DealerImportChunkProgress {
  return {
    processed: total,
    total,
    nextOffset: total,
    done: true,
    created: 0,
    updated: 0,
    unchanged: unchangedCount,
    planKey,
    result: { created: 0, updated: 0, unchanged: unchangedCount },
  };
}

function planExpiredProgress(offset: number): DealerImportChunkProgress {
  return {
    processed: offset,
    total: 0,
    nextOffset: offset,
    done: false,
    created: 0,
    updated: 0,
    planExpired: true,
  };
}

export const dealerImportService = {
  async buildTemplate(tenantId: string): Promise<Buffer> {
    const rows = await loadTemplateRows(tenantId);
    return buildDealerTemplateWorkbook(rows);
  },

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

    const planKey = planKeyFor(PLAN_NAMESPACE, input.tenantId, input.file);
    const cached = getCachedPlan<ImportPlan>(planKey);
    if (cached) return { plan: cached, planKey };

    const sheet = await readDealerImportWorkbook(input.file);
    const plan = await buildPlan(input.tenantId, sheet);
    setCachedPlan(planKey, plan);
    return { plan, planKey };
  },

  async buildPlan(
    tenantId: string,
    file: Buffer,
  ): Promise<{ preview: DealerImportPreview; planKey: string }> {
    const resolved = await this.resolvePlan({ tenantId, file });
    if (!resolved) throw new Error("Could not read the file.");
    return { preview: resolved.plan.preview, planKey: resolved.planKey };
  },

  async applyChunk(input: {
    tenantId: string;
    actorUserId: string;
    file?: Buffer;
    planKey?: string;
    offset: number;
  }): Promise<DealerImportChunkProgress> {
    const resolved = await this.resolvePlan(input);
    if (!resolved) return planExpiredProgress(input.offset);

    const { plan, planKey } = resolved;
    if (plan.preview.errors.length > 0) {
      const count = plan.preview.errors.length;
      throw new Error(
        `Fix ${count} problem${count === 1 ? "" : "s"} in the spreadsheet and upload again.`,
      );
    }

    const writes = plan.writes;
    const total = writes.length;
    const unchangedCount = plan.preview.unchangedCount;

    if (total === 0 || input.offset >= total) {
      invalidatePlan(planKey);
      return emptyChunkProgress(total, planKey, unchangedCount);
    }

    const chunk = writes.slice(input.offset, input.offset + APPLY_CHUNK_SIZE);
    const written = await applyWriteSlice(input.tenantId, input.actorUserId, chunk);
    const nextOffset = input.offset + chunk.length;
    const done = nextOffset >= total;
    if (done) invalidatePlan(planKey);

    return {
      processed: nextOffset,
      total,
      nextOffset,
      done,
      created: written.created,
      updated: written.updated,
      unchanged: unchangedCount,
      planKey,
      result: done
        ? { created: written.created, updated: written.updated, unchanged: unchangedCount }
        : undefined,
    };
  },

  async apply(input: {
    tenantId: string;
    actorUserId: string;
    file: Buffer;
  }): Promise<DealerImportResult> {
    let offset = 0;
    let planKey: string | undefined;
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (;;) {
      const progress = await this.applyChunk({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        file: input.file,
        planKey,
        offset,
      });
      if (progress.planKey) planKey = progress.planKey;
      if (progress.unchanged != null) unchanged = progress.unchanged;
      created += progress.created;
      updated += progress.updated;
      if (progress.done) {
        return { created, updated, unchanged };
      }
      offset = progress.nextOffset;
    }
  },
};
