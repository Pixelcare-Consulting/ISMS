import Link from "next/link";
import { redirect } from "next/navigation";

import { Grid3x3, Shield } from "lucide-react";

import { PageHeader } from "@/app/(app)/_components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PERMISSIONS_PAGE_TUTORIAL } from "@/content/page-tutorials/permissions";
import { listPermissionsAction } from "@/features/permissions/actions/permission.actions";
import { PermissionsTable } from "@/features/permissions/components/permissions-table";
import {
  requirePermission,
  resolveSessionPlatformOperator,
} from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";
import { cn } from "@/utils/cn";

export const metadata = pageMetadata("Permissions");

/**
 * Tenant permissions catalog (read) + link into role assignment.
 * Global catalog create/edit/delete stays on `/provider/permissions`.
 */
export default async function SettingsPermissionsPage() {
  const session = await requirePermission("roles.manage");
  const isPlatformOperator = await resolveSessionPlatformOperator(session.user);

  if (isPlatformOperator) {
    redirect("/provider/permissions");
  }

  const permissions = await listPermissionsAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissions"
        tutorial={PERMISSIONS_PAGE_TUTORIAL}
        description="Browse the access catalog used by roles. Assign what people can do under Settings → Roles."
      />
      <PermissionsTable
        permissions={permissions}
        canManageCatalog={false}
        toolbarActions={
          <>
            <Link
              href="/settings/roles"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5",
              )}
            >
              <Shield className="size-3.5" />
              Manage roles
            </Link>
            <Link
              href="/settings/roles/matrix"
              className={cn(
                buttonVariants({ variant: "default", size: "sm" }),
                "gap-1.5",
              )}
            >
              <Grid3x3 className="size-3.5" />
              Permission matrix
            </Link>
          </>
        }
      />
    </div>
  );
}
