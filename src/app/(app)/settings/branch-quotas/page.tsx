import { listBranchQuotasAction } from "@/features/branch-quotas/actions/branch-quota.actions";
import {
  BRANCH_QUOTA_ACCESS,
  canManageBranchQuotas,
} from "@/features/branch-quotas/constants/branch-quota-permissions";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { BranchQuotasTable } from "@/app/(app)/settings/branch-quotas/_components/branch-quotas-table";

export default async function BranchQuotasPage() {
  const session = await requireAnyPermission(BRANCH_QUOTA_ACCESS);
  const quotas = await listBranchQuotasAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branch quotas"
        description="Set monthly order limits and Target DII (days of inventory) by branch and brand. Quotas are enforced when creating branch orders; Target DII shows on orders beside the Computed DII."
        sticky={false}
      />
      <BranchQuotasTable
        canManage={canManageBranchQuotas(session.user.permissions)}
        quotas={quotas.map((q) => ({
          ...q,
          quotaAmount: q.quotaAmount.toString(),
          targetDii: q.targetDii?.toString() ?? null,
        }))}
      />
    </div>
  );
}
