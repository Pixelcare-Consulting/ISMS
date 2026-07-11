import {
  listDeliveriesAction,
  listOpsBranchOptionsAction,
  listPulloutsAction,
  listTransfersAction,
} from "@/features/ops/actions/ops.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { OPERATIONS_PAGE_TUTORIAL } from "@/content/page-tutorials/operations";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { OpsPanel } from "@/app/(app)/operations/_components/ops-panel";

export default async function OperationsPage() {
  await requirePermission("inventory.view");
  const [deliveries, transfers, pullouts, branches] = await Promise.all([
    listDeliveriesAction(),
    listTransfersAction(),
    listPulloutsAction(),
    listOpsBranchOptionsAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        tutorial={OPERATIONS_PAGE_TUTORIAL}
        description="Delivery acceptance, branch transfers, and pull-outs."
      />
      <OpsPanel
        deliveries={deliveries}
        transfers={transfers}
        pullouts={pullouts}
        branches={branches}
      />
    </div>
  );
}
