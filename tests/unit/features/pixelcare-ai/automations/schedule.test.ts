import { decideAutomationDue } from "@/features/pixelcare-ai/automations/schedule";

const fridayAtEight = {
  timezone: "Asia/Manila",
  timeOfDayMinutes: 8 * 60,
  weekdays: [5],
};

describe("decideAutomationDue", () => {
  it("is due at the scheduled Manila minute and keeps that slot later the same day", () => {
    const atStart = decideAutomationDue(fridayAtEight, new Date("2026-10-16T00:00:00.000Z"));
    const later = decideAutomationDue(fridayAtEight, new Date("2026-10-16T10:30:00.000Z"));

    expect(atStart).toEqual({ kind: "due", slot: "2026-10-16T08:00" });
    expect(later).toEqual({ kind: "due", slot: "2026-10-16T08:00" });
  });

  it("waits until the local clock reaches the scheduled minute", () => {
    const early = decideAutomationDue(fridayAtEight, new Date("2026-10-15T23:59:00.000Z"));
    expect(early).toEqual({ kind: "not_due" });
  });

  it("skips a local weekday that is not selected", () => {
    const saturday = decideAutomationDue(fridayAtEight, new Date("2026-10-17T00:00:00.000Z"));
    expect(saturday).toEqual({ kind: "not_due" });
  });

  it("uses the automation timezone, so Manila can be due while New York is still Thursday", () => {
    const now = new Date("2026-10-16T00:00:00.000Z");
    const manila = decideAutomationDue(fridayAtEight, now);
    const newYork = decideAutomationDue({ ...fridayAtEight, timezone: "America/New_York" }, now);

    expect(manila).toEqual({ kind: "due", slot: "2026-10-16T08:00" });
    expect(newYork).toEqual({ kind: "not_due" });
  });

  it("is not due when no weekdays are selected", () => {
    const decision = decideAutomationDue(
      { ...fridayAtEight, weekdays: [] },
      new Date("2026-10-16T00:00:00.000Z"),
    );
    expect(decision).toEqual({ kind: "not_due" });
  });

  it("fails closed on an unknown timezone or an impossible time of day", () => {
    const now = new Date("2026-10-16T00:00:00.000Z");
    const timezone = decideAutomationDue({ ...fridayAtEight, timezone: "Not/AZone" }, now);
    const time = decideAutomationDue({ ...fridayAtEight, timeOfDayMinutes: 1500 }, now);

    expect(timezone.kind).toBe("invalid_timezone");
    expect(time.kind).toBe("invalid_schedule");
  });
});
