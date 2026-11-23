import {
  historyReplacementReference,
  replacementSerialReferenceLine,
  saleLineReplacementReference,
  type HistoryReplacementPair,
  type ReplacementSerialPair,
} from "@/features/serial-activity/lib/replacement-reference";

const ORIGINAL = "55QUHW01L112400548";
const REPLACEMENT = "55QUHW01L112400999";
const ARROW = `${ORIGINAL} → ${REPLACEMENT}`;

const sameInvoice: ReplacementSerialPair = {
  originalSerialNo: ORIGINAL,
  replacementSerialNo: REPLACEMENT,
  originalInvoiceNo: "test11111111",
  replacementInvoiceNo: "test11111111",
};

const newInvoice: ReplacementSerialPair = {
  originalSerialNo: ORIGINAL,
  replacementSerialNo: REPLACEMENT,
  originalInvoiceNo: "test11111111",
  replacementInvoiceNo: "INV-200",
};

describe("replacementSerialReferenceLine", () => {
  it("names the original serial and the replacement serial", () => {
    expect(replacementSerialReferenceLine(ORIGINAL, REPLACEMENT)).toBe(ARROW);
  });

  it("trims both serials", () => {
    expect(replacementSerialReferenceLine(` ${ORIGINAL} `, `\t${REPLACEMENT}`)).toBe(ARROW);
  });

  it("omits the line when either serial is blank", () => {
    expect(replacementSerialReferenceLine("  ", REPLACEMENT)).toBeNull();
    expect(replacementSerialReferenceLine(ORIGINAL, null)).toBeNull();
    expect(replacementSerialReferenceLine(undefined, undefined)).toBeNull();
  });

  it("omits the line when both serials are the same", () => {
    expect(replacementSerialReferenceLine(` ${ORIGINAL} `, ORIGINAL)).toBeNull();
  });
});

describe("saleLineReplacementReference", () => {
  it("matches a same-invoice line that now holds the replacement serial", () => {
    expect(
      saleLineReplacementReference([sameInvoice], REPLACEMENT, "test11111111"),
    ).toBe(ARROW);
  });

  it("does not treat the original serial as the same-invoice line", () => {
    expect(saleLineReplacementReference([sameInvoice], ORIGINAL, "test11111111")).toBeNull();
  });

  it("matches a new-invoice line that still holds the original serial", () => {
    expect(saleLineReplacementReference([newInvoice], ORIGINAL, "test11111111")).toBe(ARROW);
  });

  it("does not match the replacement serial on the new invoice", () => {
    expect(saleLineReplacementReference([newInvoice], REPLACEMENT, "INV-200")).toBeNull();
  });

  it("omits the line when the stored serials match", () => {
    expect(
      saleLineReplacementReference(
        [{ ...sameInvoice, replacementSerialNo: ORIGINAL }],
        ORIGINAL,
        "test11111111",
      ),
    ).toBeNull();
  });
});

describe("historyReplacementReference", () => {
  const pair: HistoryReplacementPair = {
    ...newInvoice,
    originalSerialNumberId: "orig-id",
    replacementSerialNumberId: "new-id",
  };

  const laterPair: HistoryReplacementPair = {
    originalSerialNo: "OTHER-ORIG",
    replacementSerialNo: "OTHER-NEW",
    originalInvoiceNo: "test11111111",
    replacementInvoiceNo: "INV-300",
    originalSerialNumberId: "new-id",
    replacementSerialNumberId: "third-id",
  };

  it("matches the unit sold as the replacement on the new invoice", () => {
    expect(historyReplacementReference([pair], "new-id", "INV-200")).toBe(ARROW);
  });

  it("matches the original unit restored against the old invoice", () => {
    expect(historyReplacementReference([pair], "orig-id", "test11111111")).toBe(ARROW);
  });

  it("does not match the replacement serial against the original invoice", () => {
    expect(historyReplacementReference([pair], "new-id", "test11111111")).toBeNull();
  });

  it("matches a same-invoice replacement from either serial", () => {
    const same: HistoryReplacementPair = {
      ...sameInvoice,
      originalSerialNumberId: "orig-id",
      replacementSerialNumberId: "new-id",
    };
    expect(historyReplacementReference([same], "new-id", "test11111111")).toBe(ARROW);
    expect(historyReplacementReference([same], "orig-id", "test11111111")).toBe(ARROW);
  });

  it("does not use a later replacement that reused the serial on another invoice", () => {
    expect(historyReplacementReference([laterPair, pair], "new-id", "INV-200")).toBe(ARROW);
  });

  it("omits the line when the invoice or the pair is missing", () => {
    expect(historyReplacementReference([pair], "new-id", null)).toBeNull();
    expect(historyReplacementReference([pair], "missing", "INV-200")).toBeNull();
  });
});
