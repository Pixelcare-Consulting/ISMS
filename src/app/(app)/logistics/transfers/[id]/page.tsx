import { notFound } from "next/navigation";

import { TransferDetailView } from "@/app/(app)/logistics/_components/transfer-detail";
import { getTransferDetailAction } from "@/features/logistics/actions/logistics.actions";
import { loadWorkflowCatalog } from "@/features/logistics/constants/workflow-catalog";
import {
  LOGISTICS_PAGE_PERMISSIONS,
  resolveLogisticsCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import { transferApprovalBranchIds } from "@/features/logistics/lib/transfer-approver";
import { isBranchScopeUnrestricted } from "@/features/logistics/services/logistics-posting-access";
import { getUserBranchIds } from "@/lib/aor/scope";
import { requireAnyPermission } from "@/lib/auth/permissions";

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const { id } = await params;
  const [result, workflowStatuses, assignedBranchIds] = await Promise.all([
    getTransferDetailAction(id),
    loadWorkflowCatalog(session.user.tenantId, "transfer_workflow"),
    getUserBranchIds(session.user.tenantId, session.user.id),
  ]);
  if ("error" in result || !result.detail) notFound();
  const branchScope = isBranchScopeUnrestricted(session.user.permissions) ? null : assignedBranchIds;

  return (
    <TransferDetailView
      detail={result.detail}
      capabilities={resolveLogisticsCapabilities(session.user.permissions)}
      branchScope={branchScope}
      approvalBranchIds={transferApprovalBranchIds(session.user.roleSlugs, assignedBranchIds)}
      workflowStatuses={workflowStatuses}
    />
  );
}
