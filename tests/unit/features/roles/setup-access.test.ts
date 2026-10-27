import {
  SETUP_HOME,
  SETUP_PERMISSION_SLUGS,
  isSetupPathAllowed,
  isTenantSetupAdmin,
} from "@/features/roles/constants/setup-access";

const OMITTED_OPERATION_SLUGS = [
  "orders.view",
  "orders.create",
  "orders.manage",
  "logistics.view",
  "logistics.manage",
  "inventory.view",
  "inventory.manage",
  "sales.view",
  "sales.manage",
  "returns.view",
  "returns.manage",
  "reports.view",
  "reports.manage",
  "dashboard.view",
  "forecast.view",
  "forecast.manage",
  "sap.manage",
] as const;

describe("isTenantSetupAdmin", () => {
  it("treats a customer super admin as a setup admin", () => {
    expect(
      isTenantSetupAdmin({
        roleSlugs: ["super_admin"],
        isPlatformOperator: false,
      }),
    ).toBe(true);
  });

  it("keeps a platform operator and a tenant admin out of setup admin", () => {
    expect(
      isTenantSetupAdmin({
        roleSlugs: ["super_admin"],
        isPlatformOperator: true,
      }),
    ).toBe(false);
    expect(
      isTenantSetupAdmin({
        roleSlugs: ["tenant_admin"],
        isPlatformOperator: false,
      }),
    ).toBe(false);
    expect(
      isTenantSetupAdmin({
        roleSlugs: undefined,
        isPlatformOperator: false,
      }),
    ).toBe(false);
  });
});

describe("SETUP_PERMISSION_SLUGS", () => {
  it("lists only setup permissions and omits operations slugs", () => {
    expect([...SETUP_PERMISSION_SLUGS]).toEqual([
      "company.view",
      "company.manage",
      "departments.manage",
      "status_settings.manage",
      "users.manage",
      "roles.manage",
      "aors.view",
      "aors.manage",
      "branches.view",
      "branches.manage",
      "warehouses.manage",
      "service_centers.manage",
      "dealers.manage",
      "ordering_settings.view",
      "ordering_settings.manage",
      "planogram.view",
      "planogram.manage",
      "master_data.manage",
      "dashboard.custom.view",
      "dashboard.custom.manage",
    ]);

    for (const slug of SETUP_PERMISSION_SLUGS) {
      expect(slug.startsWith("orders.")).toBe(false);
      expect(slug.startsWith("logistics.")).toBe(false);
      expect(slug.startsWith("inventory.")).toBe(false);
      expect(slug.startsWith("sales.")).toBe(false);
      expect(slug.startsWith("returns.")).toBe(false);
      expect(slug.startsWith("reports.")).toBe(false);
      expect(
        !slug.startsWith("dashboard.") ||
          slug === "dashboard.custom.view" ||
          slug === "dashboard.custom.manage",
      ).toBe(true);
      expect(slug.startsWith("forecast.")).toBe(false);
      expect(slug).not.toBe("sap.manage");
    }

    for (const slug of OMITTED_OPERATION_SLUGS) {
      expect(SETUP_PERMISSION_SLUGS).not.toContain(slug);
    }
  });
});

describe("isSetupPathAllowed", () => {
  it("allows setup home, help, profile, and master-data paths", () => {
    expect(SETUP_HOME).toBe("/setup");
    expect(isSetupPathAllowed("/setup")).toBe(true);
    expect(isSetupPathAllowed("/help")).toBe(true);
    expect(isSetupPathAllowed("/settings/profile")).toBe(true);
    expect(isSetupPathAllowed("/settings/master-data")).toBe(true);
    expect(isSetupPathAllowed("/settings/master-data/brands")).toBe(true);
  });

  it("allows nested paths under setup settings prefixes", () => {
    const allowed = [
      "/setup/readiness",
      "/help/company",
      "/settings/profile/security",
      "/settings/company",
      "/settings/departments/dept-1",
      "/settings/status",
      "/settings/users/user-1",
      "/settings/roles",
      "/settings/roles/matrix",
      "/settings/permissions",
      "/settings/aors/aor-1",
      "/settings/branches",
      "/settings/branches/branch-1/planogram",
      "/settings/warehouses/wh-1",
      "/settings/service-centers",
      "/settings/dealers/dealer-1",
      "/settings/branch-quotas",
      "/settings/ordering",
      "/settings/planogram/branch-1",
      "/settings/master-data/models",
      "/dashboard/custom",
      "/dashboard/custom/dash-1",
      "/dashboard/custom/dash-1/edit",
      "/dashboard/custom/ready/branch-sales",
      "/dashboard/site-traffic",
    ];

    for (const pathname of allowed) {
      expect(isSetupPathAllowed(pathname)).toBe(true);
    }
  });

  it("blocks dashboard, orders, logistics, planning runs, and SAP jobs", () => {
    const blocked = [
      "/dashboard",
      "/dashboard/operations",
      "/dashboard/sales",
      "/dashboard/pcount",
      "/competitors",
      "/orders",
      "/orders/manual",
      "/logistics",
      "/logistics/transfers",
      "/inventory",
      "/sales",
      "/returns",
      "/reports",
      "/settings/planning",
      "/settings/planning/runs",
      "/settings/planning/runs/run-1",
      "/settings/sap-integration",
      "/settings/sap-integration/jobs",
      "/settings",
      "/setup-admin",
      "/helpful",
      "/settings/branches-other",
    ];

    for (const pathname of blocked) {
      expect(isSetupPathAllowed(pathname)).toBe(false);
    }
  });
});
