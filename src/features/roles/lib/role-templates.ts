/**
 * Starter permission sets for the create-role wizard.
 * Templates only prefill the UI — they are not DB entities.
 * Slugs mirror common seeded role patterns from prisma/seed-data.ts.
 */

export interface RoleTemplate {
  id: string;
  name: string;
  description: string;
  /** Permission slugs to pre-check (intersected with catalog at runtime) */
  permissionSlugs: readonly string[];
}

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    id: "blank",
    name: "Blank",
    description: "Start empty and pick access yourself.",
    permissionSlugs: [],
  },
  {
    id: "viewer",
    name: "Viewer",
    description: "Read policies and reports — no changes.",
    permissionSlugs: [
      "dashboard.manage",
      "policies.view",
      "reports.view",
    ],
  },
  {
    id: "branch_staff",
    name: "Branch staff",
    description: "Create orders and sales at a branch (Product Specialist pattern).",
    permissionSlugs: [
      "dashboard.manage",
      "inventory.view",
      "orders.view",
      "orders.create",
      "orders.manual.view",
      "orders.manual.create",
      "orders.special.view",
      "orders.special.create",
      "orders.auto_replenish.view",
      "orders.auto_replenish.create",
      "sales.create",
      "planogram.view",
    ],
  },
  {
    id: "manager",
    name: "Manager",
    description: "Approve orders and oversee branch inventory (Team Leader pattern).",
    permissionSlugs: [
      "dashboard.manage",
      "inventory.view",
      "orders.view",
      "orders.approve",
      "orders.manual.view",
      "orders.manual.approve",
      "orders.special.view",
      "orders.special.approve",
      "orders.auto_replenish.view",
      "orders.auto_replenish.approve",
      "planogram.view",
      "reports.view",
    ],
  },
  {
    id: "auditor",
    name: "Auditor",
    description: "Run audits and review policies and reports.",
    permissionSlugs: [
      "dashboard.manage",
      "audits.create",
      "audits.close",
      "reports.view",
      "policies.view",
    ],
  },
] as const;

export function getRoleTemplateById(id: string): RoleTemplate | undefined {
  return ROLE_TEMPLATES.find((template) => template.id === id);
}

/** Keep only slugs that exist in the current permission catalog. */
export function resolveTemplateSlugs(
  template: RoleTemplate,
  catalogSlugs: ReadonlySet<string> | readonly string[],
): string[] {
  const catalog =
    catalogSlugs instanceof Set ? catalogSlugs : new Set(catalogSlugs);
  return template.permissionSlugs.filter((slug) => catalog.has(slug));
}
