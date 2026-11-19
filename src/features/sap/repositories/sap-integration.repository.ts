import type { Prisma, SapIntegrationJobType } from "@prisma/client";

import {
  emptySapJobStatusCounts,
  SAP_REFERENCE_TYPES,
  sapQueueViewStatuses,
  type SapJobStatusCounts,
  type SapQueueView,
} from "@/features/sap/constants/sap-job-types";
import { prisma } from "@/lib/database/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";

export type SapJobListSort =
  | "jobType"
  | "status"
  | "referenceId"
  | "sapDocNum"
  | "attempts"
  | "createdAt";
export type SapJobListSortDir = "asc" | "desc";

function sapJobPrismaOrderBy(
  field: SapJobListSort,
  dir: SapJobListSortDir,
): Prisma.SapIntegrationJobOrderByWithRelationInput {
  switch (field) {
    case "jobType":
      return { jobType: dir };
    case "status":
      return { status: dir };
    case "referenceId":
      return { referenceId: dir };
    case "sapDocNum":
      return { sapDocRef: dir };
    case "attempts":
      return { attemptCount: dir };
    case "createdAt":
      return { createdAt: dir };
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

export interface SapJobListQuery {
  page?: number;
  limit?: number;
  /** Single status. Ignored when `view` is set. */
  status?: string;
  /** Card group: waiting, needs attention, or sent. */
  view?: SapQueueView;
  /** Matches the ISMS document number or the SAP number across the whole queue. */
  q?: string;
}

const DOCUMENT_NUMBER_KEYS = ["orderNumber", "requestNo", "transferNo", "periodLabel"] as const;

function searchWhere(q?: string): Prisma.SapIntegrationJobWhereInput {
  const term = q?.trim();
  if (!term) return {};
  const terms = term.toUpperCase() === term ? [term] : [term, term.toUpperCase()];
  return {
    OR: [
      { sapDocRef: { contains: term, mode: "insensitive" } },
      ...terms.flatMap((value) =>
        DOCUMENT_NUMBER_KEYS.map((key) => ({
          payload: { path: [key], string_contains: value },
        })),
      ),
    ],
  };
}

function personName(user: { name: string | null; email: string } | null): string | null {
  const name = user?.name?.trim();
  if (name) return name;
  const email = user?.email?.trim();
  return email || null;
}

function statusWhere(query?: SapJobListQuery): Prisma.SapIntegrationJobWhereInput {
  if (query?.view) {
    return { status: { in: sapQueueViewStatuses(query.view) } };
  }
  if (query?.status) {
    return {
      status: query.status as Prisma.EnumSapIntegrationJobStatusFilter["equals"],
    };
  }
  return {};
}

/** One record's job, e.g. { referenceType: "DeliveryReturnRequest", referenceId }. */
export interface SapJobTarget {
  referenceType: string;
  referenceId: string;
}

/** A job still `processing` after this long is treated as abandoned by its worker. */
const STUCK_PROCESSING_MS = 10 * 60 * 1000;

/** The client or an open transaction: lets a caller retire a job atomically with its own update. */
type JobDb = Pick<typeof prisma, "sapIntegrationJob">;

export const sapIntegrationRepository = {
  findById(tenantId: string, id: string) {
    return prisma.sapIntegrationJob.findFirst({ where: { id, tenantId } });
  },

  findByIdempotencyKey(tenantId: string, idempotencyKey: string) {
    return prisma.sapIntegrationJob.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
  },

  createJob(data: {
    tenantId: string;
    jobType: SapIntegrationJobType;
    idempotencyKey: string;
    payload: Prisma.InputJsonValue;
    referenceType?: string;
    referenceId?: string;
  }) {
    return prisma.sapIntegrationJob.create({
      data: {
        tenantId: data.tenantId,
        jobType: data.jobType,
        idempotencyKey: data.idempotencyKey,
        payload: data.payload,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        status: "pending",
      },
    });
  },

  listJobs(
    tenantId: string,
    pagination?: SapJobListQuery,
    sort?: { field?: SapJobListSort; dir?: SapJobListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.SapIntegrationJobWhereInput = {
      tenantId,
      ...statusWhere(pagination),
      ...searchWhere(pagination?.q),
    };
    const orderBy = sort?.field
      ? sapJobPrismaOrderBy(sort.field, sort.dir ?? "desc")
      : { createdAt: "desc" as const };

    return Promise.all([
      prisma.sapIntegrationJob.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.sapIntegrationJob.count({ where }),
    ]).then(([items, total]) => toPaginatedResult(items, total, page, limit));
  },

  /** Whole-queue counts for the status cards. Not limited to the current page. */
  async countByStatus(tenantId: string): Promise<SapJobStatusCounts> {
    const groups = await prisma.sapIntegrationJob.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { id: true },
    });
    const counts = emptySapJobStatusCounts();
    for (const group of groups) {
      counts[group.status] = group._count.id;
    }
    return counts;
  },

  /**
   * Name of the person who sent this job, and who queued it when that is someone else.
   * The job row does not store a user. Names come from this tenant's audit log.
   */
  async findJobPeople(
    tenantId: string,
    jobId: string,
  ): Promise<{ sentBy: string | null; queuedBy: string | null }> {
    const job = await prisma.sapIntegrationJob.findFirst({
      where: { id: jobId, tenantId },
      select: { id: true, referenceType: true, referenceId: true },
    });
    if (!job) return { sentBy: null, queuedBy: null };

    const or: Prisma.AuditLogWhereInput[] = [
      { entityType: "SapIntegrationJob", entityId: job.id },
      { metadata: { path: ["jobId"], equals: job.id } },
    ];
    if (job.referenceType && job.referenceId) {
      or.push({
        entityType: job.referenceType,
        entityId: job.referenceId,
        OR: [
          { action: { startsWith: "sap." } },
          // Service-center posts record the sender here. They do not write a sap.*_processed row.
          { action: "sc_order.approved" },
        ],
      });
    }

    const logs = await prisma.auditLog.findMany({
      where: { tenantId, OR: or },
      orderBy: { createdAt: "asc" },
      select: { action: true, user: { select: { name: true, email: true } } },
    });

    let sentBy: string | null = null;
    let queuedBy: string | null = null;
    for (const log of logs) {
      const name = personName(log.user);
      if (!name) continue;
      if (log.action.endsWith("_processed") || log.action === "sc_order.approved") {
        sentBy = name;
      } else if (!queuedBy) queuedBy = name;
    }
    return { sentBy, queuedBy };
  },

  /**
   * SAP codes and document keys stored on the record this job posted.
   * The job payload often only keeps the ISMS number.
   */
  async findJobSupportFields(
    tenantId: string,
    jobId: string,
  ): Promise<SapSupportField[]> {
    const job = await prisma.sapIntegrationJob.findFirst({
      where: { id: jobId, tenantId },
      select: { referenceType: true, referenceId: true },
    });
    if (!job?.referenceType || !job.referenceId) return [];
    return supportFieldsForReference(tenantId, job.referenceType, job.referenceId);
  },

  claimPendingJobs(tenantId: string, limit = 10) {
    return this.claimPendingJobsSafe(tenantId, limit);
  },

  /**
   * With `target`, only that record's job is claimed, whatever the backlog and
   * retry delay: used to run one document inline right after the user acts.
   */
  async claimPendingJobsSafe(tenantId: string, limit = 10, target?: SapJobTarget) {
    const now = new Date();
    const candidates = await prisma.sapIntegrationJob.findMany({
      where: {
        tenantId,
        status: { in: ["pending", "failed"] },
        ...(target
          ? { referenceType: target.referenceType, referenceId: target.referenceId }
          : { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] }),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    // Claim each job atomically: only the worker whose conditional updateMany
    // actually flips the row out of pending/failed owns it. A concurrent worker
    // sees count === 0 and skips, preventing double-processing.
    const claimed: typeof candidates = [];
    for (const job of candidates) {
      if (job.attemptCount >= job.maxAttempts) continue;
      const result = await prisma.sapIntegrationJob.updateMany({
        where: { id: job.id, status: { in: ["pending", "failed"] } },
        data: { status: "processing", attemptCount: { increment: 1 } },
      });
      if (result.count === 1) {
        claimed.push({ ...job, status: "processing", attemptCount: job.attemptCount + 1 });
      }
    }
    return claimed;
  },

  markCompleted(jobId: string, sapDocRef: string) {
    return prisma.sapIntegrationJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        sapDocRef,
        processedAt: new Date(),
        lastError: null,
      },
    });
  },

  /**
   * Puts a stuck job for one record back in the queue for a manual retry. The
   * last error is kept until the next attempt replaces it. A completed job, or
   * one processing for less than 10 minutes, is left alone.
   */
  requeueByReference(tenantId: string, referenceType: string, referenceId: string) {
    const stuckBefore = new Date(Date.now() - STUCK_PROCESSING_MS);
    return prisma.sapIntegrationJob.updateMany({
      where: {
        tenantId,
        referenceType,
        referenceId,
        OR: [
          { status: { in: ["pending", "failed", "dead_letter"] } },
          // A worker that died mid-run leaves the job processing forever.
          { status: "processing", updatedAt: { lt: stuckBefore } },
        ],
      },
      data: { status: "pending", nextRetryAt: null, attemptCount: 0 },
    });
  },

  /**
   * Stops a record's queued job for good when the record is cancelled in ISMS:
   * pending and failed jobs become dead_letter, so no worker claims them. Run it
   * in the caller's transaction, before `countInFlight`.
   */
  deadLetterByReference(
    tenantId: string,
    referenceType: string,
    referenceId: string,
    reason: string,
    db: JobDb = prisma,
  ) {
    return db.sapIntegrationJob.updateMany({
      where: { tenantId, referenceType, referenceId, status: { in: ["pending", "failed"] } },
      data: { status: "dead_letter", lastError: reason, nextRetryAt: null },
    });
  },

  /** Jobs of a record a live worker is posting right now (not abandoned ones). */
  countInFlight(tenantId: string, referenceType: string, referenceId: string, db: JobDb = prisma) {
    return db.sapIntegrationJob.count({
      where: {
        tenantId,
        referenceType,
        referenceId,
        status: "processing",
        updatedAt: { gte: new Date(Date.now() - STUCK_PROCESSING_MS) },
      },
    });
  },

  markFailed(jobId: string, error: string, nextRetryAt?: Date, deadLetter = false) {
    return prisma.sapIntegrationJob.update({
      where: { id: jobId },
      data: {
        status: deadLetter ? "dead_letter" : "failed",
        lastError: error,
        nextRetryAt: deadLetter ? null : nextRetryAt,
      },
    });
  },
};

