import { branchDealerFilter, orderPartyBlock } from "@/features/orders/lib/order-party";

const branch = { name: "S&R DC Paranaque", sapCode: "SNR031", bpCode: "CSNR1000" };

describe("branchDealerFilter", () => {
  it("waits for a mode of payment", () => {
    expect(branchDealerFilter(null, "d1")).toBeNull();
  });

  it("consignment waits for a dealer, then filters by it", () => {
    expect(branchDealerFilter("CONSIGNMENT", "")).toBeNull();
    expect(branchDealerFilter("CONSIGNMENT", "d1")).toBe("d1");
  });

  it("outright lists every branch, whatever dealer is left in state", () => {
    expect(branchDealerFilter("OUTRIGHT", "")).toBe("");
    expect(branchDealerFilter("OUTRIGHT", "d1")).toBe("");
  });
});

describe("orderPartyBlock", () => {
  it("asks for the mode of payment first", () => {
    expect(orderPartyBlock({ kind: null, dealerId: "d1", branch })).toBe("Select a mode of payment.");
  });

  it("consignment needs a dealer and a branch", () => {
    expect(orderPartyBlock({ kind: "CONSIGNMENT", dealerId: "", branch })).toBe("Select a dealer.");
    expect(orderPartyBlock({ kind: "CONSIGNMENT", dealerId: "d1", branch: null })).toBe(
      "Select a branch.",
    );
    expect(orderPartyBlock({ kind: "CONSIGNMENT", dealerId: "d1", branch: { ...branch, bpCode: null } })).toBeNull();
  });

  it("outright needs no dealer but blocks a branch without a BP Code", () => {
    expect(orderPartyBlock({ kind: "OUTRIGHT", dealerId: "", branch })).toBeNull();
    expect(orderPartyBlock({ kind: "OUTRIGHT", dealerId: "", branch: { ...branch, bpCode: null } })).toBe(
      "S&R DC Paranaque has no BP Code. Set the BP Code on warehouse SNR031 in SAP, then sync branches in Settings → Branches.",
    );
  });
});
