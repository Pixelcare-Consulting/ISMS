import {
  pcountMonthWindows,
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

describe("resolvePcountUploadAllowance — TL", () => {
  it("allows one direct upload per month then becomes request-only", () => {
    const open = resolvePcountUploadAllowance({
      role: "tl",
      manilaDay: 12,
      tlUploadedInMonth: 0,
    });
    expect(open.canDirectUpload).toBe(true);
    expect(open.mustRequest).toBe(false);
    expect(open.slotsRemainingToday).toBe(1);
    expect(open.slotsRemainingMonth).toBe(1);
    expect(open.slotsTotalMonth).toBe(1);

    const exhausted = resolvePcountUploadAllowance({
      role: "tl",
      manilaDay: 28,
      tlUploadedInMonth: 1,
    });
    expect(exhausted.canDirectUpload).toBe(false);
    expect(exhausted.mustRequest).toBe(true);
    expect(exhausted.slotsRemainingToday).toBe(0);
    expect(exhausted.slotsRemainingMonth).toBe(0);
    expect(exhausted.message).toMatch(/request/i);
  });
});

describe("resolvePcountUploadAllowance — PS windows", () => {
  it("allows H1 direct upload only on days 1–15", () => {
    const early = resolvePcountUploadAllowance({
      role: "ps",
      manilaDay: 5,
      psUploadedH1: 0,
      psUploadedH2: 0,
    });
    expect(early.activeHalf).toBe("h1");
    expect(early.canDirectUpload).toBe(true);
    expect(early.slotsRemainingToday).toBe(1);
    expect(early.slotsRemainingMonth).toBe(2);
    expect(early.message).toMatch(/16th/);

    const h1UsedInH1 = resolvePcountUploadAllowance({
      role: "ps",
      manilaDay: 10,
      psUploadedH1: 1,
      psUploadedH2: 0,
    });
    expect(h1UsedInH1.canDirectUpload).toBe(false);
    expect(h1UsedInH1.mustRequest).toBe(true);
    expect(h1UsedInH1.slotsRemainingToday).toBe(0);
    expect(h1UsedInH1.slotsRemainingMonth).toBe(1);
    expect(h1UsedInH1.message).toMatch(/16th/);
  });

  it("allows H2 direct upload only on days 16–end", () => {
    const late = resolvePcountUploadAllowance({
      role: "ps",
      manilaDay: 20,
      psUploadedH1: 0,
      psUploadedH2: 0,
    });
    expect(late.activeHalf).toBe("h2");
    expect(late.canDirectUpload).toBe(true);
    expect(late.slotsRemainingToday).toBe(1);
    // Unused H1 still counts toward month remaining, but is not usable after the 15th.
    expect(late.slotsRemainingMonth).toBe(2);

    const h2Used = resolvePcountUploadAllowance({
      role: "ps",
      manilaDay: 22,
      psUploadedH1: 0,
      psUploadedH2: 1,
    });
    expect(h2Used.canDirectUpload).toBe(false);
    expect(h2Used.mustRequest).toBe(true);
    expect(h2Used.slotsRemainingToday).toBe(0);
    expect(h2Used.message).toMatch(/first-half|request/i);
  });

  it("becomes request-only when both PS slots are consumed", () => {
    const both = resolvePcountUploadAllowance({
      role: "ps",
      manilaDay: 18,
      psUploadedH1: 1,
      psUploadedH2: 1,
    });
    expect(both.canDirectUpload).toBe(false);
    expect(both.mustRequest).toBe(true);
    expect(both.slotsRemainingMonth).toBe(0);
    expect(both.message).toMatch(/Both free/i);
  });

  it("does not let an unused H2 slot be used during H1", () => {
    const mid = resolvePcountUploadAllowance({
      role: "ps",
      manilaDay: 15,
      psUploadedH1: 1,
      psUploadedH2: 0,
    });
    expect(mid.activeHalf).toBe("h1");
    expect(mid.canDirectUpload).toBe(false);
    expect(mid.slotsRemainingToday).toBe(0);
    expect(mid.slotsRemainingMonth).toBe(1);
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
