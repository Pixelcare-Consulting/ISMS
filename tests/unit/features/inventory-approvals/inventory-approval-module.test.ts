import { getModuleNavPermission, parsePermissionSlug } from "@/config/app-modules";
import {
  appNavigation,
  filterNavByPermissions,
  flattenNavLinks,
} from "@/config/app-navigation";
import { PERMISSIONS, ROLES } from "../../../../prisma/seed-data";

const HREF = "/audit-logs/inventory-approvals";

function showsLink(permissions: string[]): boolean {
  return filterNavByPermissions(appNavigation, permissions).some((entry) => {
    if (entry.type === "link") return entry.href === HREF;
    return flattenNavLinks(entry.items).some((item) => item.href === HREF);
  });
}

function rolesWithView(): string[] {
  return ROLES.filter((role) =>
    (role.permissions as readonly string[]).includes("inventory_approvals.view"),
  ).map((role) => role.slug);
}

describe("inventory approvals permission module", () => {
  it("resolves its only action, view", () => {
    expect(parsePermissionSlug("inventory_approvals.view")).toMatchObject({
      module: { id: "inventory_approvals", name: "Inventory Approvals" },
      action: "view",
    });
    expect(getModuleNavPermission("inventory_approvals")).toBe("inventory_approvals.view");
  });

  it("is in the seed catalogue, granted to administrators only", () => {
    expect(PERMISSIONS.map((permission) => permission.slug as string)).toContain(
      "inventory_approvals.view",
    );
    expect(rolesWithView().sort()).toEqual(["super_admin", "tenant_admin"]);
  });

  it.each([
    [["inventory_approvals.view"], true],
    [["serial_logs.view"], false],
    [["audit_logs.view"], false],
  ])("for %j shows the link: %s", (permissions, expected) => {
    expect(showsLink(permissions)).toBe(expected);
  });
});
