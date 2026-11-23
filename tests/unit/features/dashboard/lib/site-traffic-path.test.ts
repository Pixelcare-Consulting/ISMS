import { nextPathVisit } from "@/features/dashboard/lib/site-traffic-path";

const earlier = new Date("2026-11-23T01:00:00.000Z");
const now = new Date("2026-11-23T01:05:00.000Z");

describe("nextPathVisit", () => {
  it("does not move the timestamp when the path stays the same", () => {
    const next = nextPathVisit({
      previousPath: "/dashboard/site-traffic",
      previousAt: earlier,
      path: "/dashboard/site-traffic",
      now,
    });

    expect(next.changed).toBe(false);
    expect(next.at).toBe(earlier);
    expect(next.path).toBe("/dashboard/site-traffic");
  });

  it("stamps the new time when the path changes", () => {
    const next = nextPathVisit({
      previousPath: "/dashboard/site-traffic",
      previousAt: earlier,
      path: "/settings/users",
      now,
    });

    expect(next.changed).toBe(true);
    expect(next.at).toBe(now);
    expect(next.path).toBe("/settings/users");
  });
});
