/**
 * New Monthly SIR / P-COUNT action permissions.
 * A role with View receives the buttons it can already use.
 * Approve is only for a role that also has Branch inventory Manage.
 * Nothing else in the catalog is touched.
 */
import {
  INVENTORY_MANAGE_SLUG,
  MONTHLY_SIR_APPROVE_SLUG,
  MONTHLY_SIR_PERMISSION_CATALOG,
  MONTHLY_SIR_VIEW_SLUG,
} from "../src/features/monthly-sir/constants/monthly-sir-permissions";

const VIEW_ONLY = [MONTHLY_SIR_VIEW_SLUG] as const;
const VIEW_AND_MANAGE = [MONTHLY_SIR_VIEW_SLUG, INVENTORY_MANAGE_SLUG] as const;

export interface MonthlySirActionGrant {
  slug: string;
  name: string;
  /** Role must already have every slug in this list. */
  requires: readonly string[];
}

export const MONTHLY_SIR_ACTION_GRANTS: readonly MonthlySirActionGrant[] =
  MONTHLY_SIR_PERMISSION_CATALOG.filter(
    (permission) => permission.slug !== MONTHLY_SIR_VIEW_SLUG,
  ).map((permission) => ({
    slug: permission.slug,
    name: permission.name,
    requires:
      permission.slug === MONTHLY_SIR_APPROVE_SLUG ? VIEW_AND_MANAGE : VIEW_ONLY,
  }));

export interface RoleGrantCandidate {
  roleId: string;
  permissionSlugs: readonly string[];
}

export interface MonthlySirActionGrantPlan {
  slug: string;
  roleIds: string[];
}

/**
 * Which roles should receive each new permission.
 * Use-today actions qualify when the role already has Monthly SIR View.
 * Approve qualifies only when the role already has View and Branch inventory Manage.
 * A role that already has the new permission is still included; the insert uses
 * skipDuplicates so that row is left unchanged.
 * Each role id appears once, in the order the role was first seen.
 */
export function roleIdsToGrantMonthlySirActions(
  roles: readonly RoleGrantCandidate[],
): MonthlySirActionGrantPlan[] {
  const slugsByRole = new Map<string, Set<string>>();

  for (const role of roles) {
    const slugs = slugsByRole.get(role.roleId) ?? new Set<string>();
    for (const slug of role.permissionSlugs) {
      slugs.add(slug);
    }
    slugsByRole.set(role.roleId, slugs);
  }

  return MONTHLY_SIR_ACTION_GRANTS.map((grant) => {
    const roleIds: string[] = [];
    for (const [roleId, slugs] of slugsByRole) {
      if (grant.requires.every((required) => slugs.has(required))) {
        roleIds.push(roleId);
      }
    }
    return { slug: grant.slug, roleIds };
  });
}
