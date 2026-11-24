import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isHiddenPermissionSlug, parsePermissionSlug } from "@/config/app-modules";
import {
  plannedWorkflowStepGrants,
  WORKFLOW_STEP_MIGRATION_GRANTS,
  WORKFLOW_STEP_PERMISSION_CATALOG,
} from "@/features/roles/constants/workflow-step-permissions";

import { PERMISSIONS, ROLES } from "../../../../../prisma/seed-data";

const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20261124200000_workflow_step_permissions/migration.sql"),
  "utf8",
);

describe("workflow step permission catalog", () => {
  it("is inserted by the migration and seeded", () => {
    const seeded = new Set(PERMISSIONS.map((permission) => permission.slug));
    for (const { slug } of WORKFLOW_STEP_PERMISSION_CATALOG) {
      expect(migration).toContain(`'${slug}'`);
      expect(seeded.has(slug)).toBe(true);
    }
  });

  it("ticks every planned grant in the migration", () => {
    for (const [roleSlug, slugs] of Object.entries(WORKFLOW_STEP_MIGRATION_GRANTS)) {
      for (const slug of slugs) {
        expect(migration).toContain(`('${roleSlug}', '${slug}')`);
      }
    }
  });

  it("shows each step as a labelled action in the role editor", () => {
    for (const { slug } of WORKFLOW_STEP_PERMISSION_CATALOG) {
      const { module, action } = parsePermissionSlug(slug);
      expect(module?.actions.some((item) => item.value === action)).toBe(true);
      expect(isHiddenPermissionSlug(slug)).toBe(false);
    }
  });

  it("hides the old order Approve checkboxes", () => {
    expect(isHiddenPermissionSlug("orders.manual.approve")).toBe(true);
    expect(isHiddenPermissionSlug("orders.special.approve")).toBe(true);
    expect(isHiddenPermissionSlug("orders.auto_replenish.approve")).toBe(true);
    expect(isHiddenPermissionSlug("orders.manual.view")).toBe(false);
    expect(isHiddenPermissionSlug("service_centers.orders.approve")).toBe(false);
  });

  it("seeds Team Leader and Supply Planning with their steps", () => {
    const bySlug = new Map(ROLES.map((role) => [role.slug, new Set<string>(role.permissions)]));
    expect(bySlug.get("tl")?.has("orders.auto_replenish.approve_tl")).toBe(true);
    expect(bySlug.get("sp")?.has("orders.manual.approve_sp")).toBe(true);
    expect(bySlug.get("ps")?.has("orders.manual.view_all")).toBe(false);
  });
});

describe("plannedWorkflowStepGrants", () => {
  it("gives See everyone's orders to every role but ps that opens the type", () => {
    expect(plannedWorkflowStepGrants("ae", ["orders.manual.view"])).toEqual(["orders.manual.view_all"]);
    expect(plannedWorkflowStepGrants("custom_role", ["orders.approve"])).toEqual([
      "orders.manual.view_all",
      "orders.special.view_all",
    ]);
    expect(plannedWorkflowStepGrants("ps", ["orders.manual.create"])).toEqual([
      "inventory.monthly_sir.upload_scheduled",
      "orders.manual.edit_pending",
    ]);
  });

  it("skips what the role already holds", () => {
    expect(
      plannedWorkflowStepGrants("tl", [
        "orders.auto_replenish.approve_tl",
        "orders.manual.edit_pending",
        "logistics.delivery_transfer.approve",
        "inventory.defect.approve",
        "inventory.monthly_sir.upload_slots",
      ]),
    ).toEqual([]);
  });
});
