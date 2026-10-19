import {
  ANALYTICS_CANVAS,
  ANALYTICS_SECTIONS,
  layoutAnalytics,
} from "@/features/reporting/dashboards/analytics-layout";

const opsTiles = ANALYTICS_SECTIONS.find((s) => s.id === "ops")!.elements;

describe("layoutAnalytics", () => {
  it("places every element when all are visible", () => {
    const { placements } = layoutAnalytics(() => true);
    expect(placements.size).toBe(ANALYTICS_SECTIONS.flatMap((s) => s.elements).length);
  });

  it("widens remaining tiles to fill the row when some are hidden", () => {
    const visible = new Set([opsTiles[0].name, opsTiles[1].name]);
    const { placements } = layoutAnalytics((el) => visible.has(el.name));
    const a = placements.get(opsTiles[0].name)!.desktop;
    const b = placements.get(opsTiles[1].name)!.desktop;
    expect(a.width).toBe(b.width);
    expect(b.left + b.width).toBeGreaterThanOrEqual(ANALYTICS_CANVAS.desktopWidth - 1);
  });

  it("collapses hidden sections so the next section moves up", () => {
    const salesTile = ANALYTICS_SECTIONS.find((s) => s.id === "sales")!.elements[0];
    const { placements, desktopHeight } = layoutAnalytics((el) => el.name === salesTile.name);
    expect(placements.get(salesTile.name)!.desktop.top).toBe(0);
    expect(desktopHeight).toBeLessThan(200);
  });

  it("keeps mobile placements inside the mobile canvas", () => {
    const { placements } = layoutAnalytics(() => true);
    for (const { mobile } of placements.values()) {
      expect(mobile.left + mobile.width).toBeLessThanOrEqual(ANALYTICS_CANVAS.mobileWidth);
    }
  });
});
