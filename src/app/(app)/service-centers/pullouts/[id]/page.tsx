import { notFound, redirect } from "next/navigation";

import { PulloutDetailView } from "@/app/(app)/logistics/_components/pullout-detail";
import { ScPulloutSourceProvider } from "@/app/(app)/service-centers/pullouts/_components/sc-pullout-source";
import { loadWorkflowCatalog } from "@/features/logistics/constants/workflow-catalog";
import { getScPulloutDetailAction } from "@/features/service-center-ops/actions/sc-pullouts.actions";
import {
  canAccessScLogistics,
  resolveScPulloutCapabilities,
} from "@/features/service-center-ops/constants/sc-permissions";
import { resolveScIdsForUser } from "@/features/service-center-ops/services/sc-scope";
import { requireAuth } from "@/lib/auth/permissions";

export default async function ScPulloutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  if (!canAccessScLogistics(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }
  const { id } = await params;
  const [result, workflowStatuses, placeScope] = await Promise.all([
    getScPulloutDetailAction(id),
    loadWorkflowCatalog(session.user.tenantId, "pullout_workflow"),
    resolveScIdsForUser(session.user.tenantId, session.user.id, session.user.permissions),
  ]);
  if ("error" in result || !result.detail) notFound();

  return (
    <ScPulloutSourceProvider>
      <PulloutDetailView
        detail={result.detail}
        capabilities={resolveScPulloutCapabilities(session.user.permissions)}
        placeScope={placeScope}
        workflowStatuses={workflowStatuses}
      />
    </ScPulloutSourceProvider>
  );
}
