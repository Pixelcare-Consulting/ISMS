import type { Prisma } from "@prisma/client";

import { sellableStkDefectReportsFilter } from "@/features/inventory/services/inventory-sellable-guards";
import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationInput,
} from "@/lib/shared/pagination";

/** Hard cap. Callers cannot ask for an unbounded serial list. */
export const SALEABLE_SERIAL_MAX_LIMIT = 100;

export type SaleableSerialItem = {
  id: string;
  serialNo: string;
  modelId: string;
  skuCode: string;
  modelName: string;
};

export type SaleableSerialQueryInput = {
  tenantId: string;
  stockBranchId: string;
  /** Required. A missing model returns an empty page and does not query. */
  modelId?: string | null;
  search?: string | null;
  stkCodeId: string;
} & PaginationInput;

type BranchInventoryReader = Pick<typeof prisma, "branchInventory">;

export function resolveSaleableSerialPage(input?: PaginationInput) {
  const rawLimit = input?.limit;
  const limit =
    rawLimit == null || !Number.isFinite(rawLimit)
      ? undefined
      : Math.min(SALEABLE_SERIAL_MAX_LIMIT, Math.max(1, Math.trunc(rawLimit)));
  const rawPage = input?.page;
  const page =
    rawPage == null || !Number.isFinite(rawPage)
      ? undefined
      : Math.max(1, Math.trunc(rawPage));
  return resolvePagination({ page, limit });
}

/**
 * Eligible STK serials for one model at one stock source.
 * Tenant, source, model, STK, defect, and search are applied before skip/take.
 * Does not read warehouse inventory or the general serial registry.
 */
export async function querySaleableSerials(
  db: BranchInventoryReader,
  input: SaleableSerialQueryInput,
): Promise<PaginatedResult<SaleableSerialItem>> {
  const page = resolveSaleableSerialPage(input);
  const modelId = input.modelId?.trim() ?? "";
  if (!modelId) {
    return toPaginatedResult<SaleableSerialItem>([], 0, page.page, page.limit);
  }

  const search = input.search?.trim() ?? "";
  const where: Prisma.BranchInventoryWhereInput = {
    tenantId: input.tenantId,
    branchId: input.stockBranchId,
    statusCodeId: input.stkCodeId,
    defectReports: sellableStkDefectReportsFilter,
    serialNumber: {
      modelId,
      ...(search
        ? { serialNo: { contains: search, mode: "insensitive" as const } }
        : {}),
    },
  };

  const [total, rows] = await Promise.all([
    db.branchInventory.count({ where }),
    db.branchInventory.findMany({
      where,
      select: {
        serialNumber: {
          select: {
            id: true,
            serialNo: true,
            modelId: true,
            model: { select: { skuCode: true, name: true } },
          },
        },
      },
      orderBy: [
        { serialNumber: { serialNo: "asc" } },
        { id: "asc" },
      ],
      skip: page.skip,
      take: page.take,
    }),
  ]);

  return toPaginatedResult(
    rows.map((row) => ({
      id: row.serialNumber.id,
      serialNo: row.serialNumber.serialNo,
      modelId: row.serialNumber.modelId,
      skuCode: row.serialNumber.model.skuCode,
      modelName: row.serialNumber.model.name,
    })),
    total,
    page.page,
    page.limit,
  );
}
