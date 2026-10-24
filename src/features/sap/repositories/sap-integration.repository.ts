import { prisma } from "@/lib/database/client";
import type { Prisma, SapIntegrationJobType } from "@prisma/client";
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
    default:
      return { createdAt: dir };
  }
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
    pagination?: { page?: number; status?: string },
    sort?: { field?: SapJobListSort; dir?: SapJobListSortDir },
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.SapIntegrationJobWhereInput = {
      tenantId,
      ...(pagination?.status ? { status: pagination.status as Prisma.EnumSapIntegrationJobStatusFilter["equals"] } : {}),
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
