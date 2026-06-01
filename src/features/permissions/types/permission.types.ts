export interface PermissionRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  roleCount: number;
  isProtected: boolean;
  moduleId: string | null;
  moduleName: string | null;
  moduleRoute: string | null;
  action: string | null;
  isLinked: boolean;
}
