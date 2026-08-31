import type { PrismaClient } from "@/lib/database/generated/prisma/client";
import type { PsgBranchRow } from "@/features/branches/services/psg-branch-workbook";
import { mapWithConcurrency } from "@/lib/shared/concurrency";

type SeedPrisma = Pick<
  PrismaClient,
  "branch" | "branchArea" | "branchQuota" | "brand" | "tenant"
>;

export interface UpsertPsgBranchesResult {
  areasUpserted: number;
  branchesCreated: number;
  branchesUpdated: number;
  quotasUpserted: number;
}

/** Independent per-row updates run in parallel; keep it modest so the pool holds up. */
const WRITE_CONCURRENCY = 8;

function startOfCurrentMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function findBrandId(
  brands: { id: string; name: string }[],
  needle: string,
): string | null {
  const lower = needle.toLowerCase();
  const exact = brands.find((b) => b.name.toLowerCase() === lower);
  if (exact) return exact.id;
  const starts = brands.find((b) => b.name.toLowerCase().startsWith(lower));
  return starts?.id ?? null;
}

/** Resolve every referenced BranchArea in three queries instead of one upsert per name. */
async function resolveBranchAreaIds(
  prisma: SeedPrisma,
  tenantId: string,
  names: string[],
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  if (names.length === 0) return byName;

  const existing = await prisma.branchArea.findMany({
    where: { tenantId, name: { in: names } },
    select: { id: true, name: true },
  });
  for (const area of existing) byName.set(area.name, area.id);

  const missing = names.filter((name) => !byName.has(name));
  if (missing.length === 0) return byName;

  await prisma.branchArea.createMany({
    data: missing.map((name) => ({ tenantId, name, recordStatus: "active" as const })),
    skipDuplicates: true,
  });
  const created = await prisma.branchArea.findMany({
    where: { tenantId, name: { in: missing } },
    select: { id: true, name: true },
  });
  for (const area of created) byName.set(area.name, area.id);

  return byName;
}

/** Keeps `in` lists and `createMany` payloads well inside Postgres' bind-parameter cap. */
const BATCH = 500;

/**
 * Upsert BranchArea + Branch (+ current-month quotas for Devant / Hisense when brands exist).
 * Does not overwrite dealerId / primaryWarehouseId / regionId / provinceId when already set.
 *
 * Set-based: each batch issues a handful of queries, rather than the 3–4 sequential
 * round trips per row the row-at-a-time version needed.
 */