export interface SapSupportField {
  label: string;
  value: string;
}

function supportField(
  label: string,
  value: string | number | null | undefined,
): SapSupportField | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? { label, value: text } : null;
}

function supportFields(fields: Array<SapSupportField | null>): SapSupportField[] {
  return fields.filter((field): field is SapSupportField => field !== null);
}

function supportDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

async function supportFieldsForReference(
  tenantId: string,
  referenceType: string,
  referenceId: string,
): Promise<SapSupportField[]> {
  switch (referenceType) {
    case SAP_REFERENCE_TYPES.ServiceCenterOrder: {
      const order = await prisma.serviceCenterOrder.findFirst({
        where: { id: referenceId, tenantId },
        select: {
          status: true,
          poNumber: true,
          projectCode: true,
          sapCardCode: true,
          sapWarehouseCode: true,
          sapBranchCode: true,
          sapDepartmentCode: true,
          sapCogsBranchCode: true,
          sapDocEntry: true,
          sapDocNum: true,
          serviceCenter: { select: { name: true, sapCode: true } },
        },
      });
      if (!order) return [];
      return supportFields([
        supportField("Service center", order.serviceCenter.name),
        supportField("Service center code", order.serviceCenter.sapCode),
        supportField("Order status", order.status),
        supportField("PO number", order.poNumber),
        supportField("Project code", order.projectCode),
        supportField("Card code", order.sapCardCode),
        supportField("Warehouse code", order.sapWarehouseCode),
        supportField("Branch code", order.sapBranchCode),
        supportField("Department code", order.sapDepartmentCode),
        supportField("COGS branch code", order.sapCogsBranchCode),
        supportField("SAP DocEntry", order.sapDocEntry),
        supportField("SAP DocNum", order.sapDocNum),
      ]);
    }
    case SAP_REFERENCE_TYPES.BranchOrder: {
      const order = await prisma.branchOrder.findFirst({
        where: { id: referenceId, tenantId },
        select: {
          status: true,
          orderType: true,
          sapDocType: true,
          sapCardCode: true,
          sapDocEntry: true,
          sapDocNum: true,
          branch: { select: { name: true, sapCode: true } },
        },
      });
      if (!order) return [];
      return supportFields([
        supportField("Branch", order.branch.name),
        supportField("Branch code", order.branch.sapCode),
        supportField("Order status", order.status),
        supportField("Order type", order.orderType),
        supportField("SAP doc type", order.sapDocType),
        supportField("Card code", order.sapCardCode),
        supportField("SAP DocEntry", order.sapDocEntry),
        supportField("SAP DocNum", order.sapDocNum),
      ]);
    }
    case SAP_REFERENCE_TYPES.DeliveryReturnRequest: {
      const request = await prisma.deliveryReturnRequest.findFirst({
        where: { id: referenceId, tenantId },
        select: {
          status: true,
          reason: true,
          sapDocEntry: true,
          sapDocNo: true,
          sapDocDate: true,
          sapError: true,
          delivery: { select: { deliveryNo: true, drNo: true, sapDocEntry: true, sapDocNo: true } },
        },
      });
      if (!request) return [];
      return supportFields([
        supportField("Return status", request.status),
        supportField("Reason", request.reason),
        supportField("Delivery", request.delivery.deliveryNo),
        supportField("Delivery receipt", request.delivery.drNo),
        supportField("Delivery SAP DocEntry", request.delivery.sapDocEntry),
        supportField("Delivery SAP number", request.delivery.sapDocNo),
        supportField("SAP DocEntry", request.sapDocEntry),
        supportField("SAP DocNum", request.sapDocNo),
        supportField("SAP date", supportDate(request.sapDocDate)),
        supportField("SAP error", request.sapError),
      ]);
    }
    case SAP_REFERENCE_TYPES.DeliveryTransfer: {
      const transfer = await prisma.deliveryTransfer.findFirst({
        where: { id: referenceId, tenantId },
        select: {
          status: true,
          sapDocEntry: true,
          sapDocNo: true,
          sapDocDate: true,
          sapError: true,
          releaseBranch: { select: { name: true, sapCode: true } },
          receiveBranch: { select: { name: true, sapCode: true } },
          releaseWarehouse: { select: { code: true } },
          receiveWarehouse: { select: { code: true } },
        },
      });
      if (!transfer) return [];
      return supportFields([
        supportField("Transfer status", transfer.status),
        supportField("From branch", transfer.releaseBranch?.name),
        supportField("From branch code", transfer.releaseBranch?.sapCode),
        supportField("From warehouse", transfer.releaseWarehouse?.code),
        supportField("To branch", transfer.receiveBranch?.name),
        supportField("To branch code", transfer.receiveBranch?.sapCode),
        supportField("To warehouse", transfer.receiveWarehouse?.code),
        supportField("SAP DocEntry", transfer.sapDocEntry),
        supportField("SAP DocNum", transfer.sapDocNo),
        supportField("SAP date", supportDate(transfer.sapDocDate)),
        supportField("SAP error", transfer.sapError),
      ]);
    }
    case SAP_REFERENCE_TYPES.BranchDelivery: {
      const delivery = await prisma.branchDelivery.findFirst({
        where: { id: referenceId, tenantId },
        select: {
          deliveryNo: true,
          drNo: true,
          sapDocRef: true,
          sapDocEntry: true,
          sapDocNo: true,
          drDate: true,
          waybillNo: true,
          courierName: true,
          branch: { select: { name: true, sapCode: true } },
          sourceWarehouse: { select: { code: true } },
        },
      });
      if (!delivery) return [];
      return supportFields([
        supportField("Delivery", delivery.deliveryNo),
        supportField("Branch", delivery.branch.name),
        supportField("Branch code", delivery.branch.sapCode),
        supportField("Source warehouse", delivery.sourceWarehouse?.code),
        supportField("Delivery receipt", delivery.drNo),
        supportField("SAP doc ref", delivery.sapDocRef),
        supportField("SAP DocEntry", delivery.sapDocEntry),
        supportField("SAP DocNum", delivery.sapDocNo),
        supportField("SAP date", supportDate(delivery.drDate)),
        supportField("Waybill", delivery.waybillNo),
        supportField("Courier", delivery.courierName),
      ]);
    }
    case SAP_REFERENCE_TYPES.StockCountSession: {
      const session = await prisma.stockCountSession.findFirst({
        where: { id: referenceId, tenantId },
        select: {
          sessionNo: true,
          status: true,
          branch: { select: { name: true, sapCode: true } },
        },
      });
      if (!session) return [];
      return supportFields([
        supportField("Count session", session.sessionNo),
        supportField("Count status", session.status),
        supportField("Branch", session.branch.name),
        supportField("Branch code", session.branch.sapCode),
      ]);
    }
    case SAP_REFERENCE_TYPES.StockVariance:
      return [];
    default:
      return [];
  }
}
