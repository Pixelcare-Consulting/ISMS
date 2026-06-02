import { listDeliveriesAction } from "@/features/logistics/actions/logistics.actions";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { DeliveriesPanel } from "@/app/(app)/logistics/_components/deliveries-panel";

interface DeliveriesPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function DeliveriesPage({ searchParams }: DeliveriesPageProps) {
  await requireAnyPermission(["logistics.manage", "orders.create", "orders.view"]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const deliveries = await listDeliveriesAction({ page });

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Deliveries sync from approved orders (SAP ITR/SO). Branch PS accepts DIT → Stock.
      </SectionPageLead>
      <DeliveriesPanel deliveries={deliveries} />
    </div>
  );
}
