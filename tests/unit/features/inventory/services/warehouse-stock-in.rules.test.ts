import { planWarehouseStockIn } from "@/features/inventory/services/warehouse-stock-in.rules";

const warehouseId = "wh-1";

describe("warehouse stock-in placement", () => {
  it("places a new serial into the location", () => {
    const decision = planWarehouseStockIn({
      warehouseId,
      locationWarehouseId: warehouseId,
      modelId: "model-1",
      serialNos: ["SN-NEW"],
      existing: [],
      warehouseSerialIds: [],
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.createSerialNos).toEqual(["SN-NEW"]);
    expect(decision.plan.placeExistingIds).toEqual([]);
    expect(decision.plan.skippedSerialNos).toEqual([]);
  });

  it("skips a serial that is already in warehouse stock", () => {
    const decision = planWarehouseStockIn({
      warehouseId,
      locationWarehouseId: warehouseId,
      modelId: "model-1",
      serialNos: ["SN-THERE", "SN-NEW"],
      existing: [
        { id: "sn-there", serialNo: "SN-THERE", modelId: "model-1", deleted: false },
      ],
      warehouseSerialIds: ["sn-there"],
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.skippedSerialNos).toEqual(["SN-THERE"]);
    expect(decision.plan.createSerialNos).toEqual(["SN-NEW"]);
    expect(decision.plan.placeExistingIds).toEqual([]);
  });

  it("rejects a location that is not in the warehouse", () => {
    const decision = planWarehouseStockIn({
      warehouseId,
      locationWarehouseId: "wh-other",
      modelId: "model-1",
      serialNos: ["SN-NEW"],
      existing: [],
      warehouseSerialIds: [],
    });

    expect(decision).toEqual({
      ok: false,
      error: "That location is not in this warehouse.",
    });
  });

  it("rejects a missing location", () => {
    const decision = planWarehouseStockIn({
      warehouseId,
      locationWarehouseId: null,
      modelId: "model-1",
      serialNos: ["SN-NEW"],
      existing: [],
      warehouseSerialIds: [],
    });

    expect(decision.ok).toBe(false);
  });
});
