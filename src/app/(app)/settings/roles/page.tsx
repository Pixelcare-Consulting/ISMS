import { getRolesPermissionsMatrixAction } from "@/features/roles/actions/role.actions";
import { RolesSimpleView } from "@/features/roles/components/roles-simple-view";
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        tutorial={ROLES_PAGE_TUTORIAL}
        description={
          isPlatformOperator
            ? "Manage roles with plain-language access. Built-in system roles are included for platform operators."
            : "Create custom roles and choose what people can see and do. Built-in system roles are not shown here."
        }
      />
      <ModuleGuide {...ROLES_MODULE_GUIDE} />
      <RolesSimpleView
        matrix={matrix}
        isPlatformOperator={isPlatformOperator}
      />
    </div>
  );
}
