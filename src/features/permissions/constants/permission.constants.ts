/** Core permissions that must always exist in the catalog. */
export const PROTECTED_PERMISSION_SLUGS = new Set([
  "users.manage",
  "roles.manage",
]);

export const PERMISSION_SLUG_REGEX = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function isProtectedPermission(slug: string): boolean {
  return PROTECTED_PERMISSION_SLUGS.has(slug);
}
