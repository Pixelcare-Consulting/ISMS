import {
  parsePermissionSlug,
  roleSectionModule,
} from "@/config/app-modules";

/** Sidebar area for a permission, such as Inventory or Orders. Null when the catalog has none. */
export function permissionAreaName(slug: string): string | null {
  const { module } = parsePermissionSlug(slug);
  if (!module || module.hidden) {
    return null;
  }

  const section = roleSectionModule(module);
  if (section.hidden) {
    return null;
  }

  return section.area ?? module.area ?? null;
}
