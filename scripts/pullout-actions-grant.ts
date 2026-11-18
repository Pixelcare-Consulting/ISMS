/**
 * New pull-out action permissions.
 * A role receives one only when it already has a fallback that unlocked that button.
 * Nothing else in the catalog is touched.
 */

export interface PulloutActionGrant {
  slug: string;
  name: string;
  fallbacks: readonly string[];
}

export const PULLOUT_ACTION_GRANTS: readonly PulloutActionGrant[] = [
  {
    slug: "pullouts.create",
    name: "Create branch pull-outs",
    fallbacks: ["logistics.create", "logistics.manage", "orders.create"],
  },
  {
    slug: "pullouts.approve",
    name: "Approve branch pull-outs",
    fallbacks: ["orders.approve", "logistics.manage"],
  },
  {
    slug: "pullouts.manage",
    name: "Manage branch pull-outs",
    fallbacks: ["logistics.manage"],
  },
  {
    slug: "service_centers.logistics.approve",
    name: "Approve service center pull-outs",
    fallbacks: ["service_centers.orders.approve", "service_centers.logistics.manage"],
  },
] as const;

export interface RoleGrantCandidate {
  roleId: string;
  permissionSlugs: readonly string[];
}

export interface PulloutActionGrantPlan {
  slug: string;
  roleIds: string[];
}

/**
 * Which roles should receive each new permission.
 * A role qualifies when it already has any fallback for that permission.
 * A role that already has the new permission is still included; the insert uses
 * skipDuplicates so that row is left unchanged.
 * Each role id appears once, in the order the role was first seen.
 */
export function roleIdsToGrantPulloutActions(
  roles: readonly RoleGrantCandidate[],
): PulloutActionGrantPlan[] {
  const slugsByRole = new Map<string, Set<string>>();

  for (const role of roles) {
    const slugs = slugsByRole.get(role.roleId) ?? new Set<string>();
    for (const slug of role.permissionSlugs) {
      slugs.add(slug);
    }
    slugsByRole.set(role.roleId, slugs);
  }

  return PULLOUT_ACTION_GRANTS.map((grant) => {
    const roleIds: string[] = [];
    for (const [roleId, slugs] of slugsByRole) {
      if (grant.fallbacks.some((fallback) => slugs.has(fallback))) {
        roleIds.push(roleId);
      }
    }
    return { slug: grant.slug, roleIds };
  });
}
