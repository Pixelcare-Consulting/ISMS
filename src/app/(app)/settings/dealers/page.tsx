import { listDealersAction } from "@/features/dealers/actions/dealer.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { DEALERS_PAGE_TUTORIAL } from "@/content/page-tutorials/dealers";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { DealersKpisStrip } from "@/app/(app)/settings/dealers/_components/dealers-kpis";
import { DealersTable } from "@/app/(app)/settings/dealers/_components/dealers-table";

export default async function SettingsDealersPage() {
  await requirePermission("dealers.manage");
  const dealers = await listDealersAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dealers"
        tutorial={DEALERS_PAGE_TUTORIAL}
        description="Dealer master data with area, type, and mode of payment."
        sticky={false}
      />
      <DealersKpisStrip rows={dealers} />
      <DealersTable dealers={dealers} />
    </div>
  );
}
