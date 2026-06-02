import { prisma } from "@/lib/database/client";
import type { Prisma, SapIntegrationJobType } from "@prisma/client";
import {
  resolvePagination,
  toPaginatedResult,
} from "@/lib/shared/pagination";

export const sapIntegrationRepository = {
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
  ) {
    const { limit, page, skip } = resolvePagination(pagination);
    const where: Prisma.SapIntegrationJobWhereInput = {
      tenantId,
      ...(pagination?.status ? { status: pagination.status as Prisma.EnumSapIntegrationJobStatusFilter["equals"] } : {}),
    };

    return Promise.all([
      prisma.sapIntegrationJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.sapIntegrationJob.count({ where }),
    ]).then(([items, total]) => toPaginatedResult(items, total, page, limit));
  },

  claimPendingJobs(tenantId: string, limit = 10) {
    return this.claimPendingJobsSafe(tenantId, limit);
  },

  async claimPendingJobsSafe(tenantId: string, limit = 10) {
    const now = new Date();
    const candidates = await prisma.sapIntegrationJob.findMany({
      where: {
        tenantId,
        status: { in: ["pending", "failed"] },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
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
