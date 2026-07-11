import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { getRolesPermissionsMatrixAction } from "@/features/roles/actions/role.actions";
import { RolesPermissionsTable } from "@/features/roles/components/roles-permissions-table";
import {
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
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
        title="Roles — Advanced matrix"
        description={
          isPlatformOperator
            ? "Full permission matrix for all tenant roles, including built-in system roles."
            : "Full permission matrix for custom roles. Built-in system roles are not shown here."
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
      <RolesPermissionsTable
        matrix={matrix}
        isPlatformOperator={isPlatformOperator}
      />
    </div>
  );
}
