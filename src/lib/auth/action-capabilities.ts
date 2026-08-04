import { hasPermission } from "@/lib/auth/permissions";

/**
 * Reusable action-button capabilities from session permission slugs.
 *
 * Adoption recipe (per module):
 * 1. Add slug(s) to `PERMISSIONS` + `appModules[].actions`
 * 2. Seed default role grants
 * 3. Define a capability map in `features/<module>/constants/*-permissions.ts`
 * 4. RSC page: `resolveCapabilities` → pass `canX` props to the client table
 * 5. Client: hide buttons when false; server actions: `requirePermission` / `requireAnyPermission`
 */

export type CapabilityRequirement = string | readonly string[];

export type CapabilityMap = Record<string, CapabilityRequirement>;

export type ResolvedCapabilities<T extends CapabilityMap> = {
  [K in keyof T]: boolean;
};

function matchesRequirement(
  permissions: string[] | undefined,
  requirement: CapabilityRequirement,
): boolean {
  if (typeof requirement === "string") {
    return hasPermission(permissions, requirement);
  }
  return requirement.some((slug) => hasPermission(permissions, slug));
}

/** Resolve each capability key to whether the user has any matching permission slug. */
export function resolveCapabilities<T extends CapabilityMap>(
  permissions: string[] | undefined,
  map: T,
): ResolvedCapabilities<T> {
  const result = {} as ResolvedCapabilities<T>;
  for (const key of Object.keys(map) as (keyof T)[]) {
    result[key] = matchesRequirement(permissions, map[key]) as ResolvedCapabilities<T>[typeof key];
  }
  return result;
}
