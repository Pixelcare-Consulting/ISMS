import { getRolesPermissionsMatrixAction } from "@/features/roles/actions/role.actions";
import { RolesSimpleView } from "@/features/roles/components/roles-simple-view";
import { canManageSystemRoleAccess } from "@/features/roles/constants/role.constants";
import { ModuleGuide } from "@/components/module-guide";
import {
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
import { ROLES_MODULE_GUIDE } from "@/content/module-guides/roles";
import { ROLES_PAGE_TUTORIAL } from "@/content/page-tutorials/roles";
import { PageHeader } from "@/app/(app)/_components/page-header";

export default async function SettingsRolesPage() {
  const session = await requirePermission("roles.manage");
  const [matrix, isPlatformOperator] = await Promise.all([
    getRolesPermissionsMatrixAction(),
    resolveSessionPlatformOperator(session.user),
  ]);
  const canManageSystemRoles = canManageSystemRoleAccess(
    session.user.roleSlugs,
    isPlatformOperator,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        tutorial={ROLES_PAGE_TUTORIAL}
        description={
          canManageSystemRoles
            ? "Manage roles with plain-language access. Built-in system roles are included — adjust access; rename and delete stay locked."
            : "Create custom roles and choose what people can see and do. Built-in system roles are managed by Super Admins."
        }
      />
      <ModuleGuide {...ROLES_MODULE_GUIDE} />
      <RolesSimpleView
        matrix={matrix}
        isPlatformOperator={isPlatformOperator}
        canManageSystemRoleAccess={canManageSystemRoles}
      />
    </div>
  );
}
