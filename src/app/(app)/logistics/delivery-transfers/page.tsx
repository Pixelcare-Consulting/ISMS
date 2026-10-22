import { listDeliveryTransfersAction } from "@/features/logistics/actions/logistics.actions";
import {
  LOGISTICS_DELIVERY_TRANSFER_APPROVE,
  LOGISTICS_DELIVERY_TRANSFER_CREATE,
  LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
  LOGISTICS_PAGE_PERMISSIONS,
} from "@/features/logistics/constants/logistics-permissions";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { DeliveryTransfersPanel } from "@/app/(app)/logistics/_components/delivery-transfers-panel";

interface DeliveryTransfersPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function DeliveryTransfersPage({ searchParams }: DeliveryTransfersPageProps) {
  await requireAnyPermission([
    ...LOGISTICS_PAGE_PERMISSIONS,
    LOGISTICS_DELIVERY_TRANSFER_CREATE,
    LOGISTICS_DELIVERY_TRANSFER_APPROVE,
    LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
  ]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const transfers = await listDeliveryTransfersAction({ page, limit });

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Units a branch did not accept from a delivery go on a unit transfer. Approve or delete each line, release it, then accept each unit where it arrives.
      </SectionPageLead>
      <DeliveryTransfersPanel transfers={transfers} />
    </div>
  );
}
