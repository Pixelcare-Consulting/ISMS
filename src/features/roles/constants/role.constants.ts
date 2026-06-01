/** Platform-operator roles — hidden from tenant RBAC UI and user assignment. */
export const PROVIDER_ONLY_ROLE_SLUGS = new Set(["super_admin"]);

export function isProviderOnlyRole(slug: string) {
  return PROVIDER_ONLY_ROLE_SLUGS.has(slug);
}

export function isPlatformOperator(roleSlugs: string[] | undefined): boolean {
  return roleSlugs?.some((slug) => isProviderOnlyRole(slug)) ?? false;
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
