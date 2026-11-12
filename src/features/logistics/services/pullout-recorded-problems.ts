import { prisma } from "@/lib/database/client";

/**
 * The problem description already recorded for each unit, shown read-only when picking
 * pull-out units. It comes from the newest of: an approved defect tag in Branch Inventory
 * (its reason holds the chosen problem names) or a sales return that was not rejected.
 * Units with neither are left out of the map.
 */
export async function recordedProblemsBySerial(
  tenantId: string,
  serialNumberIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(serialNumberIds)];
  if (ids.length === 0) return new Map();

  const [defects, returns] = await Promise.all([
    prisma.branchDefectReport.findMany({
      where: { tenantId, serialNumberId: { in: ids }, status: "approved" },
      select: { serialNumberId: true, reason: true, reportedAt: true, decidedAt: true },
    }),
    prisma.branchReturnRequest.findMany({
      where: {
        tenantId,
        status: { not: "rejected" },
        OR: [
          { saleDetail: { serialNumberId: { in: ids } } },
          // Older requests name only the sale, not the line.
          { saleDetailId: null, sale: { details: { some: { serialNumberId: { in: ids } } } } },
        ],
      },
      select: {
        createdAt: true,
        problemDescriptionText: true,
        problemDescription: { select: { name: true } },
        saleDetail: { select: { serialNumberId: true } },
        sale: { select: { details: { select: { serialNumberId: true } } } },
      },
    }),
  ]);

  const wanted = new Set(ids);
  const newest = new Map<string, { at: Date; text: string }>();
  const offer = (serialNumberId: string | null | undefined, at: Date, text: string | null | undefined) => {
    const trimmed = text?.trim();
    if (!serialNumberId || !wanted.has(serialNumberId) || !trimmed) return;
    const current = newest.get(serialNumberId);
    if (!current || at > current.at) newest.set(serialNumberId, { at, text: trimmed });
  };

  for (const report of defects) {
    offer(report.serialNumberId, report.decidedAt ?? report.reportedAt, report.reason);
  }
  for (const request of returns) {
    const text = request.problemDescriptionText ?? request.problemDescription?.name;
    const serialIds = request.saleDetail
      ? [request.saleDetail.serialNumberId]
      : request.sale.details.map((detail) => detail.serialNumberId);
    for (const serialNumberId of serialIds) offer(serialNumberId, request.createdAt, text);
  }

  return new Map([...newest].map(([serialNumberId, row]) => [serialNumberId, row.text]));
}
