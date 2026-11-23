import {
  historyReplacementReference,
  replacedSnRemark,
  replacementSnRemark,
  saleLineReplacementReference,
  type HistoryReplacementPair,
  type ReplacementSerialPair,
} from "@/features/serial-activity/lib/replacement-reference";

const ORIGINAL = "55QUHW01L112400548";
const REPLACEMENT = "55QUHW01L112400999";
/** On the returned (old) unit's row. */
const ON_ORIGINAL = `Replacement SN: ${REPLACEMENT}`;
/** On the replacement (new) unit's row. */
const ON_REPLACEMENT = `Replaced SN: ${ORIGINAL}`;

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

describe("replacement remarks", () => {
  it("names the other serial from each side", () => {
    expect(replacementSnRemark(REPLACEMENT)).toBe(ON_ORIGINAL);
    expect(replacedSnRemark(ORIGINAL)).toBe(ON_REPLACEMENT);
  });
});

describe("saleLineReplacementReference", () => {
  it("shows the replaced SN on a same-invoice line that now holds the replacement serial", () => {
    expect(saleLineReplacementReference([sameInvoice], REPLACEMENT, "test11111111")).toBe(
      ON_REPLACEMENT,
    );
  });

  it("shows the replacement SN on a same-invoice line that kept the returned serial (service center)", () => {
    expect(saleLineReplacementReference([sameInvoice], ORIGINAL, "test11111111")).toBe(ON_ORIGINAL);
  });

  it("shows the replacement SN on a new-invoice line that still holds the original serial", () => {
    expect(saleLineReplacementReference([newInvoice], ORIGINAL, "test11111111")).toBe(ON_ORIGINAL);
  });

  it("does not match the replacement serial on the new invoice", () => {
    expect(saleLineReplacementReference([newInvoice], REPLACEMENT, "INV-200")).toBeNull();
  });

  it("trims serials and omits the remark when they match or one is blank", () => {
    expect(
      saleLineReplacementReference(
        [{ ...sameInvoice, replacementSerialNo: ` ${REPLACEMENT} ` }],
        REPLACEMENT,
        "test11111111",
      ),
    ).toBe(ON_REPLACEMENT);
    expect(
      saleLineReplacementReference(
        [{ ...sameInvoice, replacementSerialNo: ORIGINAL }],
        ORIGINAL,
        "test11111111",
      ),
    ).toBeNull();
    expect(
      saleLineReplacementReference(
        [{ ...sameInvoice, replacementSerialNo: "  " }],
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

  it("shows the replaced SN on the unit sold as the replacement on the new invoice", () => {
    expect(historyReplacementReference([pair], "new-id", "INV-200")).toBe(ON_REPLACEMENT);
  });

  it("shows the replacement SN on the original unit restored against the old invoice", () => {
    expect(historyReplacementReference([pair], "orig-id", "test11111111")).toBe(ON_ORIGINAL);
  });

  it("does not match the replacement serial against the original invoice", () => {
    expect(historyReplacementReference([pair], "new-id", "test11111111")).toBeNull();
  });

  it("labels a same-invoice replacement from each serial's side", () => {
    const same: HistoryReplacementPair = {
      ...sameInvoice,
      originalSerialNumberId: "orig-id",
      replacementSerialNumberId: "new-id",
    };
    expect(historyReplacementReference([same], "new-id", "test11111111")).toBe(ON_REPLACEMENT);
    expect(historyReplacementReference([same], "orig-id", "test11111111")).toBe(ON_ORIGINAL);
  });

  it("does not use a later replacement that reused the serial on another invoice", () => {
    expect(historyReplacementReference([laterPair, pair], "new-id", "INV-200")).toBe(
      ON_REPLACEMENT,
    );
  });

  it("omits the remark when the invoice or the pair is missing", () => {
    expect(historyReplacementReference([pair], "new-id", null)).toBeNull();
    expect(historyReplacementReference([pair], "missing", "INV-200")).toBeNull();
  });
});
