export interface PermissionRow {
  id: string;
  slug: string;
  name: string;
}

export interface RolePermissionRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissionSlugs: string[];
}

export interface RolesPermissionsMatrix {
  roles: RolePermissionRow[];
  permissions: PermissionRow[];
}
