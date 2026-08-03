import {
  getDeliveryKpisAction,
  listDeliveriesAction,
} from "@/features/logistics/actions/logistics.actions";
import { LOGISTICS_PAGE_PERMISSIONS } from "@/features/logistics/constants/logistics-permissions";
import { DeliveryKpisStrip } from "@/features/logistics/components/delivery-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { DeliveriesPanel } from "@/app/(app)/logistics/_components/deliveries-panel";

interface DeliveriesPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function DeliveriesPage({ searchParams }: DeliveriesPageProps) {
  await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const [deliveries, kpis] = await Promise.all([
    listDeliveriesAction({ page, limit }),
    getDeliveryKpisAction(),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Deliveries sync from approved orders (SAP ITR/SO). Branch PS accepts DIT → Stock.
      </SectionPageLead>
      <DeliveryKpisStrip kpis={kpis} />
      <DeliveriesPanel deliveries={deliveries} />
    </div>
  );
}
