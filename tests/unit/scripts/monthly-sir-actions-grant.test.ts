import { PERMISSIONS, ROLES } from "../../../prisma/seed-data";
import { ROLE_TEMPLATES } from "../../../src/features/roles/lib/role-templates";
import {
  INVENTORY_MANAGE_SLUG,
  MONTHLY_SIR_APPROVE_SLUG,
  MONTHLY_SIR_PERMISSION_CATALOG,
  MONTHLY_SIR_UPLOAD_SLUG,
  MONTHLY_SIR_USE_SLUGS,
  MONTHLY_SIR_VIEW_SLUG,
} from "../../../src/features/monthly-sir/constants/monthly-sir-permissions";
import {
  MONTHLY_SIR_ACTION_GRANTS,
  roleIdsToGrantMonthlySirActions,
} from "../../../scripts/monthly-sir-actions-grant";

function plan(
  roles: { roleId: string; permissionSlugs: string[] }[],
): Record<string, string[]> {
  return Object.fromEntries(
    roleIdsToGrantMonthlySirActions(roles).map((item) => [item.slug, item.roleIds]),
  );
}

describe("roleIdsToGrantMonthlySirActions", () => {
  it("uses the same names as the seed catalog", () => {
    for (const grant of MONTHLY_SIR_ACTION_GRANTS) {
      expect(PERMISSIONS.find((permission) => permission.slug === grant.slug)?.name).toBe(
        grant.name,
      );
      expect(
        MONTHLY_SIR_PERMISSION_CATALOG.find((permission) => permission.slug === grant.slug)?.name,
      ).toBe(grant.name);
    }
  });

  it("keeps upload for a role that already had View", () => {
    expect(
      plan([
        { roleId: "viewer", permissionSlugs: [MONTHLY_SIR_VIEW_SLUG] },
        {
          roleId: "already-upload",
          permissionSlugs: [MONTHLY_SIR_VIEW_SLUG, MONTHLY_SIR_UPLOAD_SLUG],
        },
        { roleId: "manage-only", permissionSlugs: [INVENTORY_MANAGE_SLUG] },
        { roleId: "orders-only", permissionSlugs: ["orders.view"] },
      ])[MONTHLY_SIR_UPLOAD_SLUG],
    ).toEqual(["viewer", "already-upload"]);
  });

  it("gives the other buttons a View holder can use today, and not Approve", () => {
    expect(
      plan([{ roleId: "viewer", permissionSlugs: [MONTHLY_SIR_VIEW_SLUG] }]),
    ).toEqual({
      "inventory.monthly_sir.download_template": ["viewer"],
      "inventory.monthly_sir.scan_serials": ["viewer"],
      "inventory.monthly_sir.upload": ["viewer"],
      "inventory.monthly_sir.generate_variance": ["viewer"],
      "inventory.monthly_sir.open_pcount": ["viewer"],
      "inventory.monthly_sir.approve": [],
    });
  });

  it("gives Approve only when the role already has View and Branch inventory Manage", () => {
    expect(
      plan([
        {
          roleId: "inventory-manager",
          permissionSlugs: [MONTHLY_SIR_VIEW_SLUG, INVENTORY_MANAGE_SLUG],
        },
        { roleId: "viewer", permissionSlugs: [MONTHLY_SIR_VIEW_SLUG] },
        { roleId: "manage-only", permissionSlugs: [INVENTORY_MANAGE_SLUG] },
      ])[MONTHLY_SIR_APPROVE_SLUG],
    ).toEqual(["inventory-manager"]);
  });

  it("returns each role once when View appears on more than one row", () => {
    expect(
      plan([
        { roleId: "same-role", permissionSlugs: [MONTHLY_SIR_VIEW_SLUG] },
        {
          roleId: "same-role",
          permissionSlugs: [INVENTORY_MANAGE_SLUG, MONTHLY_SIR_VIEW_SLUG],
        },
      ]),
    ).toMatchObject({
      [MONTHLY_SIR_UPLOAD_SLUG]: ["same-role"],
      [MONTHLY_SIR_APPROVE_SLUG]: ["same-role"],
    });
  });

  it("returns no role ids when nobody has View", () => {
    const empty = Object.fromEntries(
      MONTHLY_SIR_ACTION_GRANTS.map((grant) => [grant.slug, []]),
    );
    expect(plan([])).toEqual(empty);
    expect(plan([{ roleId: "manage-only", permissionSlugs: [INVENTORY_MANAGE_SLUG] }])).toEqual(
      empty,
    );
  });

  it("keeps upload on every seeded role and template that already has View", () => {
    const rolesMissingUpload = ROLES.filter((role) => {
      const granted = role.permissions as readonly string[];
      return granted.includes(MONTHLY_SIR_VIEW_SLUG) && !granted.includes(MONTHLY_SIR_UPLOAD_SLUG);
    }).map((role) => role.slug);
    expect(rolesMissingUpload).toEqual([]);

    const templatesMissingUpload = ROLE_TEMPLATES.filter(
      (template) =>
        template.permissionSlugs.includes(MONTHLY_SIR_VIEW_SLUG) &&
        !template.permissionSlugs.includes(MONTHLY_SIR_UPLOAD_SLUG),
    ).map((template) => template.id);
    expect(templatesMissingUpload).toEqual([]);

    for (const slug of MONTHLY_SIR_USE_SLUGS) {
      expect(ROLE_TEMPLATES.find((template) => template.id === "branch_staff")?.permissionSlugs).toContain(
        slug,
      );
    }
    expect(
      ROLE_TEMPLATES.find((template) => template.id === "manager")?.permissionSlugs,
    ).not.toContain(MONTHLY_SIR_APPROVE_SLUG);
  });

  it("keeps Approve on seeded roles that already have View and Branch inventory Manage", () => {
    const missingApprove = ROLES.filter((role) => {
      const granted = role.permissions as readonly string[];
      return (
        granted.includes(MONTHLY_SIR_VIEW_SLUG) &&
        granted.includes(INVENTORY_MANAGE_SLUG) &&
        !granted.includes(MONTHLY_SIR_APPROVE_SLUG)
      );
    }).map((role) => role.slug);
    expect(missingApprove).toEqual([]);

    const approveWithoutBoth = ROLES.filter((role) => {
      const granted = role.permissions as readonly string[];
      return (
        granted.includes(MONTHLY_SIR_APPROVE_SLUG) &&
        !(granted.includes(MONTHLY_SIR_VIEW_SLUG) && granted.includes(INVENTORY_MANAGE_SLUG))
      );
    }).map((role) => role.slug);
    expect(approveWithoutBoth).toEqual([]);
  });
});
