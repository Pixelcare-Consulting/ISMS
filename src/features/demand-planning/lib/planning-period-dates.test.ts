import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calendarMonthBoundsFromLabel,
  displayPeriodLabel,
  formatPeriodLabelFromDate,
  normalizePeriodLabel,
} from "../lib/planning-period-dates";

describe("calendarMonthBoundsFromLabel", () => {
  it("parses Dec-25 as December 2025", () => {
    const bounds = calendarMonthBoundsFromLabel("Dec-25");
    assert.ok(bounds);
    assert.equal(bounds.startDate.toISOString(), "2025-12-01T00:00:00.000Z");
    assert.equal(bounds.endDate.toISOString(), "2025-12-31T23:59:59.999Z");
  });

  it("parses December 2025 and 2025-12", () => {
    const named = calendarMonthBoundsFromLabel("December 2025");
    const iso = calendarMonthBoundsFromLabel("2025-12");
    assert.ok(named && iso);
    assert.equal(named.startDate.toISOString(), iso.startDate.toISOString());
    assert.equal(named.endDate.toISOString(), iso.endDate.toISOString());
  });

  it("parses YYYYMMDD and YYYY-MM-DD as month bounds", () => {
    const compact = calendarMonthBoundsFromLabel("20150901");
    const dashed = calendarMonthBoundsFromLabel("2015-09-15");
    assert.ok(compact && dashed);
    assert.equal(compact.startDate.toISOString(), "2015-09-01T00:00:00.000Z");
    assert.equal(compact.endDate.toISOString(), "2015-09-30T23:59:59.999Z");
    assert.equal(dashed.startDate.toISOString(), compact.startDate.toISOString());
  });

  it("returns null for a non-month label", () => {
    assert.equal(calendarMonthBoundsFromLabel("Q1 FY26"), null);
  });
});

describe("formatPeriodLabelFromDate / normalizePeriodLabel", () => {
  it("formats month as MMM-YY", () => {
    assert.equal(
      formatPeriodLabelFromDate(new Date(Date.UTC(2015, 8, 1))),
      "Sep-15",
    );
    assert.equal(
      formatPeriodLabelFromDate(new Date(Date.UTC(2026, 8, 1))),
      "Sep-26",
    );
  });

  it("normalizes legacy and ISO labels to MMM-YY", () => {
    assert.equal(normalizePeriodLabel("Dec-25"), "Dec-25");
    assert.equal(normalizePeriodLabel("2025-12"), "Dec-25");
    assert.equal(normalizePeriodLabel("2025-12-15"), "Dec-25");
    assert.equal(normalizePeriodLabel("20251201"), "Dec-25");
    assert.equal(normalizePeriodLabel("September 2015"), "Sep-15");
  });

  it("displayPeriodLabel maps YYYYMMDD for UI without changing unparseable text", () => {
    assert.equal(displayPeriodLabel("20260901"), "Sep-26");
    assert.equal(displayPeriodLabel("Q1 FY26"), "Q1 FY26");
  });

  it("returns null for unparseable labels", () => {
    assert.equal(normalizePeriodLabel("Q1 FY26"), null);
    assert.equal(normalizePeriodLabel(""), null);
  });
});
