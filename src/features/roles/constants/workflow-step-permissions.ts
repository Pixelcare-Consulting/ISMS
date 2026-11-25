/**
 * Workflow-step checkboxes that replaced role-slug rules (2026-11-24). Each one is a
 * normal permission: Settings → Roles alone decides who acts at the step.
 *
 * `prisma/migrations/20261124200000_workflow_step_permissions` inserts these rows and ticks
 * them on existing roles by their slug at the time, so behaviour does not change on deploy.
 * The seed uses `WORKFLOW_STEP_SEED_GRANTS` for the same defaults. Keep the three in sync
 * (a unit test checks the migration lists every slug here).
 */
export const WORKFLOW_STEP_PERMISSION_CATALOG = [
  { slug: "orders.manual.approve_sp", name: "Supply Planning approval (manual orders)" },
  { slug: "orders.manual.edit_pending", name: "Edit manual orders while Pending SP" },
  { slug: "orders.manual.view_all", name: "See everyone's manual orders" },
  { slug: "orders.manual.view_queue", name: "See every pending step (manual orders)" },
  { slug: "orders.manual.force_cancel", name: "Cancel any pending manual order" },
  { slug: "orders.special.approve_sp", name: "Supply Planning approval (special orders)" },
  { slug: "orders.special.view_all", name: "See everyone's special orders" },
  { slug: "orders.special.view_queue", name: "See every pending step (special orders)" },
  { slug: "orders.special.force_cancel", name: "Cancel any pending special order" },
  { slug: "orders.auto_replenish.approve_tl", name: "Team Leader review (auto replenish)" },
  { slug: "orders.auto_replenish.approve_sp", name: "Supply Planning approval (auto replenish)" },
  { slug: "orders.auto_replenish.view_queue", name: "See every pending step (auto replenish)" },
  { slug: "orders.auto_replenish.force_cancel", name: "Cancel any pending auto-replenish order" },
  { slug: "service_centers.orders.approve_sp", name: "Supply Planning approval (service center orders)" },
  { slug: "inventory.defect.approve", name: "Approve defect reports" },
  { slug: "inventory.monthly_sir.upload_scheduled", name: "Upload P-COUNT on scheduled days" },
  { slug: "inventory.monthly_sir.upload_slots", name: "Upload P-COUNT with free slots" },
] as const;

export type WorkflowStepPermission = (typeof WORKFLOW_STEP_PERMISSION_CATALOG)[number]["slug"];

const SUPPLY_PLANNING_STEPS = [
  "orders.manual.approve_sp",
  "orders.special.approve_sp",
  "orders.auto_replenish.approve_sp",
  "service_centers.orders.approve_sp",
] as const satisfies readonly WorkflowStepPermission[];

const SEE_EVERYONES_ORDERS = [
  "orders.manual.view_all",
  "orders.special.view_all",
] as const satisfies readonly WorkflowStepPermission[];

/** Seeded roles' defaults (Super Admin gets the whole catalog through the seed). */
export const WORKFLOW_STEP_SEED_GRANTS: Readonly<Record<string, readonly WorkflowStepPermission[]>> = {
  tenant_admin: [
    ...SEE_EVERYONES_ORDERS,
    "orders.manual.view_queue",
    "orders.special.view_queue",
    "orders.auto_replenish.view_queue",
  ],
  ps: ["orders.manual.edit_pending", "inventory.monthly_sir.upload_scheduled"],
  tl: [
    ...SEE_EVERYONES_ORDERS,
    "orders.auto_replenish.approve_tl",
    "orders.manual.edit_pending",
    "inventory.defect.approve",
    "inventory.monthly_sir.upload_slots",
  ],
  sp: [...SEE_EVERYONES_ORDERS, ...SUPPLY_PLANNING_STEPS],
  spa: [...SEE_EVERYONES_ORDERS, ...SUPPLY_PLANNING_STEPS],
  supply_planning: [...SEE_EVERYONES_ORDERS, ...SUPPLY_PLANNING_STEPS],
  supply_planning_associate: [...SEE_EVERYONES_ORDERS, ...SUPPLY_PLANNING_STEPS],
  logistics: [...SEE_EVERYONES_ORDERS],
  ae: [...SEE_EVERYONES_ORDERS],
};

/**
 * What the migration ticks on existing roles, by the slug that decided the rule before.
 * Mirrors section 2 of the migration (a unit test checks every pair is there); the
 * read-only report uses it to show each role's changes before deploy.
 */
export const WORKFLOW_STEP_MIGRATION_GRANTS: Readonly<Record<string, readonly string[]>> = {
  sp: SUPPLY_PLANNING_STEPS,
  spa: SUPPLY_PLANNING_STEPS,
  supply_planning: SUPPLY_PLANNING_STEPS,
  supply_planning_associate: SUPPLY_PLANNING_STEPS,
  tl: [
    "orders.auto_replenish.approve_tl",
    "orders.manual.edit_pending",
    "logistics.delivery_transfer.approve",
    "inventory.defect.approve",
    "inventory.monthly_sir.upload_slots",
  ],
  ps: ["orders.manual.edit_pending", "inventory.monthly_sir.upload_scheduled"],
  tenant_admin: [
    "orders.manual.view_queue",
    "orders.special.view_queue",
    "orders.auto_replenish.view_queue",
  ],
  super_admin: [
    "service_centers.orders.approve_sp",
    "orders.manual.view_queue",
    "orders.special.view_queue",
    "orders.auto_replenish.view_queue",
    "orders.manual.force_cancel",
    "orders.special.force_cancel",
    "orders.auto_replenish.force_cancel",
    "logistics.delivery_transfer.approve",
    "inventory.defect.approve",
  ],
};

/** Section 3 of the migration: any of these opens the type, so non-`ps` roles get view_all. */
export const VIEW_ALL_MIGRATION_SOURCES: Readonly<Record<string, readonly string[]>> = {
  "orders.manual.view_all": [
    "orders.manual.view",
    "orders.manual.create",
    "orders.manual.approve",
    "orders.view",
    "orders.create",
    "orders.approve",
  ],
  "orders.special.view_all": [
    "orders.special.view",
    "orders.special.create",
    "orders.special.approve",
    "orders.view",
    "orders.create",
    "orders.approve",
  ],
};

/** Slugs the migration grants to one role, given its slug and what it already holds. */
export function plannedWorkflowStepGrants(roleSlug: string, held: readonly string[]): string[] {
  const heldSet = new Set(held);
  const planned = new Set(WORKFLOW_STEP_MIGRATION_GRANTS[roleSlug] ?? []);
  if (roleSlug !== "ps") {
    for (const [slug, sources] of Object.entries(VIEW_ALL_MIGRATION_SOURCES)) {
      if (sources.some((source) => heldSet.has(source))) planned.add(slug);
    }
  }
  return [...planned].filter((slug) => !heldSet.has(slug)).sort();
}
