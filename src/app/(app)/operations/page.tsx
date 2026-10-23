import {
  listDeliveriesAction,
  listPulloutsAction,
  listTransfersAction,
} from "@/features/ops/actions/ops.actions";
import { resolveLogisticsCapabilities } from "@/features/logistics/constants/logistics-permissions";
import { requirePermission } from "@/lib/auth/permissions";
import { OPERATIONS_PAGE_TUTORIAL } from "@/content/page-tutorials/operations";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { OpsPanel } from "@/app/(app)/operations/_components/ops-panel";

export default async function OperationsPage() {
  const session = await requirePermission("inventory.view");
  const { canCreateDeliveryTransfer, canRequestDeliveryReturn, canApproveDeliveryReturn } =
    resolveLogisticsCapabilities(session.user.permissions);
  const [deliveries, transfers, pullouts] = await Promise.all([
    listDeliveriesAction(),
    listTransfersAction(),
    listPulloutsAction(),
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
        currentUserName={session.user.name?.trim() || session.user.email || ""}
        canCreateDeliveryTransfer={canCreateDeliveryTransfer}
        canRequestDeliveryReturn={canRequestDeliveryReturn}
        canApproveDeliveryReturn={canApproveDeliveryReturn}
      />
    </div>
  );
}
