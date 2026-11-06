import type {
  InventoryApprovalAttachment,
  InventoryApprovalRow,
  InventoryApprovalSource,
  InventoryApprovalStatus,
} from "@/features/inventory-approvals/constants/inventory-approval-display";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma/client";
import { buildDateFilter } from "@/lib/shared/date-filter";
import { resolvePagination, toPaginatedResult } from "@/lib/shared/pagination";

export interface ListInventoryApprovalsInput {
  page?: number;
  limit?: number;
  status?: InventoryApprovalStatus;
  sourceType?: InventoryApprovalSource;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}

const userSelect = { select: { name: true, email: true } } as const;

function userLabel(user: { name: string | null; email: string } | null): string | null {
  if (!user) return null;
  return user.name?.trim() || user.email;
}

function buildWhere(tenantId: string, input: ListInventoryApprovalsInput): Prisma.InventoryApprovalWhereInput {
  const q = input.q?.trim();
  const contains = q ? ({ contains: q, mode: "insensitive" } as const) : undefined;
  const updatedAt = buildDateFilter(input.dateFrom, input.dateTo);
  return {
    tenantId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.sourceType ? { sourceType: input.sourceType } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(contains
      ? {
          OR: [
            { sourceNo: contains },
            { serialNumber: { serialNo: contains } },
            { remarks: contains },
            { problemDescription: contains },
          ],
        }
      : {}),
  };
}

/** Read at list time, not copied to the row, because files can be added after the request. */
async function loadAttachments(
  tenantId: string,
  rows: readonly { sourceType: string; sourceId: string }[],
): Promise<Map<string, InventoryApprovalAttachment[]>> {
  const idsOf = (sourceType: string) => [
    ...new Set(rows.filter((row) => row.sourceType === sourceType).map((row) => row.sourceId)),
  ];
  const pulloutIds = idsOf("PULLOUT");
  const reportIds = idsOf("DEFECT_REPORT");
  const [pulloutFiles, defectPhotos] = await Promise.all([
    pulloutIds.length > 0
      ? prisma.branchPulloutAttachment.findMany({
          where: { pulloutId: { in: pulloutIds }, pullout: { tenantId } },
          select: { id: true, pulloutId: true, fileName: true },
          orderBy: { createdAt: "asc" },
        })
      : [],
    reportIds.length > 0
      ? prisma.branchDefectReportPhoto.findMany({
          where: { reportId: { in: reportIds }, report: { tenantId } },
          select: { id: true, reportId: true, fileName: true, storagePath: true },
          orderBy: { sortOrder: "asc" },
        })
      : [],
  ]);

  const bySource = new Map<string, InventoryApprovalAttachment[]>();
  const add = (sourceId: string, attachment: InventoryApprovalAttachment) => {
    bySource.set(sourceId, [...(bySource.get(sourceId) ?? []), attachment]);
  };
  for (const file of pulloutFiles) {
    add(file.pulloutId, {
      id: file.id,
      name: file.fileName,
      href: `/api/logistics/pullout-attachments/${file.id}`,
    });
  }
  for (const photo of defectPhotos) {
    add(photo.reportId, {
      id: photo.id,
      name: photo.fileName,
      href: `/api/inventory/defect-photos?path=${encodeURIComponent(photo.storagePath)}`,
    });
  }
  return bySource;
}

export const inventoryApprovalRepository = {
  async list(tenantId: string, input: ListInventoryApprovalsInput) {
    const { page, limit, skip, take } = resolvePagination(input);
    const where = buildWhere(tenantId, input);

    const [rows, total] = await Promise.all([
      prisma.inventoryApproval.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take,
        select: {
          id: true,
          sourceType: true,
          sourceId: true,
          sourceNo: true,
          step: true,
          status: true,
          remarks: true,
          problemDescription: true,
          createdAt: true,
          decidedAt: true,
          serialNumber: {
            select: { serialNo: true, model: { select: { skuCode: true, name: true } } },
          },
          requestedBy: userSelect,
          decidedBy: userSelect,
        },
      }),
      prisma.inventoryApproval.count({ where }),
    ]);

    const attachments = await loadAttachments(tenantId, rows);
    const items: InventoryApprovalRow[] = rows.map((row) => ({
      id: row.id,
      serialNo: row.serialNumber.serialNo,
      modelLabel: [row.serialNumber.model.skuCode, row.serialNumber.model.name].filter(Boolean).join(" · "),
      sourceType: row.sourceType,
      sourceNo: row.sourceNo,
      step: row.step,
      status: row.status,
      requestedBy: userLabel(row.requestedBy),
      requestedAt: row.createdAt.toISOString(),
      decidedBy: userLabel(row.decidedBy),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      remarks: row.remarks,
      problemDescription: row.problemDescription,
      attachments: attachments.get(row.sourceId) ?? [],
    }));

    return toPaginatedResult(items, total, page, limit);
  },
};
