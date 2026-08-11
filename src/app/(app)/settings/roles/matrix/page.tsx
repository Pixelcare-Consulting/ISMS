import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { getRolesPermissionsMatrixAction } from "@/features/roles/actions/role.actions";
import { RoleModuleActionMatrix } from "@/features/roles/components/role-module-action-matrix";
import { canManageSystemRoleAccess } from "@/features/roles/constants/role.constants";
import { ModuleGuide } from "@/components/module-guide";
import {
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
import { ROLES_MATRIX_MODULE_GUIDE } from "@/content/module-guides/roles";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export default async function SettingsRolesMatrixPage() {
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
        title="Roles — Permission matrix"
        description={
          canManageSystemRoles
            ? "Pick a role, then toggle access by module. On phones this uses cards; on desktop you get the full matrix. Built-in system roles are included."
            : "Pick a role, then toggle access by module. On phones this uses cards; on desktop you get the full matrix. Built-in system roles are managed by Super Admins."
        }
        actions={
          <Link
            href="/settings/roles"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5",
            )}
          >
            <ArrowLeft className="size-4" />
            Back to simple view
          </Link>
        }
      />
      <ModuleGuide {...ROLES_MATRIX_MODULE_GUIDE} />
      <RoleModuleActionMatrix
        matrix={matrix}
        canManageSystemRoleAccess={canManageSystemRoles}
      />
    </div>
  );
}
