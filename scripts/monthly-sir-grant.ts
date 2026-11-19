/** Permission added for Monthly SIR. Nothing else in the catalog is touched. */
export const MONTHLY_SIR_VIEW_SLUG = "inventory.monthly_sir.view";
export const MONTHLY_SIR_VIEW_NAME = "View Monthly SIR";

/** Existing branch Inventory permission. Roles with this slug receive Monthly SIR. */
export const INVENTORY_VIEW_SLUG = "inventory.view";

export interface RoleGrantCandidate {
  roleId: string;
  permissionSlugs: readonly string[];
}

/**
 * Role ids that should receive Monthly SIR.
 * A role qualifies only when it already has branch Inventory (`inventory.view`).
 * Orders, returns, and every other slug do not qualify a role.
 * A role that already has Monthly SIR is still included; the insert uses
 * skipDuplicates so that row is left unchanged.
 */
export function roleIdsToGrantMonthlySir(roles: readonly RoleGrantCandidate[]): string[] {
  const slugsByRole = new Map<string, Set<string>>();

  for (const role of roles) {
    const slugs = slugsByRole.get(role.roleId) ?? new Set<string>();
    for (const slug of role.permissionSlugs) {
      slugs.add(slug);
    }
    slugsByRole.set(role.roleId, slugs);
  }

  const roleIds: string[] = [];
  for (const [roleId, slugs] of slugsByRole) {
    if (slugs.has(INVENTORY_VIEW_SLUG)) {
      roleIds.push(roleId);
    }
  }
  return roleIds;
}
