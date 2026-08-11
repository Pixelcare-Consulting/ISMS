import { PageHeader } from "@/app/(app)/_components/page-header";
import { listPermissionsAction } from "@/features/permissions/actions/permission.actions";
import { PermissionsTable } from "@/features/permissions/components/permissions-table";
import { PERMISSIONS_PAGE_TUTORIAL } from "@/content/page-tutorials/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata("Provider permissions");

export default async function ProviderPermissionsPage() {
  const permissions = await listPermissionsAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissions"
        tutorial={PERMISSIONS_PAGE_TUTORIAL}
        description="Manage the global permission catalog used across all customer organizations."
        sticky={false}
      />
      <PermissionsTable permissions={permissions} />
    </div>
  );
}
