jest.mock("@/lib/auth/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/auth", () => ({ auth: jest.fn(), signOutServer: jest.fn() }));
jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

import { parsePermissionSlug } from "@/config/app-modules";
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
      module: { id: "pullouts", name: "Pull-outs" },
      action: "view",
    });
  });

  it("groups apart from Logistics in role setup", () => {
    const groups = groupPermissionsByModule([
      { id: "1", slug: "logistics.view", name: "View logistics" },
      { id: "2", slug: "pullouts.view", name: "View pull-outs" },
    ] as Parameters<typeof groupPermissionsByModule>[0]);

    expect(groups.map((group) => group.moduleId).sort()).toEqual(["logistics", "pullouts"]);
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
