import { parseCsvRows } from "@/lib/shared/parse-csv";

describe("parseCsvRows", () => {
  it("splits simple rows and cells", () => {
    expect(parseCsvRows("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted cells with embedded commas, quotes and newlines", () => {
    const csv = 'name,note\n"Doe, Jane","She said ""hi""\nthen left"';
    expect(parseCsvRows(csv)).toEqual([
      ["name", "note"],
      ["Doe, Jane", 'She said "hi"\nthen left'],
    ]);
  });

  it("accepts CRLF line endings and a UTF-8 BOM", () => {
    expect(parseCsvRows("﻿a,b\r\n1,2\r\n")).toEqual(
      expect.arrayContaining([
        ["a", "b"],
        ["1", "2"],
      ]),
    );
  });

  it("preserves blank rows so line numbers match the spreadsheet", () => {
    const rows = parseCsvRows("a\n\nb");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([""]);
  });
});
