jest.mock("@/lib/database/client", () => ({
  prisma: { sapIntegrationJob: { findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() } },
}));

import { prisma } from "@/lib/database/client";
import { sapIntegrationRepository } from "@/features/sap/repositories/sap-integration.repository";

const jobs = prisma.sapIntegrationJob as unknown as { findMany: jest.Mock; updateMany: jest.Mock; count: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  jobs.findMany.mockResolvedValue([{ id: "j1", attemptCount: 0, maxAttempts: 5, status: "pending" }]);
  jobs.updateMany.mockResolvedValue({ count: 1 });
});

describe("sapIntegrationRepository.claimPendingJobsSafe", () => {
  it("claims only the referenced job when a target is given, ignoring the retry delay", async () => {
    const claimed = await sapIntegrationRepository.claimPendingJobsSafe("t1", 1, {
      referenceType: "DeliveryReturnRequest",
      referenceId: "r1",
    });

    const where = jobs.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      tenantId: "t1",
      status: { in: ["pending", "failed"] },
      referenceType: "DeliveryReturnRequest",
      referenceId: "r1",
    });
    expect(jobs.findMany.mock.calls[0][0].take).toBe(1);
    expect(claimed.map((job) => job.id)).toEqual(["j1"]);
  });

  it("claims the oldest due jobs of the tenant without a target", async () => {
    await sapIntegrationRepository.claimPendingJobsSafe("t1", 10);
    const where = jobs.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("referenceId");
    expect(where.OR).toEqual([{ nextRetryAt: null }, { nextRetryAt: { lte: expect.any(Date) } }]);
  });
});

describe("sapIntegrationRepository.requeueByReference", () => {
  it("resets failed, dead-letter and abandoned processing jobs, keeping lastError", async () => {
    const before = Date.now();
    await sapIntegrationRepository.requeueByReference("t1", "DeliveryReturnRequest", "r1");

    const { where, data } = jobs.updateMany.mock.calls[0][0];
    expect(data).toEqual({ status: "pending", nextRetryAt: null, attemptCount: 0 });
    expect(where).toMatchObject({ tenantId: "t1", referenceType: "DeliveryReturnRequest", referenceId: "r1" });
    expect(where.OR[0]).toEqual({ status: { in: ["pending", "failed", "dead_letter"] } });
    expect(where.OR[1].status).toBe("processing");
    const cutoff = (where.OR[1].updatedAt.lt as Date).getTime();
    expect(before - cutoff).toBeGreaterThanOrEqual(10 * 60 * 1000 - 50);
    expect(before - cutoff).toBeLessThan(10 * 60 * 1000 + 1000);
  });
});

describe("sapIntegrationRepository.deadLetterByReference", () => {
  it("retires only pending and failed jobs of the record, on the given transaction", async () => {
    const tx = { sapIntegrationJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await sapIntegrationRepository.deadLetterByReference(
      "t1",
      "DeliveryTransfer",
      "tr1",
      "Unit transfer cancelled in ISMS",
      tx as never,
    );
    expect(jobs.updateMany).not.toHaveBeenCalled();
    expect(tx.sapIntegrationJob.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        referenceType: "DeliveryTransfer",
        referenceId: "tr1",
        status: { in: ["pending", "failed"] },
      },
      data: { status: "dead_letter", lastError: "Unit transfer cancelled in ISMS", nextRetryAt: null },
    });
  });
});

describe("sapIntegrationRepository.countInFlight", () => {
  it("counts processing jobs updated within the last 10 minutes only", async () => {
    jobs.count.mockResolvedValue(0);
    const before = Date.now();
    await sapIntegrationRepository.countInFlight("t1", "DeliveryReturnRequest", "r1");
    const { where } = jobs.count.mock.calls[0][0];
    expect(where).toMatchObject({
      tenantId: "t1",
      referenceType: "DeliveryReturnRequest",
      referenceId: "r1",
      status: "processing",
    });
    const cutoff = (where.updatedAt.gte as Date).getTime();
    expect(before - cutoff).toBeGreaterThanOrEqual(10 * 60 * 1000 - 50);
    expect(before - cutoff).toBeLessThan(10 * 60 * 1000 + 1000);
  });
});
