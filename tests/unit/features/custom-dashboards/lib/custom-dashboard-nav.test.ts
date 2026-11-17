import {
  appNavigation,
  filterNavByPermissions,
  flattenNavLinks,
  resolveActiveNavHrefs,
  type NavEntry,
  type NavGroupEntry,
} from "@/config/app-navigation";
import { setupNavigation } from "@/config/setup-navigation";
import {
  CUSTOM_DASHBOARD_MANAGE,
  CUSTOM_DASHBOARD_VIEW,
} from "@/features/custom-dashboards/constants/custom-dashboard-permissions";
import { withCustomDashboardNav } from "@/features/custom-dashboards/lib/custom-dashboard-nav";

const DASHBOARDS = [
  { id: "a1", name: "Branch KPIs" },
  { id: "b2", name: "Weekly Sales" },
];

function dashboardGroup(entries: NavEntry[]): NavGroupEntry {
  const group = entries.find(
    (entry): entry is NavGroupEntry => entry.type === "group" && entry.label === "Dashboard",
  );
  if (!group) throw new Error("Dashboard group missing");
  return group;
}

function dashboardHrefs(entries: NavEntry[]): string[] {
  return flattenNavLinks(dashboardGroup(entries).items).map((item) => item.href);
}

describe("custom dashboards in the Dashboard sidebar", () => {
  const allDashboardPermissions = [
    "dashboard.view",
    "orders.view",
    "sales.view",
    "inventory.view",
    CUSTOM_DASHBOARD_VIEW,
  ];

  it("hides the Operations and Sales dashboards", () => {
    const hrefs = dashboardHrefs(filterNavByPermissions(appNavigation, allDashboardPermissions));
    expect(hrefs).not.toContain("/dashboard/operations");
    expect(hrefs).not.toContain("/dashboard/sales");
  });

  it("lists each readable dashboard after the list page", () => {
    const entries = filterNavByPermissions(
      withCustomDashboardNav(appNavigation, DASHBOARDS),
      [CUSTOM_DASHBOARD_VIEW],
    );
    const group = dashboardGroup(entries);
    const section = group.items.find((child) => "items" in child && child.label === "Custom Dashboards");
    expect(section && "items" in section ? section.items.map((item) => item.label) : []).toEqual([
      "Dashboard library",
      "Branch KPIs",
      "Weekly Sales",
    ]);
    expect(dashboardHrefs(entries)).toEqual(
      expect.arrayContaining(["/dashboard/custom", "/dashboard/custom/a1", "/dashboard/custom/b2"]),
    );
  });

  it("adds them to the setup navigation too", () => {
    const entries = filterNavByPermissions(
      withCustomDashboardNav(setupNavigation, DASHBOARDS),
      [CUSTOM_DASHBOARD_MANAGE],
    );
    expect(dashboardHrefs(entries)).toEqual(
      expect.arrayContaining(["/dashboard/custom/a1", "/dashboard/custom/b2"]),
    );
  });

  it("keeps the plain link when there are no dashboards", () => {
    const entries = withCustomDashboardNav(appNavigation, []);
    expect(entries).toBe(appNavigation);
  });

  it("shows nothing without custom dashboard access", () => {
    const entries = filterNavByPermissions(withCustomDashboardNav(appNavigation, DASHBOARDS), [
      "dashboard.view",
    ]);
    expect(dashboardHrefs(entries).some((href) => href.startsWith("/dashboard/custom"))).toBe(false);
  });
});

describe("resolveActiveNavHrefs", () => {
  const items = dashboardGroup(
    filterNavByPermissions(withCustomDashboardNav(appNavigation, DASHBOARDS), [
      "dashboard.view",
      CUSTOM_DASHBOARD_VIEW,
    ]),
  ).items;

  it.each([
    ["/dashboard/custom/a1", ["/dashboard/custom/a1"]],
    ["/dashboard/custom/a1/edit", ["/dashboard/custom/a1"]],
    ["/dashboard/custom", ["/dashboard/custom"]],
    // Ready-made views and dashboards shared after the sidebar loaded fall back to the list page.
    ["/dashboard/custom/ready/sales-trends", ["/dashboard/custom"]],
    ["/dashboard/custom/zz9", ["/dashboard/custom"]],
    ["/dashboard", ["/dashboard"]],
  ])("%s highlights %j", (pathname, expected) => {
    expect([...resolveActiveNavHrefs(pathname, items)]).toEqual(expected);
  });
});
