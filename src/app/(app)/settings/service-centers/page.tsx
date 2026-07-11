import { listServiceCentersAction } from "@/features/service-centers/actions/service-center.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { ServiceCentersTable } from "@/app/(app)/settings/service-centers/_components/service-centers-table";

export default async function SettingsServiceCentersPage() {
  await requirePermission("branches.manage");
  const centers = await listServiceCentersAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service centers"
        description="Service center master data and nested locations (ops workflows later)."
      />
      <ServiceCentersTable centers={centers} />
    </div>
  );
}
