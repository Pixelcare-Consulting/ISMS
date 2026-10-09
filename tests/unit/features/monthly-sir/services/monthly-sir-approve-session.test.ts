jest.mock("@/lib/database/client", () => ({
  prisma: {
    branch: { findFirst: jest.fn() },
  },
}));
jest.mock("@/features/aors/services/aor.service", () => ({
  aorService: { getBranchIdsForUser: jest.fn() },
}));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));
jest.mock("@/features/monthly-sir/repositories/monthly-sir.repository", () => ({
  monthlySirRepository: {
    findById: jest.fn(),
    claimForReview: jest.fn(),
    finishApproval: jest.fn(),
    finishRejection: jest.fn(),
    releaseReviewClaim: jest.fn(),
  },
}));
jest.mock("@/features/stock-audit/services/stock-audit.service", () => ({
  stockAuditService: {
    createSession: jest.fn(),
    startCounting: jest.fn(),
    ensureExpectedLinesFromStk: jest.fn(),
  },
}));
jest.mock("@/features/monthly-sir/services/monthly-sir.workbook", () => ({
  buildMonthlySirTemplate: jest.fn(),
  buildMonthlySirVarianceWorkbook: jest.fn(),
  parseMonthlySirUpload: jest.fn(),
}));

import { prisma } from "@/lib/database/client";
import { auditService } from "@/features/audit/services/audit.service";
import { monthlySirRepository } from "@/features/monthly-sir/repositories/monthly-sir.repository";
import { monthlySirService } from "@/features/monthly-sir/services/monthly-sir.service";
import { stockAuditService } from "@/features/stock-audit/services/stock-audit.service";

describe("monthlySirService.review approve → session link", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: "branch-1" });
    (monthlySirRepository.findById as jest.Mock).mockResolvedValue({
      id: "req-1",
      branchId: "branch-1",
      status: "pending",
    });
    (monthlySirRepository.claimForReview as jest.Mock).mockResolvedValue({
      count: 1,
    });
    (stockAuditService.createSession as jest.Mock).mockResolvedValue({
      id: "sess-1",
    });
    (stockAuditService.startCounting as jest.Mock).mockResolvedValue(undefined);
    (stockAuditService.ensureExpectedLinesFromStk as jest.Mock).mockResolvedValue(
      { id: "sess-1" },
    );
    (monthlySirRepository.finishApproval as jest.Mock).mockResolvedValue({
      id: "req-1",
      status: "approved",
      stockCountSessionId: "sess-1",
      stockCountSession: { id: "sess-1", sessionNo: "CNT-1", status: "in_progress" },
    });
    (auditService.log as jest.Mock).mockResolvedValue(undefined);
  });

  it("links a stock count session id after approve", async () => {
    const approved = await monthlySirService.review({
      tenantId: "tenant-1",
      userId: "user-1",
      requestId: "req-1",
      decision: "approve",
      unrestricted: true,
    });

    expect(stockAuditService.createSession).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      branchId: "branch-1",
    });
    expect(stockAuditService.startCounting).toHaveBeenCalledWith(
      "tenant-1",
      "user-1",
      "sess-1",
    );
    expect(monthlySirRepository.finishApproval).toHaveBeenCalledWith(
      "tenant-1",
      "req-1",
      expect.objectContaining({ stockCountSessionId: "sess-1" }),
    );
    expect(approved.stockCountSessionId).toBe("sess-1");
  });

  it("releases the review claim when session create fails", async () => {
    (stockAuditService.createSession as jest.Mock).mockResolvedValue(null);

    await expect(
      monthlySirService.review({
        tenantId: "tenant-1",
        userId: "user-1",
        requestId: "req-1",
        decision: "approve",
        unrestricted: true,
      }),
    ).rejects.toThrow("Count session could not be created");

    expect(monthlySirRepository.releaseReviewClaim).toHaveBeenCalledWith(
      "tenant-1",
      "req-1",
    );
    expect(monthlySirRepository.finishApproval).not.toHaveBeenCalled();
  });
});
