import { notFound } from "next/navigation";

import { DeliveryTransferForm } from "@/app/(app)/logistics/_components/delivery-transfer-form";
import { getDeliveryTransferDetailAction } from "@/features/logistics/actions/logistics.actions";
import {
  LOGISTICS_DELIVERY_TRANSFER_APPROVE,
  LOGISTICS_DELIVERY_TRANSFER_CREATE,
  LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
  LOGISTICS_PAGE_PERMISSIONS,
  resolveLogisticsCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function DeliveryTransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAnyPermission([
    ...LOGISTICS_PAGE_PERMISSIONS,
    LOGISTICS_DELIVERY_TRANSFER_CREATE,
    LOGISTICS_DELIVERY_TRANSFER_APPROVE,
    LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
  ]);
  const { id } = await params;
  const result = await getDeliveryTransferDetailAction(id);
  if ("error" in result || !result.detail) notFound();

  return (
    <DeliveryTransferForm
      detail={result.detail}
      capabilities={resolveLogisticsCapabilities(session.user.permissions)}
    />
  );
}
