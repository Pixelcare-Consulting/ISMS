jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));
jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
  signOutServer: jest.fn(),
}));
jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchInventory: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/features/aors/services/aor.service", () => ({
  aorService: { getBranchIdsForUser: jest.fn() },
}));
jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));
jest.mock("@/features/inventory/repositories/defect.repository", () => ({
  defectRepository: {
    findOpenPendingByBranchInventoryId: jest.fn(),
    createReportWithPhotos: jest.fn(),
    writeDefectHistory: jest.fn(),
    findById: jest.fn(),
    closeReport: jest.fn(),
  },
}));
jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: { requireCodeId: jest.fn() },
}));

import { aorService } from "@/features/aors/services/aor.service";
import { auditService } from "@/features/audit/services/audit.service";
import { defectRepository } from "@/features/inventory/repositories/defect.repository";
import { defectService } from "@/features/inventory/services/defect.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { prisma } from "@/lib/database/client";

const findInventory = prisma.branchInventory.findFirst as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;
const getBranchIds = aorService.getBranchIdsForUser as jest.Mock;

const baseInventory = {
  id: "inv-1",
  branchId: "branch-1",
  serialNumberId: "sn-1",
  statusCode: { code: "STK" },
  serialNumber: { id: "sn-1", serialNo: "SN-100", modelId: "model-1" },
  branch: { id: "branch-1", name: "Branch Alpha" },
};

const pendingReport = {
  id: "report-1",
  status: "pending_inspection",
  branchId: "branch-1",
  branchInventoryId: "inv-1",
  serialNumberId: "sn-1",
  serialNumber: { serialNo: "SN-100" },
};

beforeEach(() => {
  jest.clearAllMocks();
  getBranchIds.mockResolvedValue(["branch-1"]);
  (auditService.log as jest.Mock).mockResolvedValue(undefined);
  (defectRepository.writeDefectHistory as jest.Mock).mockResolvedValue(undefined);
});

describe("defectService.reportDefect", () => {
  it("creates pending report without changing inventory status", async () => {
    findInventory.mockResolvedValue(baseInventory);
    (defectRepository.findOpenPendingByBranchInventoryId as jest.Mock).mockResolvedValue(
      null,
    );
    (defectRepository.createReportWithPhotos as jest.Mock).mockResolvedValue({
      id: "report-1",
    });

    const report = await defectService.reportDefect({
      tenantId: "t1",
      actorUserId: "user-1",
      permissions: ["inventory.view"],
      branchInventoryId: "inv-1",
      reason: "Screen crack",
    });

    expect(report.id).toBe("report-1");
    expect(transaction).not.toHaveBeenCalled();
    expect(defectRepository.createReportWithPhotos).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        branchInventoryId: "inv-1",
        reason: "Screen crack",
      }),
    );
    expect(defectRepository.writeDefectHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending_inspection" }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "inventory.defect_reported" }),
    );
  });

  it("rejects when unit is not STK", async () => {
    findInventory.mockResolvedValue({
      ...baseInventory,
      statusCode: { code: "DEF" },
    });

    await expect(
      defectService.reportDefect({
        tenantId: "t1",
        actorUserId: "user-1",
        permissions: ["inventory.view"],
        branchInventoryId: "inv-1",
        reason: "Already defective",
      }),
    ).rejects.toThrow(/Only stock \(STK\)/);

    expect(defectRepository.createReportWithPhotos).not.toHaveBeenCalled();
  });

  it("rejects duplicate pending inspection", async () => {
    findInventory.mockResolvedValue(baseInventory);
    (defectRepository.findOpenPendingByBranchInventoryId as jest.Mock).mockResolvedValue(
      { id: "open-1" },
    );

    await expect(
      defectService.reportDefect({
        tenantId: "t1",
        actorUserId: "user-1",
        permissions: ["inventory.view"],
        branchInventoryId: "inv-1",
        reason: "Duplicate",
      }),
    ).rejects.toThrow(/already has a pending defect inspection/);
  });

  it("enforces AOR for reporters", async () => {
    findInventory.mockResolvedValue(baseInventory);
    getBranchIds.mockResolvedValue(["other-branch"]);

    await expect(
      defectService.reportDefect({
        tenantId: "t1",
        actorUserId: "user-1",
        permissions: ["inventory.view"],
        branchInventoryId: "inv-1",
        reason: "Out of scope",
      }),
    ).rejects.toThrow(/area of responsibility/);
  });
});

describe("defectService.approveDefect", () => {
  beforeEach(() => {
    (defectRepository.findById as jest.Mock).mockResolvedValue(pendingReport);
    (reasonStatusService.requireCodeId as jest.Mock).mockResolvedValue("def-code-id");
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        branchInventory: { update: jest.fn().mockResolvedValue(undefined) },
        branchDefectReport: { update: jest.fn().mockResolvedValue(undefined) },
      };
      await fn(tx);
      return tx;
    });
    (defectRepository.findById as jest.Mock)
      .mockResolvedValueOnce(pendingReport)
      .mockResolvedValueOnce({ ...pendingReport, status: "approved" });
  });

  it("marks inventory DEF and closes the report", async () => {
    const result = await defectService.approveDefect({
      tenantId: "t1",
      actorUserId: "mgr-1",
      permissions: ["inventory.manage"],
      reportId: "report-1",
      decisionRemarks: "Confirmed damage",
    });

    expect(reasonStatusService.requireCodeId).toHaveBeenCalledWith(
      "t1",
      "inventory_system",
      "DEF",
    );
    expect(transaction).toHaveBeenCalled();
    expect(defectRepository.writeDefectHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: "DEF" }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "inventory.defect_approved" }),
    );
    expect(result?.status).toBe("approved");
  });
});

describe("defectService.rejectDefect", () => {
  it("closes report and keeps unit STK in history", async () => {
    (defectRepository.findById as jest.Mock)
      .mockResolvedValueOnce(pendingReport)
      .mockResolvedValueOnce({ ...pendingReport, status: "rejected" });
    (defectRepository.closeReport as jest.Mock).mockResolvedValue(undefined);

    const result = await defectService.rejectDefect({
      tenantId: "t1",
      actorUserId: "mgr-1",
      permissions: ["inventory.manage"],
      reportId: "report-1",
    });

    expect(transaction).not.toHaveBeenCalled();
    expect(defectRepository.closeReport).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected", reportId: "report-1" }),
    );
    expect(defectRepository.writeDefectHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: "STK" }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "inventory.defect_rejected" }),
    );
    expect(result?.status).toBe("rejected");
  });
});
