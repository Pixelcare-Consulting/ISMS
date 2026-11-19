import { appModules } from "@/config/app-modules";

/** Category for a role whose permissions have no sidebar area. */
export const OTHER_ROLE_CATEGORY = "Other";

export interface PickerPermission {
  name: string;
  area: string | null;
}

export interface PickerRole {
  slug: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
  permissions: PickerPermission[];
}

/** Named areas on a role. Empty when every permission is uncategorized. */
export function roleAreas(role: PickerRole): string[] {
  const areas: string[] = [];
  const seen = new Set<string>();
  for (const permission of role.permissions) {
    const area = permission.area?.trim();
    if (!area || seen.has(area)) {
      continue;
    }
    seen.add(area);
    areas.push(area);
  }
  return areas;
}

/** Areas this role belongs to. A role with no area is Other. */
export function roleCategoryLabels(role: PickerRole): string[] {
  const areas = roleAreas(role);
  return areas.length > 0 ? areas : [OTHER_ROLE_CATEGORY];
}

function catalogAreaOrder(): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const appModule of appModules) {
    const area = appModule.area?.trim();
    if (!area || seen.has(area)) {
      continue;
    }
    seen.add(area);
    order.push(area);
  }
  return order;
}

/** Category menu values for the roles currently offered. */
export function categoryOptions(roles: readonly PickerRole[]): string[] {
  const present = new Set<string>();
  let hasOther = false;
  for (const role of roles) {
    const areas = roleAreas(role);
    if (areas.length === 0) {
      hasOther = true;
      continue;
    }
    for (const area of areas) {
      present.add(area);
    }
  }

  const ordered = catalogAreaOrder().filter((area) => present.has(area));
  for (const area of present) {
    if (!ordered.includes(area)) {
      ordered.push(area);
    }
  }
  if (hasOther) {
    ordered.push(OTHER_ROLE_CATEGORY);
  }
  return ordered;
}

/**
 * Roles offered in Add user / Edit user.
 * When the switch is on, built-in roles are omitted unless this user already has one.
 */
export function pickerRolesForAssignment(
  roles: readonly PickerRole[],
  options: { hideSystemRoles: boolean; assignedSlugs: readonly string[] },
): PickerRole[] {
  if (!options.hideSystemRoles) {
    return [...roles];
  }

  const assigned = new Set(options.assignedSlugs);
  return roles.filter((role) => !role.isSystem || assigned.has(role.slug));
}

export function filterPickerRoles(
  roles: readonly PickerRole[],
  input: {
    query: string;
    category: string;
    tab: "all" | "selected";
    selectedSlugs: readonly string[];
  },
): PickerRole[] {
  const query = input.query.trim().toLowerCase();
  const selected = new Set(input.selectedSlugs);

  return roles.filter((role) => {
    if (input.tab === "selected" && !selected.has(role.slug)) {
      return false;
    }
    if (
      input.category !== "all" &&
      !roleCategoryLabels(role).includes(input.category)
    ) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = `${role.name} ${role.description ?? ""}`.toLowerCase();
    return haystack.includes(query);
  });
}

/** Unique permission names across the selected roles, first occurrence wins. */
export function combinedPermissionNames(
  roles: readonly PickerRole[],
  selectedSlugs: readonly string[],
): string[] {
  const bySlug = new Map(roles.map((role) => [role.slug, role]));
  const seen = new Set<string>();
  const names: string[] = [];

  for (const slug of selectedSlugs) {
    const role = bySlug.get(slug);
    if (!role) {
      continue;
    }
    for (const permission of role.permissions) {
      const name = permission.name.trim();
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      names.push(name);
    }
  }

  return names;
}
