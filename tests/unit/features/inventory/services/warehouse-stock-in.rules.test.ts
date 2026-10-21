import { planWarehouseStockIn } from "@/features/inventory/services/warehouse-stock-in.rules";

const warehouseId = "wh-1";
const locationId = "loc-1";
const tenantId = "tenant-1";

function plan(overrides: Partial<Parameters<typeof planWarehouseStockIn>[0]> = {}) {
  return planWarehouseStockIn({
    warehouseId,
    locationWarehouseId: warehouseId,
    locationId,
    modelId: "model-1",
    tenantId,
    serialNos: ["SN-NEW"],
    existing: [],
    occupancy: [],
    ...overrides,
  });
}

describe("warehouse stock-in placement", () => {
  it("places a new serial into the location", () => {
    const decision = plan();
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.createSerialNos).toEqual(["SN-NEW"]);
    expect(decision.plan.placeExistingIds).toEqual([]);
    expect(decision.plan.skippedSerialNos).toEqual([]);
  });

  it("skips a serial already at the same location and model", () => {
    const decision = plan({
      serialNos: ["SN-THERE", "SN-NEW"],
      existing: [
        {
          id: "sn-there",
          serialNo: "SN-THERE",
          modelId: "model-1",
          tenantId,
          deleted: false,
        },
      ],
      occupancy: [
        {
          serialNumberId: "sn-there",
          table: "warehouse",
          warehouseLocationId: locationId,
          place: "warehouse MAIN / A1",
        },
      ],
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.skippedSerialNos).toEqual(["SN-THERE"]);
    expect(decision.plan.createSerialNos).toEqual(["SN-NEW"]);
    expect(decision.plan.placeExistingIds).toEqual([]);
  });

  it("refuses a serial stocked at a different warehouse location", () => {
    const decision = plan({
      serialNos: ["SN-THERE"],
      existing: [
        {
          id: "sn-there",
          serialNo: "SN-THERE",
          modelId: "model-1",
          tenantId,
          deleted: false,
        },
      ],
      occupancy: [
        {
          serialNumberId: "sn-there",
          table: "warehouse",
          warehouseLocationId: "loc-other",
          place: "warehouse MAIN / B2",
        },
      ],
    });

    expect(decision).toEqual({
      ok: false,
      error: "SN-THERE is already at warehouse MAIN / B2.",
    });
  });

  it("refuses a serial held at a branch", () => {
    const decision = plan({
      serialNos: ["SN-BRANCH"],
      existing: [
        {
          id: "sn-branch",
          serialNo: "SN-BRANCH",
          modelId: "model-1",
          tenantId,
          deleted: false,
        },
      ],
      occupancy: [
        {
          serialNumberId: "sn-branch",
          table: "branch",
          warehouseLocationId: null,
          place: "branch Davao (STK)",
        },
      ],
    });

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error).toBe("SN-BRANCH is already at branch Davao (STK).");
  });

  it("rejects a location that is not in the warehouse", () => {
    const decision = plan({ locationWarehouseId: "wh-other" });
    expect(decision).toEqual({
      ok: false,
      error: "That location is not in this warehouse.",
    });
  });

  it("rejects a missing location", () => {
    const decision = plan({ locationWarehouseId: null });
    expect(decision.ok).toBe(false);
  });

  it("rejects a different model, a retired serial, and another company", () => {
    expect(
      plan({
        serialNos: ["SN-MODEL"],
        existing: [
          { id: "sn", serialNo: "SN-MODEL", modelId: "other", tenantId, deleted: false },
        ],
      }),
    ).toEqual({ ok: false, error: "SN-MODEL already belongs to a different model." });

    expect(
      plan({
        serialNos: ["SN-RETIRED"],
        existing: [
          { id: "sn", serialNo: "SN-RETIRED", modelId: "model-1", tenantId, deleted: true },
        ],
      }),
    ).toEqual({ ok: false, error: "SN-RETIRED is retired and cannot be stocked in." });

    expect(
      plan({
        serialNos: ["SN-OTHER"],
        existing: [
          {
            id: "sn",
            serialNo: "SN-OTHER",
            modelId: "model-1",
            tenantId: "other-tenant",
            deleted: false,
          },
        ],
      }),
    ).toEqual({ ok: false, error: "SN-OTHER is not in this company." });
  });
});
