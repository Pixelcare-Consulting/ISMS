import {
  listDeliveriesAction,
  listPulloutsAction,
  listTransfersAction,
} from "@/features/logistics/actions/logistics.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { LogisticsPanels } from "@/app/(app)/logistics/_components/logistics-panels";

interface LogisticsPageProps {
  searchParams: Promise<{
    deliveriesPage?: string;
    transfersPage?: string;
    pulloutsPage?: string;
  }>;
}

export default async function LogisticsPage({ searchParams }: LogisticsPageProps) {
  await requirePermission("logistics.manage");
  const params = await searchParams;
  const deliveriesPage = Number(params.deliveriesPage) || 1;
  const transfersPage = Number(params.transfersPage) || 1;
  const pulloutsPage = Number(params.pulloutsPage) || 1;

  const [deliveries, transfers, pullouts] = await Promise.all([
    listDeliveriesAction({ page: deliveriesPage }),
    listTransfersAction({ page: transfersPage }),
    listPulloutsAction({ page: pulloutsPage }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logistics"
        description="Delivery acceptance, branch transfers, and pull-outs to warehouse (MVP)."
      />
      <LogisticsPanels
        deliveries={deliveries}
        transfers={transfers}
        pullouts={pullouts}
      />
    </div>
  );
}
