jest.mock("@/features/audit/services/audit.service", () => ({ auditService: { log: jest.fn() } }));
jest.mock("@/features/service-center-ordering/services/sc-ordering-sap", () => ({
  findSapCustomer: jest.fn(),
}));
jest.mock("@/features/service-center-ordering/repositories/sc-ordering-settings.repository", () => ({
  scOrderingSettingsRepository: {
    findDefaults: jest.fn(),
    listCustomers: jest.fn(),
    findCustomer: jest.fn(),
    addCustomer: jest.fn(),
  },
}));

import { SC_ORDERING_NOT_SET_UP } from "@/features/service-center-ordering/constants";
import { scOrderingSettingsRepository as repo } from "@/features/service-center-ordering/repositories/sc-ordering-settings.repository";
import { findSapCustomer } from "@/features/service-center-ordering/services/sc-ordering-sap";
import { scOrderingSettingsService } from "@/features/service-center-ordering/services/sc-ordering-settings.service";

const defaults = {
  warehouseCode: "FWH14P1F",
  branchCode: "ELG004",
  departmentCode: "CS",
  cogsBranchCode: "ELG004",
};
const customers = [
  { id: "c1", cardCode: "CELG004", cardName: "REPLACEMENT PROGRAM", isPrimary: true },
  { id: "c2", cardCode: "CABC001", cardName: "OTHER", isPrimary: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  (repo.findDefaults as jest.Mock).mockResolvedValue(defaults);
  (repo.listCustomers as jest.Mock).mockResolvedValue(customers);
});

describe("resolvePostingSnapshot", () => {
  it("bills the primary customer when none is picked", async () => {
    await expect(scOrderingSettingsService.resolvePostingSnapshot("t1", null)).resolves.toEqual({
      sapCardCode: "CELG004",
      sapWarehouseCode: "FWH14P1F",
      sapBranchCode: "ELG004",
      sapDepartmentCode: "CS",
      sapCogsBranchCode: "ELG004",
    });
  });

  it("bills another listed customer when picked", async () => {
    await expect(scOrderingSettingsService.resolvePostingSnapshot("t1", "CABC001")).resolves.toMatchObject({
      sapCardCode: "CABC001",
    });
  });

  it("refuses a customer that is not listed", async () => {
    await expect(scOrderingSettingsService.resolvePostingSnapshot("t1", "CNOPE")).rejects.toThrow(
      "CNOPE is not a service center ordering customer.",
    );
  });

  it("refuses when no warehouse or no customer is set up", async () => {
    (repo.findDefaults as jest.Mock).mockResolvedValue({ ...defaults, warehouseCode: null });
    await expect(scOrderingSettingsService.resolvePostingSnapshot("t1", null)).rejects.toThrow(
      SC_ORDERING_NOT_SET_UP,
    );
    (repo.findDefaults as jest.Mock).mockResolvedValue(null);
    (repo.listCustomers as jest.Mock).mockResolvedValue([]);
    await expect(scOrderingSettingsService.resolvePostingSnapshot("t1", null)).rejects.toThrow(
      SC_ORDERING_NOT_SET_UP,
    );
  });
});

describe("addCustomer", () => {
  it("stores SAP's name for a known customer", async () => {
    (repo.findCustomer as jest.Mock).mockResolvedValue(null);
    (findSapCustomer as jest.Mock).mockResolvedValue({ cardCode: "CELG004", cardName: "REPLACEMENT PROGRAM" });
    (repo.addCustomer as jest.Mock).mockResolvedValue({ id: "c9", cardCode: "CELG004" });
    await scOrderingSettingsService.addCustomer("t1", "u1", "CELG004");
    expect(repo.addCustomer).toHaveBeenCalledWith("t1", {
      cardCode: "CELG004",
      cardName: "REPLACEMENT PROGRAM",
    });
  });

  it("rejects a code SAP doesn't have as a customer", async () => {
    (repo.findCustomer as jest.Mock).mockResolvedValue(null);
    (findSapCustomer as jest.Mock).mockResolvedValue(null);
    await expect(scOrderingSettingsService.addCustomer("t1", "u1", "VSUP01")).rejects.toThrow(
      "SAP has no customer with code VSUP01.",
    );
    expect(repo.addCustomer).not.toHaveBeenCalled();
  });

  it("rejects a duplicate without asking SAP", async () => {
    (repo.findCustomer as jest.Mock).mockResolvedValue(customers[0]);
    await expect(scOrderingSettingsService.addCustomer("t1", "u1", "CELG004")).rejects.toThrow(
      "CELG004 is already in the list.",
    );
    expect(findSapCustomer).not.toHaveBeenCalled();
  });
});
