import {
  manilaDateTimeInputValue,
  parseManilaDateTime,
} from "@/features/logistics/lib/shipment";

describe("pull-out Date-Time Schedule", () => {
  it("reads the input as Manila time", () => {
    expect(parseManilaDateTime("2026-11-10T14:30")?.toISOString()).toBe("2026-11-10T06:30:00.000Z");
  });

  it("shows a saved time back in Manila, even across midnight UTC", () => {
    expect(manilaDateTimeInputValue("2026-11-10T06:30:00.000Z")).toBe("2026-11-10T14:30");
    expect(manilaDateTimeInputValue("2026-11-10T20:00:00.000Z")).toBe("2026-11-11T04:00");
  });

  it("round-trips a saved value without moving it", () => {
    const saved = parseManilaDateTime("2026-12-31T23:59");
    expect(saved).not.toBeNull();
    expect(manilaDateTimeInputValue(saved?.toISOString() ?? null)).toBe("2026-12-31T23:59");
  });

  it("rejects impossible or malformed values", () => {
    expect(parseManilaDateTime("2026-02-31T10:00")).toBeNull();
    expect(parseManilaDateTime("2026-11-10")).toBeNull();
    expect(parseManilaDateTime("not a date")).toBeNull();
  });

  it("shows an empty input when nothing is saved", () => {
    expect(manilaDateTimeInputValue(null)).toBe("");
  });
});
