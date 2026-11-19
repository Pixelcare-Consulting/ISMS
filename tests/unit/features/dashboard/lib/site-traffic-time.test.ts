import { formatSiteTrafficRelativeTime } from "@/features/dashboard/lib/site-traffic-time";

const SEEN = "2026-11-17T13:18:40.000Z";

function later(seconds: number): string {
  return new Date(Date.parse(SEEN) + seconds * 1000).toISOString();
}

describe("formatSiteTrafficRelativeTime", () => {
  it("returns the same label whenever the clock argument does not move", () => {
    const now = later(1);
    const fromDate = formatSiteTrafficRelativeTime(new Date(SEEN), new Date(now));
    const fromString = formatSiteTrafficRelativeTime(SEEN, now);

    expect(fromDate).toBe("1 second ago");
    expect(fromString).toBe(fromDate);
    expect(formatSiteTrafficRelativeTime(SEEN, now)).toBe(fromDate);
  });

  it("changes only when the caller passes a later clock", () => {
    expect(formatSiteTrafficRelativeTime(SEEN, later(1))).toBe("1 second ago");
    expect(formatSiteTrafficRelativeTime(SEEN, later(2))).toBe("2 seconds ago");
  });

  it("uses the same unit boundaries as the activity table", () => {
    expect(formatSiteTrafficRelativeTime(SEEN, later(0))).toBe("0 seconds ago");
    expect(formatSiteTrafficRelativeTime(SEEN, later(60))).toBe("1 minute ago");
    expect(formatSiteTrafficRelativeTime(SEEN, later(120))).toBe("2 minutes ago");
    expect(formatSiteTrafficRelativeTime(SEEN, later(3600))).toBe("1 hour ago");
    expect(formatSiteTrafficRelativeTime(SEEN, later(47 * 3600))).toBe("47 hours ago");
    expect(formatSiteTrafficRelativeTime(SEEN, later(48 * 3600))).toBe("2 days ago");
    expect(formatSiteTrafficRelativeTime(SEEN, later(3 * 24 * 3600))).toBe("3 days ago");
  });

  it("returns a dash when either instant is invalid", () => {
    expect(formatSiteTrafficRelativeTime("not-a-date", later(1))).toBe("—");
    expect(formatSiteTrafficRelativeTime(SEEN, "not-a-date")).toBe("—");
  });
});
