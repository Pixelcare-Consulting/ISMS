import {
  INVENTORY_VIEW_SLUG,
  MONTHLY_SIR_VIEW_SLUG,
  roleIdsToGrantMonthlySir,
} from "../../../scripts/monthly-sir-grant";

describe("roleIdsToGrantMonthlySir", () => {
  it("grants roles that already have branch Inventory, including those that already have Monthly SIR", () => {
    expect(
      roleIdsToGrantMonthlySir([
        { roleId: "branch-viewer", permissionSlugs: [INVENTORY_VIEW_SLUG] },
        {
          roleId: "already-granted",
          permissionSlugs: [INVENTORY_VIEW_SLUG, MONTHLY_SIR_VIEW_SLUG],
        },
        {
          roleId: "orders-only",
          permissionSlugs: ["orders.view", "orders.create", "orders.approve"],
        },
        {
          roleId: "returns-only",
          permissionSlugs: ["sales.return.view", "service_centers.return.view"],
        },
        { roleId: "monthly-sir-only", permissionSlugs: [MONTHLY_SIR_VIEW_SLUG] },
      ]),
    ).toEqual(["branch-viewer", "already-granted"]);
  });

  it("returns each role once when inventory.view appears on more than one row", () => {
    expect(
      roleIdsToGrantMonthlySir([
        { roleId: "same-role", permissionSlugs: [INVENTORY_VIEW_SLUG] },
        { roleId: "same-role", permissionSlugs: ["orders.view", INVENTORY_VIEW_SLUG] },
      ]),
    ).toEqual(["same-role"]);
  });

  it("returns no role ids when nobody has branch Inventory", () => {
    expect(roleIdsToGrantMonthlySir([])).toEqual([]);
    expect(
      roleIdsToGrantMonthlySir([{ roleId: "orders-only", permissionSlugs: ["orders.create"] }]),
    ).toEqual([]);
  });
});
