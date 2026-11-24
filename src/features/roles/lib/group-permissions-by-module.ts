import {
  appModules,
  isHiddenPermissionSlug,
  permissionActionLabel,
  parsePermissionSlug,
  roleSectionKey,
  roleSectionModule,
} from "@/config/app-modules";
import type { PermissionRow } from "@/features/roles/types/role.types";

export interface GroupedPermissionItem {
  id: string;
  slug: string;
  /** Catalog / DB name */
  catalogName: string;
  /** Human-readable label preferred in the simple UI */
  label: string;
}

export interface PermissionModuleGroup {
  moduleId: string;
  moduleName: string;
  /** Sidebar menu, when this module is placed under one. */
  area?: string;
  description?: string;
  permissions: GroupedPermissionItem[];
}

const OTHER_MODULE_ID = "other";

/**
 * Group matrix permissions by app module for the simple Roles UI.
 * Unknown slug prefixes land in an "Other" group.
 */
export function groupPermissionsByModule(
  permissions: PermissionRow[],
): PermissionModuleGroup[] {
  const groups = new Map<string, PermissionModuleGroup>();

  for (const permission of permissions) {
    const { module, action } = parsePermissionSlug(permission.slug);
    if (isHiddenPermissionSlug(permission.slug)) {
      continue;
    }
    const section = module ? roleSectionModule(module) : null;
    const moduleId = section ? roleSectionKey(section) : OTHER_MODULE_ID;
    const moduleName = section?.name ?? "Other";
    const label =
      module && action ? permissionActionLabel(module, action) : permission.name;

    let group = groups.get(moduleId);
    if (!group) {
      group = {
        moduleId,
        moduleName,
        area: section?.area,
        description: section?.description,
        permissions: [],
      };
      groups.set(moduleId, group);
    }

    group.permissions.push({
      id: permission.id,
      slug: permission.slug,
      catalogName: permission.name,
      label,
    });
  }

  const ordered: PermissionModuleGroup[] = [];
  const seenSection = new Set<string>();
  for (const appModule of appModules) {
    if (appModule.hidden) continue;
    const key = roleSectionKey(appModule);
    if (seenSection.has(key)) continue;
    seenSection.add(key);
    const group = groups.get(key);
    if (group) {
      ordered.push(group);
    }
  }

  for (const group of groups.values()) {
    if (
      group.moduleId === OTHER_MODULE_ID ||
      appModules.some((module) => module.id === group.moduleId)
    ) {
      continue;
    }
    ordered.push(group);
  }

  const other = groups.get(OTHER_MODULE_ID);
  if (other) {
    ordered.push(other);
  }

  return ordered;
}

export function countAssignedInGroups(
  groups: PermissionModuleGroup[],
  assignedSlugs: ReadonlySet<string> | readonly string[],
): { assigned: number; total: number } {
  const assigned =
    assignedSlugs instanceof Set
      ? assignedSlugs
      : new Set(assignedSlugs);
  let count = 0;
  let total = 0;
  for (const group of groups) {
    for (const permission of group.permissions) {
      total += 1;
      if (assigned.has(permission.slug)) {
        count += 1;
      }
    }
  }
  return { assigned: count, total };
}
