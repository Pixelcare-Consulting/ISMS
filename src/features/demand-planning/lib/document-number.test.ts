import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatDemandPlanningDocumentNumber,
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
