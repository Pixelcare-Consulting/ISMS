jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/aors/services/aor.service", () => ({
  aorService: { getBranchIdsForUser: jest.fn() },
}));
jest.mock("@/features/branches/repositories/branch.repository", () => ({
  branchRepository: {},
}));
jest.mock("@/features/inventory/repositories/inventory-group.repository", () => ({
  inventoryGroupRepository: {},
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

import { auditService } from "@/features/audit/services/audit.service";
import { inventoryRepository } from "@/features/inventory/repositories/inventory.repository";
import { inventoryService } from "@/features/inventory/services/inventory.service";
import { reasonStatusRepository } from "@/features/reason-status/repositories/reason-status.repository";

const listCodes = reasonStatusRepository.listActiveCodesByCategory as jest.Mock;
const findById = inventoryRepository.findByIdWithStatus as jest.Mock;
const updateStatus = inventoryRepository.updateStatus as jest.Mock;

const codes = [
  { id: "stk-id", code: "STK", name: "Stock", color: null },
  { id: "def-id", code: "DEF", name: "Defective", color: null },
  { id: "rsv-id", code: "RSV", name: "Reserved", color: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  listCodes.mockResolvedValue(codes);
  (auditService.log as jest.Mock).mockResolvedValue(undefined);
  findById.mockResolvedValue({
    id: "inv-1",
    statusCode: { code: "STK" },
  });
  updateStatus.mockResolvedValue({ id: "inv-1" });
});

describe("inventoryService.updateStatus STK↔DEF lock", () => {
  it("blocks STK to DEF via dropdown", async () => {
    await expect(
      inventoryService.updateStatus({
        tenantId: "t1",
        actorUserId: "user-1",
        inventoryId: "inv-1",
        statusCodeId: "def-id",
      }),
    ).rejects.toThrow(/defect inspection workflow/);

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("blocks DEF to STK via dropdown", async () => {
    findById.mockResolvedValue({
      id: "inv-1",
      statusCode: { code: "DEF" },
    });

    await expect(
      inventoryService.updateStatus({
        tenantId: "t1",
        actorUserId: "user-1",
        inventoryId: "inv-1",
        statusCodeId: "stk-id",
      }),
    ).rejects.toThrow(/defect inspection workflow/);

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("allows STK to RSV", async () => {
    await inventoryService.updateStatus({
      tenantId: "t1",
      actorUserId: "user-1",
      inventoryId: "inv-1",
      statusCodeId: "rsv-id",
    });

    expect(updateStatus).toHaveBeenCalledWith(
      "t1",
      "inv-1",
      "rsv-id",
      "user-1",
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "inventory.status_updated" }),
    );
  });
});
