jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));
jest.mock("@/features/aors/services/aor.service", () => ({
  aorService: { getBranchIdsForUser: jest.fn() },
}));
jest.mock("@/features/branches/repositories/branch.repository", () => ({
  branchRepository: {},
}));
jest.mock("@/features/inventory/repositories/inventory-group.repository", () => ({
  inventoryGroupRepository: {},
}));
jest.mock("@/features/inventory/repositories/defect.repository", () => ({
  defectRepository: {
    findOpenPendingByBranchInventoryId: jest.fn(),
  },
}));

jest.mock("@/features/audit/services/audit.service", () => ({
  auditService: { log: jest.fn() },
}));
jest.mock("@/features/inventory/repositories/inventory.repository", () => ({
  inventoryRepository: {
    findByIdWithStatus: jest.fn(),
    updateStatus: jest.fn(),
  },
}));
jest.mock("@/features/reason-status/repositories/reason-status.repository", () => ({
  reasonStatusRepository: {
    listActiveCodesByCategory: jest.fn(),
  },
}));

import { aorService } from "@/features/aors/services/aor.service";
import { auditService } from "@/features/audit/services/audit.service";
import { defectRepository } from "@/features/inventory/repositories/defect.repository";
import { inventoryRepository } from "@/features/inventory/repositories/inventory.repository";
import { inventoryService } from "@/features/inventory/services/inventory.service";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";

const listCodes = reasonStatusRepository.listActiveCodesByCategory as jest.Mock;
const findById = inventoryRepository.findByIdWithStatus as jest.Mock;
const updateStatus = inventoryRepository.updateStatus as jest.Mock;
const getBranchIds = aorService.getBranchIdsForUser as jest.Mock;
const findPending = defectRepository.findOpenPendingByBranchInventoryId as jest.Mock;

const codes = [
  { id: "STK-id", code: "STK", name: "Stock", color: null },
  { id: "DU-id", code: "DU", name: "Display unit", color: "amber" },
  { id: "DEF-id", code: "DEF", name: "Defective", color: null },
  { id: "RSV-id", code: "RSV", name: "Reserved", color: null },
  { id: "SLD-id", code: "SLD", name: "Sold", color: null },
  { id: "DIT-id", code: "DIT", name: "Delivery in transit", color: null },
  { id: "FPO-id", code: "FPO", name: "For pull-out", color: null },
  { id: "OFS-id", code: "OFS", name: "Official Sold", color: null },
  { id: "FW-id", code: "FW", name: "TO FOLLOW", color: null },
];

function unit(code: string, name: string) {
  return {
    id: "inv-1",
    branchId: "branch-1",
    serialNumberId: "sn-1",
    statusCode: { id: `${code}-id`, code, name },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  listCodes.mockResolvedValue(codes);
  getBranchIds.mockResolvedValue(["branch-1"]);
  findPending.mockResolvedValue(null);
  (auditService.log as jest.Mock).mockResolvedValue(undefined);
  findById.mockResolvedValue(unit("STK", "Stock"));
  updateStatus.mockResolvedValue({ id: "inv-1" });
});

describe("inventoryService.updateStatus allow-list", () => {
  it("changes STK to DU immediately and writes serial history", async () => {
    await inventoryService.updateStatus({
      tenantId: "t1",
      actorUserId: "user-1",
      permissions: ["inventory.view"],
      inventoryId: "inv-1",
      statusCodeId: "DU-id",
    });

    expect(updateStatus).toHaveBeenCalledWith({
      tenantId: "t1",
      id: "inv-1",
      statusCodeId: "DU-id",
      updatedById: "user-1",
      serialNumberId: "sn-1",
      historyDetails: "Status changed from Stock (STK) to Display unit (DU)",
      historyStatus: "DU",
    });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "inventory.status_updated" }),
    );
  });

  it("changes DU back to STK", async () => {
    findById.mockResolvedValue(unit("DU", "Display unit"));

    await inventoryService.updateStatus({
      tenantId: "t1",
      actorUserId: "user-1",
      permissions: ["inventory.view"],
      inventoryId: "inv-1",
      statusCodeId: "STK-id",
    });

    expect(updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        historyDetails: "Status changed from Display unit (DU) to Stock (STK)",
        historyStatus: "STK",
      }),
    );
  });

  it.each(["DEF", "RSV", "SLD", "DIT", "FPO", "OFS", "FW"] as const)(
    "refuses STK to %s",
    async (target) => {
      await expect(
        inventoryService.updateStatus({
          tenantId: "t1",
          actorUserId: "user-1",
          permissions: ["inventory.view"],
          inventoryId: "inv-1",
          statusCodeId: `${target}-id`,
        }),
      ).rejects.toThrow(/only move between Stock and Display unit/);

      expect(updateStatus).not.toHaveBeenCalled();
    },
  );

  it("refuses a defective unit moving anywhere", async () => {
    findById.mockResolvedValue(unit("DEF", "Defective"));

    await expect(
      inventoryService.updateStatus({
        tenantId: "t1",
        actorUserId: "user-1",
        permissions: ["inventory.view"],
        inventoryId: "inv-1",
        statusCodeId: "STK-id",
      }),
    ).rejects.toThrow(/only move between Stock and Display unit/);

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("refuses a status change while a defect report is waiting", async () => {
    findPending.mockResolvedValue({ id: "open-1" });

    await expect(
      inventoryService.updateStatus({
        tenantId: "t1",
        actorUserId: "user-1",
        permissions: ["inventory.view"],
        inventoryId: "inv-1",
        statusCodeId: "DU-id",
      }),
    ).rejects.toThrow(/waiting for the team leader/);

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("stays inside the caller's area of responsibility", async () => {
    getBranchIds.mockResolvedValue(["other-branch"]);

    await expect(
      inventoryService.updateStatus({
        tenantId: "t1",
        actorUserId: "user-1",
        permissions: ["inventory.view"],
        inventoryId: "inv-1",
        statusCodeId: "DU-id",
      }),
    ).rejects.toThrow(/area of responsibility/);

    expect(updateStatus).not.toHaveBeenCalled();
  });
});
