import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  averageOverHistoryMonths,
  formatHistoryWindowLabel,
  HISTORY_MONTHS,
  historyMonthSpan,
  resolveHistoryWindow,
  threeMonthHistoryWindow,
  toDateInputValue,
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

  it("averages totals over the chosen month span", () => {
    assert.equal(HISTORY_MONTHS, 3);
    assert.equal(averageOverHistoryMonths(9), 3);
    assert.equal(averageOverHistoryMonths(0), 0);
    assert.equal(averageOverHistoryMonths(10, 5), 2);
    assert.equal(averageOverHistoryMonths(8, 0), 8 / HISTORY_MONTHS);
  });

  it("counts inclusive calendar months for a custom window", () => {
    const from = new Date(Date.UTC(2025, 0, 1));
    const to = new Date(Date.UTC(2025, 5, 30, 23, 59, 59, 999));
    assert.equal(historyMonthSpan(from, to), 6);
  });

  it("resolves explicit date-input strings", () => {
    const periodStart = new Date(Date.UTC(2025, 11, 1));
    const window = resolveHistoryWindow(periodStart, "2025-01-01", "2025-06-30");
    assert.equal(toDateInputValue(window.historyFrom), "2025-01-01");
    assert.equal(toDateInputValue(window.historyTo), "2025-06-30");
    assert.equal(historyMonthSpan(window.historyFrom, window.historyTo), 6);
  });

  it("falls back to the default window when dates are missing or invalid", () => {
    const periodStart = new Date(Date.UTC(2025, 11, 1));
    const fallback = threeMonthHistoryWindow(periodStart);
    const missing = resolveHistoryWindow(periodStart, null, null);
    assert.equal(missing.historyFrom.toISOString(), fallback.historyFrom.toISOString());
    const inverted = resolveHistoryWindow(periodStart, "2025-06-30", "2025-01-01");
    assert.equal(inverted.historyFrom.toISOString(), fallback.historyFrom.toISOString());
  });
});
