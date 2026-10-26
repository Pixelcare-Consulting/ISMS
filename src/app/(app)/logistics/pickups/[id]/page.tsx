import { notFound } from "next/navigation";

import { PulloutDetailView } from "@/app/(app)/logistics/_components/pullout-detail";
import { getPulloutDetailAction } from "@/features/logistics/actions/logistics.actions";
import { loadWorkflowCatalog } from "@/features/logistics/constants/workflow-catalog";
import {
  LOGISTICS_PAGE_PERMISSIONS,
  resolveLogisticsCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import { isBranchScopeUnrestricted } from "@/features/logistics/services/logistics-posting-access";
import { getUserBranchIds } from "@/lib/aor/scope";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function PulloutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const { id } = await params;
  const [result, workflowStatuses] = await Promise.all([
    getPulloutDetailAction(id),
    loadWorkflowCatalog(session.user.tenantId, "pullout_workflow"),
  ]);
  if ("error" in result || !result.detail) notFound();
  const branchScope = isBranchScopeUnrestricted(session.user.permissions)
    ? null
    : await getUserBranchIds(session.user.tenantId, session.user.id);

  return (
    <PulloutDetailView
      detail={result.detail}
      capabilities={resolveLogisticsCapabilities(session.user.permissions)}
      branchScope={branchScope}
      workflowStatuses={workflowStatuses}
    />
  );
}
