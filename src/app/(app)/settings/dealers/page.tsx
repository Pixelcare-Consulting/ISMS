import { listDealersAction } from "@/features/dealers/actions/dealer.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { DealersTable } from "@/app/(app)/settings/dealers/_components/dealers-table";

export default async function SettingsDealersPage() {
  await requirePermission("branches.manage");
  const dealers = await listDealersAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dealers"
        description="Dealer master data with area, type, and mode of payment."
      />
      <DealersTable dealers={dealers} />
    </div>
  );
}
