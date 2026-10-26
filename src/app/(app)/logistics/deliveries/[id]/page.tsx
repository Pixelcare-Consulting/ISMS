import { notFound } from "next/navigation";

import { DeliveryDetailView } from "@/app/(app)/logistics/_components/delivery-detail";
import { getDeliveryDetailAction } from "@/features/logistics/actions/logistics.actions";
import { loadWorkflowCatalog } from "@/features/logistics/constants/workflow-catalog";
import {
  LOGISTICS_PAGE_PERMISSIONS,
  resolveLogisticsCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const { id } = await params;
  const [result, workflowStatuses] = await Promise.all([
    getDeliveryDetailAction(id),
    loadWorkflowCatalog(session.user.tenantId, "delivery_workflow"),
  ]);
  if ("error" in result || !result.detail) notFound();

  return (
    <DeliveryDetailView
      detail={result.detail}
      capabilities={resolveLogisticsCapabilities(session.user.permissions)}
      workflowStatuses={workflowStatuses}
    />
  );
}
