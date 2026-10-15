import { inventoryRepository } from "@/features/inventory/repositories/inventory.repository";
import { wholeDaysBetween } from "@/features/inventory/utils/sku-series";
import { prisma } from "@/lib/database/client";
import { buildCsvContent } from "@/lib/shared/csv";

export interface InventoryReportFilters {
  from?: Date;
  to?: Date;
  /** Empty / omitted = no branch restriction (tenant-wide). */
  branchIds?: string[];
}

const HEADERS = [
  "DEALER NAME",
  "BRANCH NAME",
  "DEALER TYPE",
  "MODE OF PAYMENT",
  "AREA",
  "DEALER AREA",
  "BRANCH AREA",
  "SERIAL NO",
  "SKU",
  "MODEL",
  "STATUS",
  "DR#",
  "DR DATE",
  "AGING DAYS",
];

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
    ReturnType<typeof inventoryRepository.findLatestAcceptedDeliveries>
  > = [];

  for (let i = 0; i < serialNumberIds.length; i += DELIVERY_LOOKUP_CHUNK) {
    const chunk = serialNumberIds.slice(i, i + DELIVERY_LOOKUP_CHUNK);
    const part = await inventoryRepository.findLatestAcceptedDeliveries(
      tenantId,
      chunk,
    );
    results.push(...part);
  }

  return results;
}

export const inventoryReportService = {
  /**
   * Branch inventory CSV with dealer/branch classification columns and
   * serial validation columns (status, DR#, aging). Date filter uses DR date
   * when present, otherwise inventory `updatedAt`.
   */
  async generateCsv(tenantId: string, filters: InventoryReportFilters = {}) {
    const branchScope =
      filters.branchIds && filters.branchIds.length > 0
        ? { branchId: { in: filters.branchIds } }
        : {};

    const rows = await prisma.branchInventory.findMany({
      where: {
        tenantId,
        ...branchScope,
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

    const csvRows: (string | number | null | undefined)[][] = [];

    for (const item of rows) {
      const delivery = deliveryBySerial.get(item.serialNumberId);
      const filterDate = delivery?.deliveryDate ?? item.updatedAt;
      if (!inDateRange(filterDate, filters.from, filters.to)) continue;

      const agingAnchor = delivery?.deliveryDate ?? item.createdAt;
      const dealer = item.branch.dealer;

      csvRows.push([
        dealer?.name ?? "",
        item.branch.name,
        dealer?.dealerType?.name ?? "",
        dealer?.modeOfPayment?.name ?? "",
        item.branch.area?.name ?? "",
        dealer?.dealerArea?.name ?? "",
        item.branch.branchArea?.name ?? "",
        item.serialNumber.serialNo,
        item.serialNumber.model.skuCode,
        item.serialNumber.model.name,
        item.statusCode.name ?? item.statusCode.code,
        delivery?.deliveryNo ?? "",
        formatDate(delivery?.deliveryDate),
        wholeDaysBetween(agingAnchor),
      ]);
    }

    return buildCsvContent(HEADERS, csvRows);
  },
};
