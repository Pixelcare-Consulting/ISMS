import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { getRolesPermissionsMatrixAction } from "@/features/roles/actions/role.actions";
import { RoleModuleActionMatrix } from "@/features/roles/components/role-module-action-matrix";
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles — Permission matrix"
        description={
          isPlatformOperator
            ? "Pick a role, then toggle access by module. On phones this uses cards; on desktop you get the full matrix. System roles included for platform operators."
            : "Pick a role, then toggle access by module. On phones this uses cards; on desktop you get the full matrix. Built-in system roles are not shown here."
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
        isPlatformOperator={isPlatformOperator}
      />
    </div>
  );
}
