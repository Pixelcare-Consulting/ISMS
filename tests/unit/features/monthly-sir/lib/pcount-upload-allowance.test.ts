import {
  assertPsPcountUploadAllowed,
  isPsPcountUploadDay,
  pcountMonthWindows,
  PS_PCOUNT_UPLOAD_CLOSED_MESSAGE,
  resolvePcountAllowanceRole,
  resolvePcountUploadAllowance,
} from "@/features/monthly-sir/lib/pcount-upload-allowance";

/** Build a UTC instant that is `day` of `month`/`year` at noon Asia/Manila. */
function manilaNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0)); // UTC+8 noon
}

describe("resolvePcountAllowanceRole", () => {
  it("gives unlimited to inventory.manage and unrestricted admins", () => {
    expect(
      resolvePcountAllowanceRole(["inventory.manage"], ["ps"]),
    ).toBe("unlimited");
    expect(
      resolvePcountAllowanceRole(["inventory.view"], ["tl"], {
        unrestricted: true,
      }),
    ).toBe("unlimited");
  });

  it("maps ps and tl role slugs when not unlimited", () => {
    expect(resolvePcountAllowanceRole(["inventory.view"], ["ps"])).toBe("ps");
    expect(resolvePcountAllowanceRole(["inventory.view"], ["tl"])).toBe("tl");
    expect(resolvePcountAllowanceRole(["inventory.view"], ["ps", "tl"])).toBe(
      "ps",
    );
    expect(resolvePcountAllowanceRole(["inventory.view"], ["ae"])).toBe("none");
  });
});

describe("pcountMonthWindows", () => {
  it("splits Manila month into days 1–15 and 16–end", () => {
    const h1 = pcountMonthWindows(manilaNoon(2026, 10, 10));
    expect(h1.day).toBe(10);
    expect(h1.activeHalf).toBe("h1");
    expect(h1.h1EndExclusive.getTime()).toBe(h1.h2Start.getTime());
    expect(h1.h2EndExclusive.getTime()).toBe(h1.monthEndExclusive.getTime());

    const h2 = pcountMonthWindows(manilaNoon(2026, 10, 16));
    expect(h2.day).toBe(16);
    expect(h2.activeHalf).toBe("h2");
  });
});

describe("isPsPcountUploadDay", () => {
  it("allows the 14th–16th, the last 3 days, and the 1st", () => {
    expect(isPsPcountUploadDay(2026, 10, 1)).toBe(true);
    expect(isPsPcountUploadDay(2026, 10, 13)).toBe(false);
    expect(isPsPcountUploadDay(2026, 10, 14)).toBe(true);
    expect(isPsPcountUploadDay(2026, 10, 15)).toBe(true);
    expect(isPsPcountUploadDay(2026, 10, 16)).toBe(true);
    expect(isPsPcountUploadDay(2026, 10, 17)).toBe(false);
    expect(isPsPcountUploadDay(2026, 10, 28)).toBe(false);
    expect(isPsPcountUploadDay(2026, 10, 29)).toBe(true);
    expect(isPsPcountUploadDay(2026, 10, 31)).toBe(true);

    expect(isPsPcountUploadDay(2026, 4, 27)).toBe(false);
    expect(isPsPcountUploadDay(2026, 4, 28)).toBe(true);
    expect(isPsPcountUploadDay(2026, 4, 30)).toBe(true);

    expect(isPsPcountUploadDay(2026, 2, 25)).toBe(false);
    expect(isPsPcountUploadDay(2026, 2, 26)).toBe(true);
    expect(isPsPcountUploadDay(2026, 2, 28)).toBe(true);

    expect(isPsPcountUploadDay(2028, 2, 26)).toBe(false);
    expect(isPsPcountUploadDay(2028, 2, 27)).toBe(true);
    expect(isPsPcountUploadDay(2028, 2, 29)).toBe(true);
  });
});

