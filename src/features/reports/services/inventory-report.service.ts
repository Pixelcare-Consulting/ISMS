import { inventoryRepository } from "@/features/inventory/repositories/inventory.repository";
import { wholeDaysBetween } from "@/features/inventory/utils/sku-series";
import { pcountDisplayRemark } from "@/features/monthly-sir/constants/pcount-upload";
import { buildInventoryReportSectionedCsv } from "@/features/reports/utils/inventory-report-csv";
import { buildInventoryReportWorkbook } from "@/features/reports/utils/inventory-report.workbook";
import { prisma } from "@/lib/database/client";

export interface InventoryReportFilters {
  from?: Date;
  to?: Date;
  /** Empty / omitted = no branch restriction (tenant-wide or full AOR). */
  branchIds?: string[];
  /** Case-insensitive SKU contains. Empty / omitted = no SKU filter. */
  sku?: string;
  /**
   * Inventory status codes. Omitted → no status filter (caller should default).
   * Empty array → no status filter. Non-empty → match any listed code.
   */
  statusCodes?: string[];
}

export type InventoryReportCell = string | number | null | undefined;

export type InventoryReportRows = {
  summaryRows: InventoryReportCell[][];
  detailRows: InventoryReportCell[][];
};

const DELIVERY_LOOKUP_CHUNK = 500;

