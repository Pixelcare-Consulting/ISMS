import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calendarMonthBoundsFromLabel } from "../lib/planning-period-dates";

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

  it("returns null for a non-month label", () => {
    assert.equal(calendarMonthBoundsFromLabel("Q1 FY26"), null);
  });
});
