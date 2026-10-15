import {
  formatModelImportCbm,
  MODEL_IMPORT_ALIAS_MAP,
  MODEL_IMPORT_FIELD_LABELS,
  MODEL_SHEET_HEADERS,
  parseModelImportCbm,
} from "@/features/master-data/schemas/model-import.schema";

describe("model import cbm contract", () => {
  it("places cbm after status in the template headers", () => {
    expect(MODEL_SHEET_HEADERS.at(-2)).toBe("status");
    expect(MODEL_SHEET_HEADERS.at(-1)).toBe("cbm");
  });

  it("maps cbm aliases and exposes a field label", () => {
    expect(MODEL_IMPORT_ALIAS_MAP.cbm).toBe("cbm");
    expect(MODEL_IMPORT_ALIAS_MAP.cubicmeter).toBe("cbm");
    expect(MODEL_IMPORT_FIELD_LABELS.cbm).toBe("CBM");
  });
});

describe("parseModelImportCbm", () => {
  it("treats blank and dash as leave-existing / null-on-create", () => {
    expect(parseModelImportCbm(undefined)).toEqual({ kind: "blank" });
    expect(parseModelImportCbm(null)).toEqual({ kind: "blank" });
    expect(parseModelImportCbm("")).toEqual({ kind: "blank" });
    expect(parseModelImportCbm("  ")).toEqual({ kind: "blank" });
    expect(parseModelImportCbm("-")).toEqual({ kind: "blank" });
  });

  it("accepts finite non-negative numbers including commas", () => {
    expect(parseModelImportCbm("0.1234")).toEqual({ kind: "value", value: 0.1234 });
    expect(parseModelImportCbm("1,250.5")).toEqual({ kind: "value", value: 1250.5 });
    expect(parseModelImportCbm("0")).toEqual({ kind: "value", value: 0 });
  });

  it("rejects non-numeric, negative, and oversized values", () => {
    expect(parseModelImportCbm("abc")).toEqual({
      kind: "error",
      message: 'Invalid cbm "abc". Use a number (e.g. 0.1234).',
    });
    expect(parseModelImportCbm("-1")).toEqual({
      kind: "error",
      message: 'Invalid cbm "-1". CBM cannot be negative.',
    });
    expect(parseModelImportCbm("1000000")).toEqual({
      kind: "error",
      message: 'Invalid cbm "1000000". Value is too large.',
    });
  });
});

describe("formatModelImportCbm", () => {
  it("formats to four decimal places and blanks nulls", () => {
    expect(formatModelImportCbm(null)).toBe("");
    expect(formatModelImportCbm(undefined)).toBe("");
    expect(formatModelImportCbm(0.12)).toBe("0.1200");
  });
});
