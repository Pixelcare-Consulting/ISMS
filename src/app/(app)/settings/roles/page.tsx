import { getRolesPermissionsMatrixAction } from "@/features/roles/actions/role.actions";
import { RolesPermissionsTable } from "@/features/roles/components/roles-permissions-table";
import {
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
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
        description={
          isPlatformOperator
            ? "Manage all tenant roles and permissions, including built-in system roles."
            : "Create custom roles and configure their permissions. Built-in system roles are not shown here."
        }
      />
      <RolesPermissionsTable
        matrix={matrix}
        isPlatformOperator={isPlatformOperator}
      />
    </div>
  );
}
