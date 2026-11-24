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
  resolvePulloutCapabilities,
  TRANSFERS_PAGE_PERMISSIONS,
} from "@/features/logistics/constants/logistics-permissions";
import { postingPermissionError } from "@/features/logistics/services/logistics-posting-access";
import { resolveScPulloutCapabilities } from "@/features/service-center-ops/constants/sc-permissions";
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
      { id: "2b", slug: "pullouts.create", name: "Create branch pull-outs" },
      { id: "2c", slug: "pullouts.approve", name: "Approve branch pull-outs" },
      { id: "2d", slug: "pullouts.manage", name: "Manage branch pull-outs" },
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
    expect(groups[1]?.permissions.map((permission) => permission.label)).toEqual([
      "View",
      "Create",
      "Approve",
      "Manage",
    ]);
    expect(groups[1]?.description).toBe(
      "Opens Pull-outs in Inventory. Create, Approve, and Manage cover new pull-outs, approval, and sending.",
    );
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
      "inventory.monthly_sir.download_template",
      "inventory.monthly_sir.scan_serials",
      "inventory.monthly_sir.upload",
      "inventory.monthly_sir.generate_variance",
      "inventory.monthly_sir.open_pcount",
      "inventory.monthly_sir.approve",
      "inventory.monthly_sir.upload_scheduled",
      "inventory.monthly_sir.upload_slots",
    ]);
    expect(groups.find((group) => group.moduleName === "Branch inventory")?.description).toBe(
      "Opens branch Inventory. Approve defect reports decides defects for branches in the person's area of responsibility.",
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

    const pullouts = groups.find((group) => group.moduleName === "Branch pull-outs");
    expect(pullouts?.permissions.map((item) => item.slug)).toEqual([
      "pullouts.view",
      "pullouts.create",
      "pullouts.approve",
      "pullouts.manage",
    ]);
    const serviceCenterLogistics = groups.find(
      (group) => group.moduleName === "Service center deliveries and pull-outs",
    );
    expect(serviceCenterLogistics?.permissions.map((item) => item.slug)).toContain(
      "service_centers.logistics.approve",
    );

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
    const caps = resolvePulloutCapabilities(["pullouts.view"]);

    expect(caps.canCreate).toBe(false);
    expect(caps.canApproveTl).toBe(false);
    expect(caps.canRejectTransfer).toBe(false);
    expect(caps.canManage).toBe(false);
    expect(resolveLogisticsCapabilities(["pullouts.view"]).canCreate).toBe(false);
    expect(resolveLogisticsCapabilities(["pullouts.view"]).canManage).toBe(false);
  });

  it("lets pull-out Create start a pull-out without opening a transfer or a delivery", () => {
    const pullout = resolvePulloutCapabilities(["pullouts.create"]);
    const transfer = resolveLogisticsCapabilities(["pullouts.create"]);

    expect(pullout.canCreate).toBe(true);
    expect(pullout.canApproveTl).toBe(false);
    expect(pullout.canManage).toBe(false);
    expect(transfer.canCreate).toBe(false);
    expect(transfer.canManage).toBe(false);
    expect(transfer.canExecuteTransfer).toBe(false);
    expect(postingPermissionError(["pullouts.create"], "pullout.create")).toBeNull();
    expect(postingPermissionError(["pullouts.create"], "transfer.create")).toMatch(/permission/i);
  });

  it("lets Branch transfers Create start a visible transfer and not a pull-out", () => {
    const transfer = resolveLogisticsCapabilities(["logistics.delivery_transfer.create"]);

    expect(transfer.canCreate).toBe(true);
    expect(transfer.canCreateDeliveryTransfer).toBe(true);
    expect(resolvePulloutCapabilities(["logistics.delivery_transfer.create"]).canCreate).toBe(false);
    expect(postingPermissionError(["logistics.delivery_transfer.create"], "transfer.create")).toBeNull();
    expect(postingPermissionError(["logistics.delivery_transfer.create"], "pullout.create")).toMatch(
      /permission/i,
    );
  });

  it("lets service center Approve approve a service center pull-out", () => {
    const caps = resolveScPulloutCapabilities(["service_centers.logistics.approve"]);

    expect(caps.canApproveTl).toBe(true);
    expect(caps.canRejectTransfer).toBe(true);
    expect(caps.canCreate).toBe(false);
    expect(caps.canManage).toBe(false);
  });

  it("shows pull-out Approve and Reject only with Pull-outs Approve", () => {
    for (const permissions of [["orders.approve"], ["logistics.manage"], ["tl", "sp"]]) {
      const capabilities = resolvePulloutCapabilities(permissions);
      expect(capabilities.canApproveTl).toBe(false);
      expect(capabilities.canRejectTransfer).toBe(false);
    }
    const approver = resolvePulloutCapabilities(["pullouts.approve"]);
    expect(approver.canApproveTl).toBe(true);
    expect(approver.canRejectTransfer).toBe(true);
  });

  it("opens Transfers read only with Branch transfers View", () => {
    expect(TRANSFERS_PAGE_PERMISSIONS).toContain("logistics.delivery_transfer.view");
    const viewer = resolveLogisticsCapabilities(["logistics.delivery_transfer.view"]);
    expect(Object.values(viewer).some(Boolean)).toBe(false);
  });

  it("keeps the older slugs working for the same buttons", () => {
    expect(resolvePulloutCapabilities(["logistics.create"]).canCreate).toBe(true);
    expect(resolvePulloutCapabilities(["orders.create"]).canCreate).toBe(true);
    expect(resolvePulloutCapabilities(["logistics.manage"]).canCreate).toBe(true);
    expect(resolvePulloutCapabilities(["logistics.manage"]).canManage).toBe(true);

    const fromManage = resolveLogisticsCapabilities(["logistics.manage"]);
    expect(fromManage.canCreate).toBe(true);
    expect(fromManage.canApproveTl).toBe(true);
    expect(fromManage.canRejectTransfer).toBe(true);
    expect(fromManage.canReceiveTransfer).toBe(true);
    expect(fromManage.canManage).toBe(true);

    expect(resolveLogisticsCapabilities(["logistics.create"]).canCreate).toBe(true);
    expect(resolveLogisticsCapabilities(["logistics.create"]).canReceiveTransfer).toBe(true);
    expect(resolveLogisticsCapabilities(["orders.create"]).canCreate).toBe(true);
    expect(resolveLogisticsCapabilities(["orders.approve"]).canApproveTl).toBe(true);
    expect(resolveLogisticsCapabilities(["logistics.delivery_transfer.approve"]).canApproveTl).toBe(
      true,
    );
    expect(
      resolveLogisticsCapabilities(["logistics.delivery_transfer.approve"]).canRejectTransfer,
    ).toBe(true);
    expect(
      resolveLogisticsCapabilities(["logistics.delivery_transfer.receive"]).canReceiveTransfer,
    ).toBe(true);

    expect(resolveLogisticsCapabilities(["pullouts.manage"]).canManage).toBe(false);
    expect(resolveLogisticsCapabilities(["pullouts.manage"]).canExecuteTransfer).toBe(false);
    expect(resolvePulloutCapabilities(["pullouts.manage"]).canManage).toBe(true);
    expect(postingPermissionError(["pullouts.manage"], "pullout.finalize")).toBeNull();
    expect(postingPermissionError(["pullouts.manage"], "pullout.checkSap")).toBeNull();
    expect(postingPermissionError(["pullouts.manage"], "transfer.release")).toMatch(/permission/i);
    expect(postingPermissionError(["logistics.manage"], "pullout.updateList")).toBeNull();
    expect(postingPermissionError(["orders.approve"], "pullout.approve")).toMatch(/permission/i);
    expect(postingPermissionError(["pullouts.approve"], "pullout.approve")).toBeNull();
    expect(postingPermissionError(["orders.approve"], "transfer.approve")).toBeNull();

    expect(resolveScPulloutCapabilities(["service_centers.orders.approve"]).canApproveTl).toBe(true);
    expect(resolveScPulloutCapabilities(["service_centers.logistics.manage"]).canApproveTl).toBe(
      true,
    );
    expect(resolveScPulloutCapabilities(["service_centers.logistics.manage"]).canManage).toBe(true);
  });

  it("grants the new checkboxes on seeded roles and templates that already had the fallback", () => {
    const rules = [
      {
        slug: "pullouts.create",
        fallbacks: ["logistics.create", "logistics.manage", "orders.create"],
      },
      {
        slug: "pullouts.approve",
        fallbacks: ["orders.approve", "logistics.manage"],
      },
      {
        slug: "pullouts.manage",
        fallbacks: ["logistics.manage"],
      },
      {
        slug: "service_centers.logistics.approve",
        fallbacks: ["service_centers.orders.approve", "service_centers.logistics.manage"],
      },
    ] as const;

    for (const role of ROLES) {
      const granted = role.permissions as readonly string[];
      for (const rule of rules) {
        if (rule.fallbacks.some((slug) => granted.includes(slug))) {
          expect(granted).toContain(rule.slug);
        }
      }
    }

    for (const template of ROLE_TEMPLATES) {
      for (const rule of rules) {
        if (rule.fallbacks.some((slug) => template.permissionSlugs.includes(slug))) {
          expect(template.permissionSlugs).toContain(rule.slug);
        }
      }
    }

    const receiver = ROLES.find((role) => role.slug === "branch_receiver");
    expect(receiver?.permissions).toContain("pullouts.create");
    expect(receiver?.permissions).not.toContain("pullouts.approve");
    expect(receiver?.permissions).not.toContain("pullouts.manage");
  });
});
