import { manilaDayWindow, manilaTodayIso } from "@/features/orders/utils/manila-calendar";

// Run under any server TZ (CI is UTC; staging and dev machines are Asia/Manila):
// the results below must not change.
describe("manilaDayWindow", () => {
  it("spans 00:00 to 23:59:59.999 Manila time and keeps the picked date as the label", () => {
    expect(manilaDayWindow("2026-10-19")).toEqual({
      date: "2026-10-19",
      start: new Date("2026-10-18T16:00:00.000Z"),
      end: new Date("2026-10-19T15:59:59.999Z"),
    });
  });

  it("crosses month and year ends", () => {
    expect(manilaDayWindow("2026-12-31")?.end).toEqual(new Date("2026-12-31T15:59:59.999Z"));
  });

  it.each(["", "2026-13-01", "2026-02-30", "19/10/2026", "2026-10-19T00:00"])("rejects %p", (value) => {
    expect(manilaDayWindow(value)).toBeNull();
  });
});

describe("manilaTodayIso", () => {
  it("uses the Manila calendar date, not UTC", () => {
    // 01:30 on 20 Oct in Manila is still 19 Oct in UTC.
    expect(manilaTodayIso(new Date("2026-10-19T17:30:00Z"))).toBe("2026-10-20");
    expect(manilaTodayIso(new Date("2026-10-19T15:59:00Z"))).toBe("2026-10-19");
  });
});
