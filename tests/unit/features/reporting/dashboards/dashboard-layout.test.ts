import { READY_MADE_DASHBOARDS, READY_MADE_KEYS } from "@/features/custom-dashboards/ready-made/ready-made-dashboards";
import { DASHBOARD_CANVAS, layoutDashboard, type DashboardSpec } from "@/features/reporting/dashboards/dashboard-layout";
import { agingBucketLabel } from "@/features/reporting/datasets/dataset-catalog";

const tile = (name: string) => ({ name, kind: "INDICATOR" as const, title: name, datasetKey: "sales_kpis" as const });

describe("layoutDashboard", () => {
  it.each(READY_MADE_KEYS)("places every element of %s inside both canvases", (key) => {
    const spec = READY_MADE_DASHBOARDS[key].spec;
    const { placements, desktopHeight, mobileHeight } = layoutDashboard(spec);
    expect(placements.size).toBe(spec.sections.flatMap((s) => s.elements).length);
    for (const { desktop, mobile } of placements.values()) {
      expect(desktop.left + desktop.width).toBeLessThanOrEqual(DASHBOARD_CANVAS.desktopWidth);
      expect(mobile.left + mobile.width).toBeLessThanOrEqual(DASHBOARD_CANVAS.mobileWidth);
      expect(desktop.top + desktop.height).toBeLessThanOrEqual(desktopHeight);
      expect(mobile.top + mobile.height).toBeLessThanOrEqual(mobileHeight);
    }
  });

  it("shares a tile row equally and puts panels two per row", () => {
    const spec: DashboardSpec = {
      title: "t",
      sections: [
        { id: "a", layout: "TILES", elements: [tile("A"), tile("B")] },
        { id: "b", layout: "PANELS", elements: [tile("C"), tile("D"), tile("E")] },
      ],
    };
    const { placements } = layoutDashboard(spec);
    expect(placements.get("A")!.desktop.width).toBe(placements.get("B")!.desktop.width);
    expect(placements.get("C")!.desktop.top).toBe(placements.get("D")!.desktop.top);
    expect(placements.get("E")!.desktop.top).toBeGreaterThan(placements.get("C")!.desktop.top);
  });

  it("keeps filter boxes compact", () => {
    const spec: DashboardSpec = { title: "t", sections: [{ id: "f", layout: "FILTERS", elements: [tile("F")] }] };
    expect(layoutDashboard(spec).placements.get("F")!.desktop.width).toBeLessThan(DASHBOARD_CANVAS.desktopWidth / 2);
  });
});

describe("agingBucketLabel", () => {
  it.each([
    [0, "0-30 days"],
    [30, "0-30 days"],
    [31, "31-60 days"],
    [180, "91-180 days"],
    [181, "Over 180 days"],
  ])("%i days → %s", (days, label) => {
    expect(agingBucketLabel(days)).toBe(label);
  });
});
