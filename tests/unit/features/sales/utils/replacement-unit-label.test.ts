import {
  formatSaleLineHint,
  formatWasReplacedLine,
  replacementModelText,
  wasLineForSameInvoiceReplacement,
} from "@/features/sales/utils/replacement-unit-label";

const originalSerial = {
  serialNo: "OLD-100",
  model: {
    skuCode: "QA55",
    name: "Crystal",
    brand: { name: "Samsung" },
  },
};

describe("replacement unit labels", () => {
  it("joins brand and model, and keeps whichever one exists", () => {
    expect(replacementModelText("Samsung", "QA55")).toBe("Samsung QA55");
    expect(replacementModelText(null, "QA55")).toBe("QA55");
    expect(replacementModelText("Samsung", "  ")).toBe("Samsung");
    expect(replacementModelText("  ", null)).toBeNull();
  });

  it("formats the muted sale-line sentence and omits a missing part", () => {
    expect(formatSaleLineHint({ model: "Samsung QA55", serial: "OLD-100" })).toBe(
      "Sale line · Samsung QA55 · SN OLD-100",
    );
    expect(formatSaleLineHint({ model: "Samsung QA55", serial: null })).toBe(
      "Sale line · Samsung QA55",
    );
    expect(formatSaleLineHint({ model: null, serial: "OLD-100" })).toBe(
      "Sale line · SN OLD-100",
    );
    expect(formatSaleLineHint({ model: "  ", serial: "" })).toBeNull();
  });

  it("formats the Was line and omits a missing part", () => {
    expect(formatWasReplacedLine({ model: "Samsung QA55", serial: "OLD-100" })).toBe(
      "Was Samsung QA55 · SN OLD-100",
    );
    expect(formatWasReplacedLine({ model: "Samsung QA55", serial: null })).toBe(
      "Was Samsung QA55",
    );
    expect(formatWasReplacedLine({ model: null, serial: "OLD-100" })).toBe(
      "Was SN OLD-100",
    );
    expect(formatWasReplacedLine({ model: null, serial: "  " })).toBeNull();
  });

  it("prints the Was line only for the same-invoice line that now holds the new serial", () => {
    const replacements = [
      {
        replacementInvoiceNo: "TRN-1",
        originalSerialNumber: originalSerial,
        replacementSerialNumber: { id: "serial-new" },
      },
      {
        replacementInvoiceNo: "TRN-NEW",
        originalSerialNumber: originalSerial,
        replacementSerialNumber: { id: "serial-other-sale" },
      },
    ];

    expect(
      wasLineForSameInvoiceReplacement({
        lineSerialNumberId: "serial-new",
        transactionNo: "TRN-1",
        replacements,
      }),
    ).toBe("Was Samsung QA55 · SN OLD-100");

    expect(
      wasLineForSameInvoiceReplacement({
        lineSerialNumberId: "serial-other-sale",
        transactionNo: "TRN-1",
        replacements,
      }),
    ).toBeNull();

    expect(
      wasLineForSameInvoiceReplacement({
        lineSerialNumberId: "serial-sibling",
        transactionNo: "TRN-1",
        replacements,
      }),
    ).toBeNull();
  });
});
