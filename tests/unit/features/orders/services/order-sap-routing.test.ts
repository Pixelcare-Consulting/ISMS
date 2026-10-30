import {
  docTypeForOrder,
  resolveOrderSapRouting,
  resolveStoredOrderSapPlaces,
} from "@/features/orders/services/order-sap-routing";
import { SAP_ORDER_DOC_TYPE_LABELS } from "@/features/orders/constants/order-sap-doc-type";

type Input = Parameters<typeof resolveOrderSapRouting>[0];

function input(overrides: Partial<Input> = {}): Input {
  return {
    branch: {
      name: "Branch A",
      sapCode: "WH-A",
      bpCode: "CBP-A",
      primaryWarehouse: { id: "w-primary", code: "WP" },
    },
    mainWarehouse: { id: "w-main", code: "WM" },
    dealer: {
      name: "Dealer X",
      sapCode: "C001",
      modeOfPayment: { name: "Consignment Terms", kind: "CONSIGNMENT" },
    },
    ...overrides,
  };
}

describe("resolveOrderSapRouting", () => {
  it("blocks when the branch has no dealer", () => {
    expect(resolveOrderSapRouting(input({ dealer: null }))).toEqual({
      ok: false,
      error: "Branch A has no dealer. Set the dealer before final approval.",
    });
  });

  it("blocks when the dealer has no mode of payment", () => {
    const base = input();
    const result = resolveOrderSapRouting({
      ...base,
      dealer: { ...base.dealer!, modeOfPayment: null },
    });
    expect(result).toEqual({
      ok: false,
      error:
        "Dealer Dealer X has no mode of payment. Set it in Settings → Dealers before final approval.",
    });
  });

  it("blocks when the mode of payment has no type", () => {
    const base = input();
    const result = resolveOrderSapRouting({
      ...base,
      dealer: { ...base.dealer!, modeOfPayment: { name: "Net 30", kind: null } },
    });
    expect(result).toEqual({
      ok: false,
      error:
        "Mode of payment Net 30 has no type. Set it to Consignment or Outright in Settings → Master data → Modes of payment.",
    });
  });

  it("blocks when the branch has no SAP code", () => {
    const base = input();
    const result = resolveOrderSapRouting({ ...base, branch: { ...base.branch, sapCode: null } });
    expect(result).toEqual({ ok: false, error: "Branch A has no SAP warehouse code." });
  });

  it("blocks OUTRIGHT when the branch has no BP Code", () => {
    const base = input({ orderModeOfPayment: { name: "Cash", kind: "OUTRIGHT" } });
    const result = resolveOrderSapRouting({ ...base, branch: { ...base.branch, bpCode: null } });
    expect(result).toEqual({
      ok: false,
      error:
        "Branch A has no BP Code. Set the BP Code on warehouse WH-A in SAP, then sync branches in Settings → Branches.",
    });
  });

  it("OUTRIGHT needs no dealer and bills the branch BP Code", () => {
    const result = resolveOrderSapRouting(
      input({ dealer: null, orderModeOfPayment: { name: "Cash", kind: "OUTRIGHT" } }),
    );
    expect(result).toMatchObject({ ok: true, docType: "SO", cardCode: "CBP-A" });
  });

  it("CONSIGNMENT still needs the branch dealer", () => {
    const result = resolveOrderSapRouting(
      input({ dealer: null, orderModeOfPayment: { name: "Consign", kind: "CONSIGNMENT" } }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Branch A has no dealer. Set the dealer before final approval.",
    });
  });

  it("blocks when there is no primary or main warehouse", () => {
    const base = input();
    const result = resolveOrderSapRouting({
      ...base,
      branch: { ...base.branch, primaryWarehouse: null },
      mainWarehouse: null,
    });
    expect(result).toEqual({
      ok: false,
      error: "Branch A has no primary warehouse and no main warehouse is set.",
    });
  });

  it("CONSIGNMENT routes to ITR with null cardCode", () => {
    expect(resolveOrderSapRouting(input())).toEqual({
      ok: true,
      docType: "ITR",
      sourceWarehouseId: "w-primary",
      sourceWhsCode: "WP",
      branchWhsCode: "WH-A",
      cardCode: null,
    });
  });

  it("OUTRIGHT routes to SO billing the branch BP Code, not the dealer", () => {
    const base = input();
    const result = resolveOrderSapRouting({
      ...base,
      dealer: { ...base.dealer!, modeOfPayment: { name: "Cash", kind: "OUTRIGHT" } },
    });
    expect(result).toMatchObject({ ok: true, docType: "SO", cardCode: "CBP-A" });
  });

  it("primary warehouse wins over main, main is the fallback", () => {
    expect(resolveOrderSapRouting(input())).toMatchObject({ sourceWarehouseId: "w-primary" });
    const base = input();
    const fallback = resolveOrderSapRouting({
      ...base,
      branch: { ...base.branch, primaryWarehouse: null },
    });
    expect(fallback).toMatchObject({ sourceWarehouseId: "w-main", sourceWhsCode: "WM" });
  });
});

