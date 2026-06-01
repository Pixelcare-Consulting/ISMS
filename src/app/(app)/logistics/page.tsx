import {
  listDeliveriesAction,
  listPulloutsAction,
  listTransfersAction,
} from "@/features/logistics/actions/logistics.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { LogisticsPanels } from "@/app/(app)/logistics/_components/logistics-panels";

export default async function LogisticsPage() {
  await requirePermission("logistics.manage");
  const [deliveries, transfers, pullouts] = await Promise.all([
    listDeliveriesAction(),
    listTransfersAction(),
    listPulloutsAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logistics"
        description="Delivery acceptance, branch transfers, and pull-outs to warehouse (MVP)."
      />
      <LogisticsPanels deliveries={deliveries} transfers={transfers} pullouts={pullouts} />
    </div>
  );
}
