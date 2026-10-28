import {
  getDeliveryKpisAction,
  listDeliveriesAction,
} from "@/features/logistics/actions/logistics.actions";
import { loadWorkflowCatalog } from "@/features/logistics/constants/workflow-catalog";
import {
  LOGISTICS_PAGE_PERMISSIONS,
  resolveLogisticsCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import { DeliveryKpisStrip } from "@/features/logistics/components/delivery-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { DeliveriesPanel } from "@/app/(app)/logistics/_components/deliveries-panel";

interface DeliveriesPageProps {
  searchParams: Promise<{ page?: string; limit?: string; sort?: string; dir?: string }>;
}

export default async function DeliveriesPage({ searchParams }: DeliveriesPageProps) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const capabilities = resolveLogisticsCapabilities(session.user.permissions);
  const canCheckSap = capabilities.canDispatch || capabilities.canManage;
  const [deliveries, kpis, workflowStatuses] = await Promise.all([
    listDeliveriesAction({ page, limit, sort: params.sort, sortDir: params.dir }),
    getDeliveryKpisAction(),
    loadWorkflowCatalog(session.user.tenantId, "delivery_workflow"),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        After Supply Planning approves, a delivery opens. Dispatch happens in SAP with Copy To (ITR to an Inventory Transfer, SO to a Delivery); ISMS picks it up within about 10 minutes and the branch accepts the units into stock.
      </SectionPageLead>
      <DeliveryKpisStrip kpis={kpis} />
      <DeliveriesPanel
        deliveries={deliveries}
        workflowStatuses={workflowStatuses}
        canCheckSap={canCheckSap}
        initialSort={params.sort ?? ""}
        initialSortDir={params.dir ?? "desc"}
      />
    </div>
  );
}