describe("resolveOrderSapRouting with an order mode of payment", () => {
  it("uses the order's override over the dealer's: consignment dealer, outright order gives SO", () => {
    const result = resolveOrderSapRouting(
      input({ orderModeOfPayment: { name: "Outright Cash", kind: "OUTRIGHT" } }),
    );
    expect(result).toMatchObject({ ok: true, docType: "SO", cardCode: "CBP-A" });
  });

  it("an outright override ignores the dealer's SAP customer code", () => {
    const base = input({ orderModeOfPayment: { name: "Outright Cash", kind: "OUTRIGHT" } });
    const result = resolveOrderSapRouting({ ...base, dealer: { ...base.dealer!, sapCode: null } });
    expect(result).toMatchObject({ ok: true, cardCode: "CBP-A" });
  });

  it("blocks an override that has no type", () => {
    const result = resolveOrderSapRouting(input({ orderModeOfPayment: { name: "COD", kind: null } }));
    expect(result).toEqual({
      ok: false,
      error:
        "Mode of payment COD has no type. Set it to Consignment or Outright in Settings → Master data → Modes of payment.",
    });
  });

  it("follows the dealer when the order has no override", () => {
    expect(resolveOrderSapRouting(input({ orderModeOfPayment: null }))).toMatchObject({
      ok: true,
      docType: "ITR",
    });
  });
});

describe("resolveStoredOrderSapPlaces", () => {
  it("SO uses the CardCode stored at approval over the branch's current BP Code", () => {
    const result = resolveStoredOrderSapPlaces("SO", input({ storedCardCode: "C-STORED" }));
    expect(result).toMatchObject({ ok: true, cardCode: "C-STORED" });
  });

  it("SO without a stored CardCode falls back to the branch BP Code", () => {
    expect(resolveStoredOrderSapPlaces("SO", input())).toMatchObject({ ok: true, cardCode: "CBP-A" });
  });

  it("SO with neither blocks with the BP Code message", () => {
    const base = input();
    const result = resolveStoredOrderSapPlaces("SO", {
      ...base,
      branch: { ...base.branch, bpCode: null },
    });
    expect(result).toMatchObject({ ok: false });
  });

  it("ITR carries no CardCode", () => {
    expect(resolveStoredOrderSapPlaces("ITR", input({ storedCardCode: "C-STORED" }))).toMatchObject({
      ok: true,
      cardCode: null,
    });
  });
});

describe("docTypeForOrder", () => {
  it("returns the stored value regardless of the dealer's current kind", () => {
    expect(docTypeForOrder({ sapDocType: "SO" })).toBe("SO");
    expect(docTypeForOrder({ sapDocType: "ITR" })).toBe("ITR");
  });

  it("throws when the order has no type", () => {
    expect(() => docTypeForOrder({ sapDocType: null })).toThrow(
      "This order has no SAP document type",
    );
  });
});

describe("SAP_ORDER_DOC_TYPE_LABELS", () => {
  it("labels both types", () => {
    expect(SAP_ORDER_DOC_TYPE_LABELS).toEqual({
      ITR: "ITR (Consignment)",
      SO: "SO (Outright)",
    });
  });
});
