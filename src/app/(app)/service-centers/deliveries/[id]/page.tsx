import { notFound, redirect } from "next/navigation";

import { ScDeliveryDetailView } from "@/app/(app)/service-centers/deliveries/_components/sc-delivery-detail";
import { loadWorkflowCatalog } from "@/features/logistics/constants/workflow-catalog";
import { getScDeliveryDetailAction } from "@/features/service-center-ops/actions/sc-logistics.actions";
import {
  canAccessScLogistics,
  resolveScLogisticsCapabilities,
} from "@/features/service-center-ops/constants/sc-permissions";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Service center delivery",
  "Receive the units on a SAP DR into service center stock.",
);

export default async function ScDeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  if (!canAccessScLogistics(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }
  const { id } = await params;
  const [result, workflowStatuses] = await Promise.all([
    getScDeliveryDetailAction(id),
    loadWorkflowCatalog(session.user.tenantId, "delivery_workflow"),
  ]);
  if ("error" in result) notFound();

  return (
    <ScDeliveryDetailView
      detail={result.detail}
      capabilities={resolveScLogisticsCapabilities(session.user.permissions)}
      workflowStatuses={workflowStatuses}
    />
  );
}
