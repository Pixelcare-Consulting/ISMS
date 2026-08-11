/** Elevated role slugs reserved for platform operators — not assignable in tenant RBAC UI. */
export const PROVIDER_ONLY_ROLE_SLUGS = new Set(["super_admin"]);

export function isProviderOnlyRole(slug: string) {
  return PROVIDER_ONLY_ROLE_SLUGS.has(slug);
}

/** True when the user holds a provider-only role slug (e.g. `super_admin`). */
export function hasProviderRole(roleSlugs: string[] | undefined): boolean {
  return roleSlugs?.some((slug) => isProviderOnlyRole(slug)) ?? false;
}

/**
 * Platform console access (`/provider/*`): provider role AND home tenant is the
 * platform tenant (`isPlatform`). Tenant-only super admins (e.g. demo) are excluded.
 */
export function isPlatformOperator(
  roleSlugs: string[] | undefined,
  tenantIsPlatform: boolean,
): boolean {
  return tenantIsPlatform && hasProviderRole(roleSlugs);
}

export function filterTenantVisibleRoles<T extends { slug: string }>(roles: T[]) {
  return roles.filter((role) => !isProviderOnlyRole(role.slug));
}

/** Custom tenant-created roles only — for the Roles permissions UI. */
export function filterTenantManageableRoles<
  T extends { slug: string; isSystem?: boolean },
>(roles: T[]) {
  return roles.filter(
    (role) => !isProviderOnlyRole(role.slug) && !role.isSystem,
  );
}

/**
 * Platform operators and tenant Super Admins may see built-in system roles
 * and adjust their permission grants (not rename/delete protected roles).
 */
export function canManageSystemRoleAccess(
  roleSlugs: string[] | undefined,
  isPlatformOperator: boolean,
): boolean {
  return isPlatformOperator || hasProviderRole(roleSlugs);
}

/** Roles shown in the tenant Roles / matrix UI. */
export function filterRolesForPermissionsUi<
  T extends { slug: string; isSystem?: boolean },
>(roles: T[], includeSystemRoles: boolean) {
  return includeSystemRoles
    ? filterTenantVisibleRoles(roles)
    : filterTenantManageableRoles(roles);
}

export function userHasProviderOnlyRole(
  userRoles: { role: { slug: string } }[],
): boolean {
  return userRoles.some((userRole) => isProviderOnlyRole(userRole.role.slug));
}

export function filterTenantVisibleUsers<
  T extends { userRoles: { role: { slug: string } }[] },
>(users: T[]) {
  return users.filter((user) => !userHasProviderOnlyRole(user.userRoles));
}

export function slugifyRoleName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}
