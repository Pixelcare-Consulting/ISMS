import {
  claimToFollowSaleLine,
  saleSerialLinkError,
} from "@/features/sales/services/sale-serial-link";

const linked = {
  tenantId: "tenant-1",
  saleTenantId: "tenant-1",
  stockBranchTenantId: "tenant-1",
  detailModelId: "model-1",
  detailBrandId: "brand-1",
  serialNo: "SN-1",
  serialTenantId: "tenant-1",
  serialModelId: "model-1",
  serialDeleted: false,
  modelTenantId: "tenant-1",
  modelBrandId: "brand-1",
};

describe("sale serial link", () => {
  it("accepts a serial whose model, brand, and company match the sale", () => {
    expect(saleSerialLinkError(linked)).toBeNull();
  });

  it("accepts a model that has no brand", () => {
    expect(saleSerialLinkError({ ...linked, modelBrandId: null, detailBrandId: "brand-1" })).toBeNull();
  });

  it("rejects a different model", () => {
    expect(saleSerialLinkError({ ...linked, serialModelId: "model-2" })).toBe(
      "SN-1 does not match the model on this sale.",
    );
  });

  it("rejects a different brand when the model has one", () => {
    expect(saleSerialLinkError({ ...linked, detailBrandId: "brand-2" })).toBe(
      "SN-1 does not match the brand on this sale.",
    );
  });

  it("rejects a serial from another company", () => {
    expect(saleSerialLinkError({ ...linked, serialTenantId: "other" })).toBe(
      "SN-1 is not in this company.",
    );
  });

  it("rejects a stock branch from another company", () => {
    expect(saleSerialLinkError({ ...linked, stockBranchTenantId: "other" })).toBe(
      "SN-1 is not in this company.",
    );
  });

  it("rejects a retired serial", () => {
    expect(saleSerialLinkError({ ...linked, serialDeleted: true })).toBe(
      "SN-1 is retired and cannot be sold.",
    );
  });
});

describe("to-follow claim", () => {
  it("requires the line to still have no serial", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    await expect(
      claimToFollowSaleLine(
        { branchSalesTransactionDetail: { updateMany } },
        {
          detailId: "line-1",
          saleId: "sale-1",
          serialNumberId: "sn-1",
          statusCodeId: "sld",
          deliveryNo: null,
          deliveryDate: null,
        },
      ),
    ).rejects.toThrow("This to-follow line was already assigned a serial.");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "line-1", salesId: "sale-1", serialNumberId: null },
      data: {
        serialNumberId: "sn-1",
        statusCodeId: "sld",
        deliveryNo: null,
        deliveryDate: null,
      },
    });
  });

  it("claims a pending line", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    await expect(
      claimToFollowSaleLine(
        { branchSalesTransactionDetail: { updateMany } },
        {
          detailId: "line-1",
          saleId: "sale-1",
          serialNumberId: "sn-1",
          statusCodeId: "sld",
        },
      ),
    ).resolves.toBeUndefined();
  });
});
