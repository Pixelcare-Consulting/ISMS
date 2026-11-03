jest.mock("@/features/branches/repositories/branch.repository", () => ({ branchRepository: {} }));
jest.mock("@/features/sap/services/sap-sync-engine", () => ({ runSapSync: jest.fn() }));

import { branchWarehouseSyncEntity } from "@/features/branches/services/branch-warehouse-sap-sync.service";

describe("branchWarehouseSyncEntity.parse", () => {
  it("reads the BP Code UDF the outright SO bills", () => {
    expect(branchWarehouseSyncEntity.select).toContain("U_CardCode");
    expect(
      branchWarehouseSyncEntity.parse(
        { WarehouseCode: "SNR031", WarehouseName: "S&R DC PARANAQUE", Inactive: "tNO", U_CardCode: " CSNR1000 " },
        undefined,
      ),
    ).toEqual({
      record: { sapCode: "SNR031", name: "S&R DC PARANAQUE", bpCode: "CSNR1000", isInactive: false },
    });
  });

  it("stores a blank BP Code as null so the order form can block on it", () => {
    const outcome = branchWarehouseSyncEntity.parse(
      { WarehouseCode: "ABB001", WarehouseName: "Branch", Inactive: "tNO", U_CardCode: "" },
      undefined,
    );
    expect(outcome).toMatchObject({ record: { bpCode: null } });
  });
});
