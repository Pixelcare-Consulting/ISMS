import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  documentNumberPrefixesForPeriod,
  formatDemandPlanningDocumentNumber,
  nextDocumentSequence,
  parseDocumentSequence,
  yearMonthKeyFromDate,
} from "../lib/document-number";

describe("formatDemandPlanningDocumentNumber", () => {
  it("formats DP-YYYYMM-nnn", () => {
    assert.equal(
      formatDemandPlanningDocumentNumber(new Date(Date.UTC(2015, 8, 1)), 32),
      "DP-201509-032",
    );
    assert.equal(
      formatDemandPlanningDocumentNumber(new Date(Date.UTC(2025, 11, 1)), 1),
      "DP-202512-001",
    );
  });
});

describe("yearMonthKeyFromDate", () => {
  it("returns YYYYMM", () => {
    assert.equal(yearMonthKeyFromDate(new Date(Date.UTC(2015, 8, 1))), "201509");
  });
});

describe("nextDocumentSequence", () => {
  const periodStart = new Date(Date.UTC(2026, 9, 1));
  const prefixes = documentNumberPrefixesForPeriod(periodStart);

  it("starts at 1 when no numbers exist", () => {
    assert.equal(nextDocumentSequence([], prefixes), 1);
  });

  it("uses max sequence not row count after gaps from deletes", () => {
    assert.equal(
      nextDocumentSequence(["DP-202610-001", "DP-202610-007", "DP-202610-003"], prefixes),
      8,
    );
  });

  it("counts mis-issued SP numbers so allocation does not reuse them", () => {
    assert.equal(
      nextDocumentSequence(["DP-202610-007", "SP-202610-008"], prefixes),
      9,
    );
  });

  it("ignores other months and legacy daily DP-YYYYMMDD numbers", () => {
    assert.equal(
      nextDocumentSequence(
        ["DP-202609-099", "DP-20261015-001", "DP-202610-004"],
        prefixes,
      ),
      5,
    );
  });
});

describe("parseDocumentSequence", () => {
  it("parses padded sequence after prefix", () => {
    assert.equal(parseDocumentSequence("DP-202610-007", "DP-202610-"), 7);
    assert.equal(parseDocumentSequence("SP-202610-008", "SP-202610-"), 8);
  });

  it("returns NaN when prefix does not match", () => {
    assert.equal(Number.isNaN(parseDocumentSequence("DP-202610-007", "SP-202610-")), true);
  });
});
