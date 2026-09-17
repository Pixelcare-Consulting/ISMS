import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  averageOverHistoryMonths,
  formatHistoryWindowLabel,
  HISTORY_MONTHS,
  threeMonthHistoryWindow,
} from "./history-window";

describe("threeMonthHistoryWindow", () => {
  it("uses the three calendar months before the planning month", () => {
    const periodStart = new Date(Date.UTC(2025, 11, 1));
    const window = threeMonthHistoryWindow(periodStart);
    assert.equal(window.historyFrom.toISOString(), "2025-09-01T00:00:00.000Z");
    assert.equal(window.historyTo.toISOString(), "2025-11-30T23:59:59.999Z");
  });

  it("formats the window as a short month span", () => {
    const periodStart = new Date(Date.UTC(2025, 11, 1));
    assert.equal(formatHistoryWindowLabel(periodStart), "Sep – Nov 2025 (3 mo)");
  });

  it("averages totals over three months", () => {
    assert.equal(HISTORY_MONTHS, 3);
    assert.equal(averageOverHistoryMonths(9), 3);
    assert.equal(averageOverHistoryMonths(0), 0);
  });
});
