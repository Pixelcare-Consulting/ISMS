import {
  branchDealer,
  defaultModeOfPaymentId,
  orderPartyBlock,
} from "@/features/orders/lib/order-party";

const branch = {
  name: "S&R DC Paranaque",
  sapCode: "SNR031",
  bpCode: "CSNR1000",
  dealerId: "d1",
};
const dealers = [
  { id: "d1", name: "S&R", modeOfPaymentId: "m1" },
  { id: "d2", name: "No MOP", modeOfPaymentId: null },
];
const modes = [{ id: "m1" }, { id: "m2" }];

describe("branchDealer", () => {
  it("finds the branch's dealer", () => {
    expect(branchDealer(branch, dealers)?.name).toBe("S&R");
  });

  it("is null without a branch, without a dealer, or for a dealer not in the list", () => {
    expect(branchDealer(null, dealers)).toBeNull();
    expect(branchDealer({ dealerId: null }, dealers)).toBeNull();
    expect(branchDealer({ dealerId: "gone" }, dealers)).toBeNull();
  });
});

describe("defaultModeOfPaymentId", () => {
  it("uses the dealer's mode of payment", () => {
    expect(defaultModeOfPaymentId(dealers[0], modes)).toBe("m1");
  });

  it("is empty when there is no dealer, no dealer mode, or the mode can't be used", () => {
    expect(defaultModeOfPaymentId(null, modes)).toBe("");
    expect(defaultModeOfPaymentId(dealers[1], modes)).toBe("");
    expect(defaultModeOfPaymentId({ modeOfPaymentId: "untyped" }, modes)).toBe("");
  });
});

describe("orderPartyBlock", () => {
  it("asks for the branch first, then the mode of payment", () => {
    expect(orderPartyBlock({ kind: null, branch: null })).toBe("Select a branch.");
    expect(orderPartyBlock({ kind: "CONSIGNMENT", branch: null })).toBe("Select a branch.");
    expect(orderPartyBlock({ kind: null, branch })).toBe("Select a mode of payment.");
  });

  it("consignment needs a branch with a dealer, not a BP Code", () => {
    expect(orderPartyBlock({ kind: "CONSIGNMENT", branch: { ...branch, bpCode: null } })).toBeNull();
    expect(orderPartyBlock({ kind: "CONSIGNMENT", branch: { ...branch, dealerId: null } })).toBe(
      "S&R DC Paranaque has no dealer, so it can't take a consignment order. Set its dealer in Settings → Branches, or choose an outright mode of payment.",
    );
  });

  it("outright needs no dealer but blocks a branch without a BP Code", () => {
    expect(orderPartyBlock({ kind: "OUTRIGHT", branch: { ...branch, dealerId: null } })).toBeNull();
    expect(orderPartyBlock({ kind: "OUTRIGHT", branch: { ...branch, bpCode: null } })).toBe(
      "S&R DC Paranaque has no BP Code. Set the BP Code on warehouse SNR031 in SAP, then sync branches in Settings → Branches.",
    );
  });
});