function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function inDateRange(
  value: Date,
  from: Date | undefined,
  to: Date | undefined,
): boolean {
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

async function findLatestDeliveriesChunked(
  tenantId: string,
  serialNumberIds: string[],
) {
  if (serialNumberIds.length === 0) return [];

  const results: Awaited<
    ReturnType<typeof inventoryRepository.findLatestDeliveryReceipts>
  > = [];

  for (let i = 0; i < serialNumberIds.length; i += DELIVERY_LOOKUP_CHUNK) {
    const chunk = serialNumberIds.slice(i, i + DELIVERY_LOOKUP_CHUNK);
    const part = await inventoryRepository.findLatestDeliveryReceipts(
      tenantId,
      chunk,
    );
    results.push(...part);
  }

  return results;
}

async function findLatestCountRemarks(
  tenantId: string,
  serialNumberIds: string[],
) {
  const latest = new Map<string, { at: number; remark: string }>();
  if (serialNumberIds.length === 0) return latest;

  for (let i = 0; i < serialNumberIds.length; i += DELIVERY_LOOKUP_CHUNK) {
    const chunk = serialNumberIds.slice(i, i + DELIVERY_LOOKUP_CHUNK);
    const lines = await prisma.stockCountLine.findMany({
      where: {
        serialNumberId: { in: chunk },
        session: {
          tenantId,
          status: { notIn: ["draft", "in_progress"] },
        },
      },
      select: {
        serialNumberId: true,
        expectedInCount: true,
        status: true,
        notes: true,
        session: { select: { branchId: true, createdAt: true } },
        variance: { select: { varianceType: true } },
      },
    });
    for (const line of lines) {
      const key = `${line.session.branchId}\0${line.serialNumberId}`;
      const at = line.session.createdAt.getTime();
      const current = latest.get(key);
      if (current && current.at > at) continue;
      latest.set(key, {
        at,
        remark: pcountDisplayRemark({
          expectedInCount: line.expectedInCount,
          lineStatus: line.status,
          varianceType: line.variance?.varianceType ?? null,
          notes: line.notes,
        }),
      });
    }
  }

  return latest;
}

/**
 * Build SUMMARY qty rows and DETAIL serial rows for the Inventory Report.
 * Date filter uses DR date when present, otherwise inventory `updatedAt`.
 */
export async function buildInventoryReportRows(
  tenantId: string,
  filters: InventoryReportFilters = {},
): Promise<InventoryReportRows> {
  const branchScope =
    filters.branchIds && filters.branchIds.length > 0
      ? { branchId: { in: filters.branchIds } }
      : {};

  const skuTrimmed = filters.sku?.trim();
  const skuScope = skuTrimmed
    ? {
        serialNumber: {
          model: {
            skuCode: { contains: skuTrimmed, mode: "insensitive" as const },
          },
        },
      }
    : {};

  const statusCodes = filters.statusCodes?.filter((c) => c.trim().length > 0);
  const statusScope =
    statusCodes && statusCodes.length > 0
      ? { statusCode: { code: { in: statusCodes } } }
      : {};

  const rows = await prisma.branchInventory.findMany({
    where: {
      tenantId,
      ...branchScope,
      ...skuScope,
      ...statusScope,
    },
    include: {
      statusCode: { select: { code: true, name: true } },
      serialNumber: {
        select: {
          serialNo: true,
          model: { select: { skuCode: true, name: true } },
        },
      },
      branch: {
        select: {
          name: true,
          area: { select: { name: true } },
          branchArea: { select: { name: true } },
          dealer: {
            select: {
              name: true,
              dealerType: { select: { name: true } },
              modeOfPayment: { select: { name: true } },
              dealerArea: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [
      { branch: { name: "asc" } },
      { serialNumber: { serialNo: "asc" } },
    ],
  });

  const deliveries = await findLatestDeliveriesChunked(
    tenantId,
    rows.map((r) => r.serialNumberId),
  );
  const deliveryBySerial = new Map(
    deliveries.map((d) => [d.serialNumberId, d] as const),
  );
  const countRemarks = await findLatestCountRemarks(
    tenantId,
    rows.map((row) => row.serialNumberId),
  );

  const detailRows: InventoryReportCell[][] = [];
  const summaryCounts = new Map<string, number>();

  for (const item of rows) {
    const delivery = deliveryBySerial.get(item.serialNumberId);
    const filterDate = delivery?.deliveryDate ?? item.updatedAt;
    if (!inDateRange(filterDate, filters.from, filters.to)) continue;

    const agingAnchor = delivery?.deliveryDate ?? item.createdAt;
    const dealer = item.branch.dealer;
    const statusLabel = item.statusCode.name ?? item.statusCode.code;
    const sku = item.serialNumber.model.skuCode;
    const branchName = item.branch.name;

    const summaryKey = `${branchName}\u0000${sku}\u0000${statusLabel}`;
    summaryCounts.set(summaryKey, (summaryCounts.get(summaryKey) ?? 0) + 1);

    detailRows.push([
      dealer?.name ?? "",
      branchName,
      dealer?.dealerType?.name ?? "",
      dealer?.modeOfPayment?.name ?? "",
      item.branch.area?.name ?? "",
      dealer?.dealerArea?.name ?? "",
      item.branch.branchArea?.name ?? "",
      item.serialNumber.serialNo,
      sku,
      item.serialNumber.model.name,
      statusLabel,
      delivery?.deliveryNo ?? "",
      formatDate(delivery?.deliveryDate),
      wholeDaysBetween(agingAnchor),
      countRemarks.get(`${item.branchId}\0${item.serialNumberId}`)?.remark ?? "",
    ]);
  }

  const summaryRows = [...summaryCounts.entries()]
    .map(([key, qty]) => {
      const [branch, sku, status] = key.split("\u0000");
      return [branch, sku, status, qty] as InventoryReportCell[];
    })
    .sort((a, b) => {
      const branchCmp = String(a[0]).localeCompare(String(b[0]));
      if (branchCmp !== 0) return branchCmp;
      const skuCmp = String(a[1]).localeCompare(String(b[1]));
      if (skuCmp !== 0) return skuCmp;
      return String(a[2]).localeCompare(String(b[2]));
    });

  return { summaryRows, detailRows };
}

export const inventoryReportService = {
  /**
   * Branch inventory CSV with dealer/branch classification columns and
   * serial validation columns (status, DR#, aging, latest count remark).
   *
   * Kept for unit tests of the sectioned CSV shape; export uses Excel.
   */
  async generateCsv(tenantId: string, filters: InventoryReportFilters = {}) {
    const { summaryRows, detailRows } = await buildInventoryReportRows(
      tenantId,
      filters,
    );
    return buildInventoryReportSectionedCsv(summaryRows, detailRows);
  },

  /**
   * Branch inventory Excel workbook (SUMMARY + DETAIL sheets) with dealer/
   * branch classification and serial validation columns.
   */
  async generateWorkbook(
    tenantId: string,
    filters: InventoryReportFilters = {},
  ): Promise<Buffer> {
    const { summaryRows, detailRows } = await buildInventoryReportRows(
      tenantId,
      filters,
    );
    return buildInventoryReportWorkbook(summaryRows, detailRows);
  },
};
