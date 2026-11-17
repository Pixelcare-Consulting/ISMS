jest.mock("@/lib/auth/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/auth", () => ({ auth: jest.fn(), signOutServer: jest.fn() }));
jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

import { appModules, formatPermissionName, parsePermissionSlug } from "@/config/app-modules";
import { matchesTableSearch } from "@/utils/match-table-search";
import {
  appNavigation,
  filterNavByPermissions,
  flattenNavLinks,
} from "@/config/app-navigation";
import {
  canViewPullouts,
  resolveLogisticsCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import { groupPermissionsByModule } from "@/features/roles/lib/group-permissions-by-module";
import { ROLE_TEMPLATES } from "@/features/roles/lib/role-templates";
import { PERMISSIONS, ROLES } from "../../../../../prisma/seed-data";

const PULLOUTS_HREF = "/logistics/pickups";

/** What opened the module before it had its own permission. */
const PREVIOUS_GATE = [
  "logistics.view",
  "logistics.create",
  "logistics.manage",
  "logistics.delivery.receive",
  "orders.create",
  "orders.view",
];

function showsPullouts(permissions: string[]): boolean {
  return filterNavByPermissions(appNavigation, permissions).some((entry) => {
    if (entry.type === "link") return entry.href === PULLOUTS_HREF;
    return flattenNavLinks(entry.items).some((item) => item.href === PULLOUTS_HREF);
  });
}

describe("pull-outs permission module", () => {
  it("resolves the slug to its own module", () => {
    expect(parsePermissionSlug("pullouts.view")).toMatchObject({
      module: { id: "pullouts", name: "Branch pull-outs" },
      action: "view",
    });
  });

  it("groups apart from deliveries and transfers in role setup", () => {
    const groups = groupPermissionsByModule([
      { id: "1", slug: "logistics.view", name: "View deliveries and transfers" },
      { id: "2", slug: "pullouts.view", name: "View Pull-outs" },
      {
        id: "3",
        slug: "service_centers.logistics.view",
        name: "View service center deliveries and pull-outs",
      },
    ] as Parameters<typeof groupPermissionsByModule>[0]);

    expect(groups.map((group) => group.moduleId)).toEqual([
      "logistics",
      "pullouts",
      "service_centers_logistics",
    ]);
    expect(groups.map((group) => group.area)).toEqual(["Inventory", "Inventory", "Inventory"]);
    expect(groups.map((group) => group.moduleName)).toEqual([
      "Branch deliveries",
      "Branch pull-outs",
      "Service center deliveries and pull-outs",
    ]);
    expect(groups[0]?.permissions.map((permission) => permission.label)).toEqual(["View"]);
    expect(groups[1]?.permissions.map((permission) => permission.label)).toEqual(["View"]);
  });

  it("searching Pull-out finds the sidebar pages and not deliveries", () => {
    const matches = (id: string) => {
      const appModule = appModules.find((module) => module.id === id);
      return matchesTableSearch("Pull-out", [
        appModule?.area,
        appModule?.name,
        appModule?.description,
      ]);
    };

    expect(matches("pullouts")).toBe(true);
    expect(matches("service_centers_logistics")).toBe(true);
    expect(matches("logistics")).toBe(false);
    expect(matches("status_settings")).toBe(false);
    expect(formatPermissionName(appModules.find((module) => module.id === "pullouts")!, "view")).toBe(
      "View — Branch pull-outs",
    );
  });

  it("hides legacy order and return cards and separates Monthly SIR", () => {
    const groups = groupPermissionsByModule(
      PERMISSIONS.map((permission) => ({
        id: permission.slug,
        slug: permission.slug,
        name: permission.name,
      })),
    );
    const visibleSlugs = groups.flatMap((group) => group.permissions.map((item) => item.slug));

    expect(groups.some((group) => group.moduleId === "other")).toBe(false);
    for (const name of ["Branch orders", "Branch returns", "Service center returns"]) {
      expect(groups.map((group) => group.moduleName)).not.toContain(name);
    }
    for (const slug of [
      "orders.view",
      "orders.create",
      "orders.approve",
      "sales.return.view",
      "service_centers.return.request",
    ]) {
      expect(visibleSlugs).not.toContain(slug);
    }
    expect(groups.find((group) => group.moduleName === "Monthly SIR")?.permissions.map((item) => item.slug)).toEqual([
      "inventory.monthly_sir.view",
    ]);
    expect(groups.find((group) => group.moduleName === "Branch inventory")?.description).toBe(
      "Opens branch Inventory.",
    );

    const monthlySir = flattenNavLinks(
      appNavigation.flatMap((entry) => (entry.type === "group" ? entry.items : [])),
    ).find((item) => item.href === "/inventory/monthly-sir");
    expect(monthlySir?.permission).toBe("inventory.monthly_sir.view");

    const deliveries = groups.find((group) => group.moduleName === "Branch deliveries");
    expect(deliveries?.permissions.find((item) => item.slug === "logistics.delivery.dispatch")?.label).toBe(
      "Dispatch",
    );
    expect(deliveries?.permissions.some((item) => item.label.includes("Deliveries"))).toBe(false);

    const missingMonthlySir = ROLES.filter((role) => {
      const granted = role.permissions as readonly string[];
      return granted.includes("inventory.view") && !granted.includes("inventory.monthly_sir.view");
    }).map((role) => role.slug);
    expect(missingMonthlySir).toEqual([]);
  });

  it("is in the seed catalogue", () => {
    expect(PERMISSIONS.map((permission) => permission.slug as string)).toContain("pullouts.view");
  });

  it("keeps every seeded role that could open the module", () => {
    const missing = ROLES.filter((role) => {
      const granted = role.permissions as readonly string[];
      return (
        PREVIOUS_GATE.some((slug) => granted.includes(slug)) && !granted.includes("pullouts.view")
      );
    }).map((role) => role.slug);

    expect(missing).toEqual([]);
  });

  it("keeps role templates that could open the module", () => {
    const missing = ROLE_TEMPLATES.filter(
      (template) =>
        PREVIOUS_GATE.some((slug) => template.permissionSlugs.includes(slug)) &&
        !template.permissionSlugs.includes("pullouts.view"),
    ).map((template) => template.id);

    expect(missing).toEqual([]);
  });

  it.each([
    [["pullouts.view"], true],
    [["orders.view"], false],
    [["orders.create"], false],
    [["logistics.view"], false],
    [["logistics.manage"], false],
  ])("for %j opens the module: %s", (permissions, expected) => {
    expect(canViewPullouts(permissions)).toBe(expected);
    expect(showsPullouts(permissions)).toBe(expected);
  });

  it("stays closed with no permissions", () => {
    expect(canViewPullouts(undefined)).toBe(false);
  });

  it("does not grant any pull-out action", () => {
    const caps = resolveLogisticsCapabilities(["pullouts.view"]);

    expect(caps.canCreate).toBe(false);
    expect(caps.canApproveTl).toBe(false);
    expect(caps.canManage).toBe(false);
    expect(caps.canCompletePullout).toBe(false);
  });
});