export async function upsertPsgBranches(
  prisma: SeedPrisma,
  tenantId: string,
  rows: PsgBranchRow[],
): Promise<UpsertPsgBranchesResult> {
  if (rows.length === 0) {
    return { areasUpserted: 0, branchesCreated: 0, branchesUpdated: 0, quotasUpserted: 0 };
  }

  const areaNames = [
    ...new Set(
      rows
        .map((row) => row.areaName)
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  const [areaIdByName, brands] = await Promise.all([
    resolveBranchAreaIds(prisma, tenantId, areaNames),
    prisma.brand.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);

  const context = {
    areaIdByName,
    devantBrandId: findBrandId(brands, "Devant"),
    hisenseBrandId: findBrandId(brands, "Hisense"),
    quotaDate: startOfCurrentMonthUtc(),
  };

  const result: UpsertPsgBranchesResult = {
    areasUpserted: areaNames.length,
    branchesCreated: 0,
    branchesUpdated: 0,
    quotasUpserted: 0,
  };

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = await upsertBatch(prisma, tenantId, rows.slice(i, i + BATCH), context);
    result.branchesCreated += batch.branchesCreated;
    result.branchesUpdated += batch.branchesUpdated;
    result.quotasUpserted += batch.quotasUpserted;
  }

  return result;
}

interface UpsertContext {
  areaIdByName: Map<string, string>;
  devantBrandId: string | null;
  hisenseBrandId: string | null;
  quotaDate: Date;
}

async function upsertBatch(
  prisma: SeedPrisma,
  tenantId: string,
  rows: PsgBranchRow[],
  context: UpsertContext,
): Promise<Omit<UpsertPsgBranchesResult, "areasUpserted">> {
  const { areaIdByName } = context;
  const areaIdFor = (row: PsgBranchRow) =>
    row.areaName ? (areaIdByName.get(row.areaName) ?? null) : null;

  // Soft-deleted rows still occupy their sapCode, so they are matched here too.
  const existingBranches = await prisma.branch.findMany({
    where: { tenantId, sapCode: { in: rows.map((row) => row.sapCode) } },
    select: { id: true, sapCode: true, name: true, status: true, branchAreaId: true },
  });
  const branchBySapCode = new Map(existingBranches.map((b) => [b.sapCode, b]));

  const toCreate = rows.filter((row) => !branchBySapCode.has(row.sapCode));
  if (toCreate.length > 0) {
    await prisma.branch.createMany({
      data: toCreate.map((row) => ({
        tenantId,
        sapCode: row.sapCode,
        name: row.name,
        status: row.status,
        branchAreaId: areaIdFor(row),
      })),
      skipDuplicates: true,
    });
  }

  // Only write rows whose name/status/area actually differ — most re-imports are no-ops.
  const changed = rows.filter((row) => {
    const existing = branchBySapCode.get(row.sapCode);
    if (!existing) return false;
    const branchAreaId = areaIdFor(row);
    return (
      existing.name !== row.name ||
      existing.status !== row.status ||
      (branchAreaId != null && existing.branchAreaId !== branchAreaId)
    );
  });

  await mapWithConcurrency(changed, WRITE_CONCURRENCY, async (row) => {
    const existing = branchBySapCode.get(row.sapCode)!;
    const branchAreaId = areaIdFor(row);
    await prisma.branch.update({
      where: { id: existing.id },
      data: {
        name: row.name,
        status: row.status,
        ...(branchAreaId ? { branchAreaId } : {}),
        // Preserve dealer / warehouse / region / province when already set.
      },
    });
  });

  // Ids for freshly created rows, so quotas can be attached in the same pass.
  if (toCreate.length > 0) {
    const created = await prisma.branch.findMany({
      where: { tenantId, sapCode: { in: toCreate.map((row) => row.sapCode) } },
      select: { id: true, sapCode: true },
    });
    for (const branch of created) {
      if (!branchBySapCode.has(branch.sapCode)) {
        branchBySapCode.set(branch.sapCode, {
          id: branch.id,
          sapCode: branch.sapCode,
          name: "",
          status: "active",
          branchAreaId: null,
        });
      }
    }
  }

  const quotasUpserted = await upsertQuotas(prisma, tenantId, rows, {
    branchBySapCode,
    devantBrandId: context.devantBrandId,
    hisenseBrandId: context.hisenseBrandId,
    quotaDate: context.quotaDate,
  });

  return {
    branchesCreated: toCreate.length,
    branchesUpdated: changed.length,
    quotasUpserted,
  };
}

async function upsertQuotas(
  prisma: SeedPrisma,
  tenantId: string,
  rows: PsgBranchRow[],
  context: {
    branchBySapCode: Map<string, { id: string }>;
    devantBrandId: string | null;
    hisenseBrandId: string | null;
    quotaDate: Date;
  },
): Promise<number> {
  const { branchBySapCode, devantBrandId, hisenseBrandId, quotaDate } = context;

  const wanted: { branchId: string; brandId: string; amount: number }[] = [];
  for (const row of rows) {
    const branch = branchBySapCode.get(row.sapCode);
    if (!branch) continue;
    if (devantBrandId && row.devantQuota != null) {
      wanted.push({ branchId: branch.id, brandId: devantBrandId, amount: row.devantQuota });
    }
    if (hisenseBrandId && row.hisenseQuota != null) {
      wanted.push({ branchId: branch.id, brandId: hisenseBrandId, amount: row.hisenseQuota });
    }
  }
  if (wanted.length === 0) return 0;

  const existing = await prisma.branchQuota.findMany({
    where: {
      tenantId,
      quotaDate,
      branchId: { in: [...new Set(wanted.map((q) => q.branchId))] },
    },
    select: { id: true, branchId: true, brandId: true, quotaAmount: true },
  });
  const existingByKey = new Map(
    existing.map((quota) => [`${quota.branchId}:${quota.brandId}`, quota]),
  );

  const toCreate = wanted.filter((q) => !existingByKey.has(`${q.branchId}:${q.brandId}`));
  const toUpdate = wanted.filter((q) => {
    const found = existingByKey.get(`${q.branchId}:${q.brandId}`);
    return found != null && Number(found.quotaAmount) !== q.amount;
  });

  if (toCreate.length > 0) {
    await prisma.branchQuota.createMany({
      data: toCreate.map((q) => ({
        tenantId,
        branchId: q.branchId,
        brandId: q.brandId,
        quotaDate,
        quotaAmount: q.amount,
      })),
      skipDuplicates: true,
    });
  }

  await mapWithConcurrency(toUpdate, WRITE_CONCURRENCY, async (q) => {
    await prisma.branchQuota.update({
      where: { branchId_brandId_quotaDate: { branchId: q.branchId, brandId: q.brandId, quotaDate } },
      data: { quotaAmount: q.amount },
    });
  });

  return toCreate.length + toUpdate.length;
}
