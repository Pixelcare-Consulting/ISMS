import { parsePermissionSlug } from "@/config/app-modules";
import { filterNavByPermissions, flattenNavLinks, type NavEntry } from "@/config/app-navigation";
import { appNavigation } from "@/config/app-navigation";
import { setupNavigation } from "@/config/setup-navigation";
import { groupPermissionsByModule } from "@/features/roles/lib/group-permissions-by-module";
import { PERMISSIONS, ROLES } from "../../../../../prisma/seed-data";

const QUOTA_HREF = "/settings/branch-quotas";

function showsBranchQuotas(navigation: NavEntry[], permissions: string[]): boolean {
  return filterNavByPermissions(navigation, permissions).some((entry) => {
    if (entry.type === "link") return entry.href === QUOTA_HREF;
    return flattenNavLinks(entry.items).some((item) => item.href === QUOTA_HREF);
  });
}

describe("branch quotas permission module", () => {
  it("resolves both slugs to the Branch Quotas module", () => {
    expect(parsePermissionSlug("branch_quotas.view")).toMatchObject({
      module: { id: "branch_quotas", name: "Branch Quotas" },
      action: "view",
    });
    expect(parsePermissionSlug("branch_quotas.manage").action).toBe("manage");
  });

  it("groups the slugs apart from Branches in role setup", () => {
    const groups = groupPermissionsByModule([
      { id: "1", slug: "branches.manage", name: "Manage branches" },
      { id: "2", slug: "branch_quotas.manage", name: "Manage branch quotas" },
    ] as Parameters<typeof groupPermissionsByModule>[0]);

    expect(groups.map((group) => group.moduleId).sort()).toEqual([
      "branch_quotas",
      "branches",
    ]);
  });

  it("is in the seed catalogue", () => {
    const slugs = PERMISSIONS.map((permission) => permission.slug as string);

    expect(slugs).toEqual(
      expect.arrayContaining(["branch_quotas.view", "branch_quotas.manage"]),
    );
  });

  it("keeps tenant admins able to manage quotas on a fresh seed", () => {
    const tenantAdmin = ROLES.find((role) => role.slug === "tenant_admin");
    const granted = [...(tenantAdmin?.permissions ?? [])] as string[];

    expect(granted).toEqual(
      expect.arrayContaining(["branch_quotas.view", "branch_quotas.manage"]),
    );
  });
});

describe.each([
  ["app", appNavigation],
  ["setup", setupNavigation],
])("branch quotas in %s navigation", (_name, navigation) => {
  it.each([
    [["branch_quotas.view"], true],
    [["branch_quotas.manage"], true],
    [["branches.view"], false],
    [["branches.manage"], false],
  ])("for %j shows the link: %s", (permissions, expected) => {
    expect(showsBranchQuotas(navigation, permissions)).toBe(expected);
  });
});
