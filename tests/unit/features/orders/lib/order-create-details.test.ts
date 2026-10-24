import { buildOrderCreateDetails, worksheetLinesOnOrder } from "@/features/orders/lib/order-create-details";

describe("buildOrderCreateDetails", () => {
  it("omits a removed model even when that line still has a quantity", () => {
    const details = buildOrderCreateDetails(
      [
        { modelId: "removed", requestedQty: 4, remarks: "drop me" },
        { modelId: "kept", requestedQty: 3, remarks: "  keep  " },
        { modelId: "zero", requestedQty: 0, remarks: "" },
      ],
      new Set(["removed"]),
    );

    expect(details).toEqual([
      { modelId: "kept", quantity: 3, remarks: "keep" },
    ]);
    expect(details.map((line) => line.modelId)).not.toContain("removed");
  });
});

describe("worksheetLinesOnOrder", () => {
  it("hides planogram rows that were not saved on the order", () => {
    const lines = worksheetLinesOnOrder(
      [
        { modelId: "removed", skuCode: "32STV105" },
        { modelId: "kept", skuCode: "55QUHW01" },
      ],
      new Set(["kept"]),
    );
    expect(lines.map((line) => line.modelId)).toEqual(["kept"]);
  });
});