describe("resolvePcountUploadAllowance — TL", () => {
  it("allows direct starts up to the monthly free budget then becomes request-only", () => {
    const open = resolvePcountUploadAllowance({
      role: "tl",
      manilaDay: 12,
      tlFreeStartsInMonth: 0,
    });
    expect(open.canDirectUpload).toBe(true);
    expect(open.mustRequest).toBe(false);
    expect(open.slotsRemainingToday).toBe(1);
    expect(open.slotsRemainingMonth).toBe(1);
    expect(open.slotsTotalMonth).toBe(1);

    const exhausted = resolvePcountUploadAllowance({
      role: "tl",
      manilaDay: 28,
      tlFreeStartsInMonth: 1,
    });
    expect(exhausted.canDirectUpload).toBe(false);
    expect(exhausted.mustRequest).toBe(true);
    expect(exhausted.slotsRemainingToday).toBe(0);
    expect(exhausted.slotsRemainingMonth).toBe(0);
    expect(exhausted.message).toMatch(/request/i);
  });

  it("honors a higher tenant TL free-slot budget", () => {
    const mid = resolvePcountUploadAllowance({
      role: "tl",
      manilaDay: 5,
      tlFreeStartsInMonth: 1,
      tlMonthlyFreeSlots: 2,
    });
    expect(mid.canDirectUpload).toBe(true);
    expect(mid.slotsRemainingToday).toBe(1);
    expect(mid.slotsTotalMonth).toBe(2);
  });
});

describe("resolvePcountUploadAllowance — PS calendar", () => {
  it("allows upload on open days with no slot cap", () => {
    const mid = resolvePcountUploadAllowance({
      role: "ps",
      manilaYear: 2026,
      manilaMonth: 10,
      manilaDay: 15,
      psFreeStartsH1: 4,
      psFreeStartsH2: 4,
      psMonthlyFreeSlots: 2,
    });
    expect(mid.canDirectUpload).toBe(true);
    expect(mid.mustRequest).toBe(false);
    expect(mid.slotsRemainingToday).toBeNull();
    expect(mid.slotsTotalMonth).toBeNull();
    expect(mid.activeHalf).toBeNull();
    expect(mid.message).toMatch(/today/i);

    const first = resolvePcountUploadAllowance({
      role: "ps",
      manilaYear: 2026,
      manilaMonth: 11,
      manilaDay: 1,
    });
    expect(first.canDirectUpload).toBe(true);
    expect(first.message).toMatch(/previous month/i);

    const monthEnd = resolvePcountUploadAllowance({
      role: "ps",
      manilaYear: 2026,
      manilaMonth: 10,
      manilaDay: 30,
    });
    expect(monthEnd.canDirectUpload).toBe(true);
  });

  it("blocks every other day, including when a request would already be approved", () => {
    const closed = resolvePcountUploadAllowance({
      role: "ps",
      manilaYear: 2026,
      manilaMonth: 10,
      manilaDay: 10,
      psFreeStartsH1: 0,
    });
    expect(closed.canDirectUpload).toBe(false);
    expect(closed.mustRequest).toBe(true);
    expect(closed.message).toBe(PS_PCOUNT_UPLOAD_CLOSED_MESSAGE);

    expect(() =>
      assertPsPcountUploadAllowed({
        role: "ps",
        year: 2026,
        month: 10,
        day: 10,
      }),
    ).toThrow(PS_PCOUNT_UPLOAD_CLOSED_MESSAGE);
    expect(() =>
      assertPsPcountUploadAllowed({
        role: "tl",
        year: 2026,
        month: 10,
        day: 10,
      }),
    ).not.toThrow();
    expect(() =>
      assertPsPcountUploadAllowed({
        role: "unlimited",
        year: 2026,
        month: 10,
        day: 2,
      }),
    ).not.toThrow();
  });
});

describe("resolvePcountUploadAllowance — unlimited / none", () => {
  it("keeps unlimited always on the direct path", () => {
    const allowance = resolvePcountUploadAllowance({
      role: "unlimited",
      manilaDay: 1,
    });
    expect(allowance.unlimited).toBe(true);
    expect(allowance.canDirectUpload).toBe(true);
    expect(allowance.mustRequest).toBe(false);
    expect(allowance.slotsRemainingToday).toBeNull();
  });

  it("forces request-only for roles with no free slots", () => {
    const allowance = resolvePcountUploadAllowance({
      role: "none",
      manilaDay: 1,
    });
    expect(allowance.canDirectUpload).toBe(false);
    expect(allowance.mustRequest).toBe(true);
    expect(allowance.slotsTotalMonth).toBe(0);
  });
});
