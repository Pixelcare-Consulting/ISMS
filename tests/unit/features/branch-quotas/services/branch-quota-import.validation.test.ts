import {
  formatQuotaAmount,
  isBlankOrDash,
  lookupKey,
  parseImportMonth,
  parseImportQuotaAmount,
  quotaImportUniqueKey,
} from "@/features/branch-quotas/services/branch-quota-import.validation";

describe("branch-quota-import validation", () => {
  describe("parseImportMonth", () => {
    it("accepts YYYY-MM and returns first-of-month UTC", () => {
      const result = parseImportMonth("2026-10");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.monthLabel).toBe("2026-10");
      expect(result.quotaDate.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    });

    it("accepts YYYY-MM-DD and normalizes to month label", () => {
      const result = parseImportMonth("2026-03-15");
      expect("error" in result).toBe(false);
      if ("error" in result) return;
      expect(result.monthLabel).toBe("2026-03");
      expect(result.quotaDate.getUTCDate()).toBe(1);
    });

    it("rejects empty, invalid, and out-of-range months", () => {
      expect(parseImportMonth("")).toEqual({
        error: "month is empty (use YYYY-MM).",
      });
      expect(parseImportMonth("-")).toEqual({
        error: "month is empty (use YYYY-MM).",
      });
      expect(parseImportMonth("Oct 2026")).toEqual({
        error: 'Invalid month "Oct 2026" (use YYYY-MM).',
      });
      expect(parseImportMonth("2026-13")).toEqual({
        error: 'Invalid month "2026-13" (use YYYY-MM).',
      });
      expect(parseImportMonth("2026-00")).toEqual({
        error: 'Invalid month "2026-00" (use YYYY-MM).',
      });
    });
  });

  describe("parseImportQuotaAmount", () => {
    it("accepts positive amounts including commas", () => {
      expect(parseImportQuotaAmount("100")).toEqual({ amount: 100 });
      expect(parseImportQuotaAmount("1,250.5")).toEqual({ amount: 1250.5 });
    });

    it("rejects empty, non-numeric, and non-positive amounts", () => {
      expect(parseImportQuotaAmount("")).toEqual({
        error: "quota_amount is empty.",
      });
      expect(parseImportQuotaAmount("abc")).toEqual({
        error: 'Invalid quota_amount "abc".',
      });
      expect(parseImportQuotaAmount("0")).toEqual({
        error: "quota_amount must be greater than 0.",
      });
      expect(parseImportQuotaAmount("-5")).toEqual({
        error: "quota_amount must be greater than 0.",
      });
    });
  });

  describe("quotaImportUniqueKey", () => {
    it("joins branch, brand, and month for upsert matching", () => {
      expect(quotaImportUniqueKey("b1", "brand1", "2026-10")).toBe(
        "b1|brand1|2026-10",
      );
    });
  });

  describe("helpers", () => {
    it("normalizes lookup keys and blank/dash cells", () => {
      expect(lookupKey("  Devant ")).toBe("devant");
      expect(isBlankOrDash(null)).toBe(true);
      expect(isBlankOrDash("-")).toBe(true);
      expect(isBlankOrDash("x")).toBe(false);
      expect(formatQuotaAmount(100)).toBe("100");
      expect(formatQuotaAmount("42.5")).toBe("42.5");
    });
  });
});
