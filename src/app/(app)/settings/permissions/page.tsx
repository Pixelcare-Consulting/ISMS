import { listPermissionsAction } from "@/features/permissions/actions/permission.actions";
import { PermissionsTable } from "@/features/permissions/components/permissions-table";
import { PERMISSIONS_PAGE_TUTORIAL } from "@/content/page-tutorials/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";

export default async function SettingsPermissionsPage() {
  const permissions = await listPermissionsAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissions"
        tutorial={PERMISSIONS_PAGE_TUTORIAL}
        description="Manage the global permission catalog. Pick a module when creating permissions so they link to routes and sidebar access. Super Admin only."
      />
      <PermissionsTable permissions={permissions} />
    </div>
  );
}
