import { announcementFormSchema } from "@/features/announcements/schemas/announcement.schema";
import {
  announcementDateTimeLocalValue,
  isAnnouncementOnOverviewFeed,
  parseAnnouncementDateTime,
} from "@/features/announcements/lib/announcement-schedule";

const base = {
  title: "Team update",
  body: "Details for the team",
  isActive: true,
};

describe("announcement publish and expiry times", () => {
  it("stores a zone-less clock as Asia/Manila, not the server zone", () => {
    const parsed = announcementFormSchema.parse({
      ...base,
      publishedAt: "2026-11-24T13:32",
      expiresAt: "2026-11-24T18:00",
    });

    expect(parsed.publishedAt.toISOString()).toBe("2026-11-24T05:32:00.000Z");
    expect(parsed.expiresAt?.toISOString()).toBe("2026-11-24T10:00:00.000Z");
  });

  it("reads a saved instant back as the Manila wall clock", () => {
    expect(announcementDateTimeLocalValue("2026-11-24T05:32:00.000Z")).toBe(
      "2026-11-24T13:32",
    );
    expect(announcementDateTimeLocalValue(new Date("2026-11-24T20:00:00.000Z"))).toBe(
      "2026-11-25T04:00",
    );
  });

  it("keeps an already-parsed instant when the service validates it again", () => {
    const publishedAt = new Date("2026-11-24T05:32:00.000Z");
    const parsed = announcementFormSchema.parse({
      ...base,
      publishedAt,
      expiresAt: null,
    });

    expect(parsed.publishedAt.toISOString()).toBe(publishedAt.toISOString());
    expect(parsed.expiresAt).toBeNull();
  });

  it("includes a post published at the current Manila time and hides one an hour ahead", () => {
    const now = new Date();
    const publishedNow = announcementFormSchema.parse({
      ...base,
      publishedAt: announcementDateTimeLocalValue(now),
      expiresAt: "",
    });
    const publishedAhead = announcementFormSchema.parse({
      ...base,
      publishedAt: announcementDateTimeLocalValue(new Date(now.getTime() + 60 * 60 * 1000)),
      expiresAt: null,
    });

    expect(publishedNow.expiresAt).toBeNull();
    expect(
      isAnnouncementOnOverviewFeed(
        { isActive: true, publishedAt: publishedNow.publishedAt, expiresAt: publishedNow.expiresAt },
        now,
      ),
    ).toBe(true);
    expect(
      isAnnouncementOnOverviewFeed(
        {
          isActive: true,
          publishedAt: publishedAhead.publishedAt,
          expiresAt: publishedAhead.expiresAt,
        },
        now,
      ),
    ).toBe(false);
  });

  it("uses the same window for a fixed Manila clock", () => {
    const now = new Date("2026-11-24T05:32:00.000Z");
    const current = parseAnnouncementDateTime("2026-11-24T13:32");
    const ahead = parseAnnouncementDateTime("2026-11-24T14:32");

    expect(current?.toISOString()).toBe(now.toISOString());
    expect(
      isAnnouncementOnOverviewFeed(
        { isActive: true, publishedAt: current!, expiresAt: null },
        now,
      ),
    ).toBe(true);
    expect(
      isAnnouncementOnOverviewFeed(
        { isActive: true, publishedAt: ahead!, expiresAt: null },
        now,
      ),
    ).toBe(false);
  });

  it("rejects a clock that is not a real Manila date", () => {
    expect(parseAnnouncementDateTime("2026-02-31T10:00")).toBeNull();
    const parsed = announcementFormSchema.safeParse({
      ...base,
      publishedAt: "2026-02-31T10:00",
      expiresAt: "",
    });
    expect(parsed.success).toBe(false);
  });
});
