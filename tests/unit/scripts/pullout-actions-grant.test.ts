import { PERMISSIONS } from "../../../prisma/seed-data";
import {
  PULLOUT_ACTION_GRANTS,
  roleIdsToGrantPulloutActions,
} from "../../../scripts/pullout-actions-grant";

function plan(
  roles: { roleId: string; permissionSlugs: string[] }[],
): Record<string, string[]> {
  return Object.fromEntries(
    roleIdsToGrantPulloutActions(roles).map((item) => [item.slug, item.roleIds]),
  );
}

describe("roleIdsToGrantPulloutActions", () => {
  it("uses the same names as the seed catalog", () => {
    for (const grant of PULLOUT_ACTION_GRANTS) {
      expect(PERMISSIONS.find((permission) => permission.slug === grant.slug)?.name).toBe(
        grant.name,
      );
    }
  });

  it("copies each action from the fallback that already unlocked it", () => {
    expect(
      plan([
        { roleId: "receiver", permissionSlugs: ["logistics.create", "pullouts.view"] },
        { roleId: "planner", permissionSlugs: ["orders.approve", "pullouts.view"] },
        { roleId: "logistics", permissionSlugs: ["logistics.manage", "orders.create"] },
        {
          roleId: "team-lead",
          permissionSlugs: ["service_centers.orders.approve"],
        },
        {
          roleId: "sc-logistics",
          permissionSlugs: ["service_centers.logistics.manage"],
        },
        {
          roleId: "warehouse",
          permissionSlugs: [
            "logistics.delivery_transfer.create",
            "logistics.delivery_transfer.approve",
            "logistics.delivery_transfer.receive",
            "pullouts.view",
          ],
        },
        { roleId: "viewer", permissionSlugs: ["pullouts.view"] },
      ]),
    ).toEqual({
      "pullouts.create": ["receiver", "logistics"],
      "pullouts.approve": ["planner", "logistics"],
      "pullouts.manage": ["logistics"],
      "service_centers.logistics.approve": ["team-lead", "sc-logistics"],
    });
  });

  it("keeps a role that already has the new permission so the insert can skip it", () => {
    expect(
      plan([
        {
          roleId: "already",
          permissionSlugs: ["orders.create", "pullouts.create"],
        },
      ])["pullouts.create"],
    ).toEqual(["already"]);
  });

  it("returns each role once when the fallback appears on more than one row", () => {
    expect(
      plan([
        { roleId: "same-role", permissionSlugs: ["logistics.create"] },
        { roleId: "same-role", permissionSlugs: ["orders.create", "logistics.manage"] },
      ]),
    ).toEqual({
      "pullouts.create": ["same-role"],
      "pullouts.approve": ["same-role"],
      "pullouts.manage": ["same-role"],
      "service_centers.logistics.approve": [],
    });
  });

  it("returns no role ids when nobody has a fallback", () => {
    expect(plan([])).toEqual({
      "pullouts.create": [],
      "pullouts.approve": [],
      "pullouts.manage": [],
      "service_centers.logistics.approve": [],
    });
    expect(
      plan([{ roleId: "orders-view", permissionSlugs: ["orders.view"] }]),
    ).toEqual({
      "pullouts.create": [],
      "pullouts.approve": [],
      "pullouts.manage": [],
      "service_centers.logistics.approve": [],
    });
  });
});
