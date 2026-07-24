import { listBranchQuotasAction } from "@/features/branch-quotas/actions/branch-quota.actions";
import { requirePermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { BranchQuotasTable } from "@/app/(app)/settings/branch-quotas/_components/branch-quotas-table";

export default async function BranchQuotasPage() {
  await requirePermission("branches.manage");
  const quotas = await listBranchQuotasAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branch quotas"
        description="Set monthly order limits by branch and brand. Enforced when creating branch orders."
      />
      <BranchQuotasTable
        quotas={quotas.map((q) => ({
          ...q,
          quotaAmount: q.quotaAmount.toString(),
        }))}
      />
    </div>
  );
}
