import { listBranchesForPlanogramAction } from "@/features/planogram/actions/planogram.actions";
import { requirePlanogramView } from "@/lib/auth/permissions";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PlanogramBranchesTable } from "@/app/(app)/settings/planogram/_components/planogram-branches-table";

export default async function PlanogramIndexPage() {
  await requirePlanogramView();
  const branches = await listBranchesForPlanogramAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planogram"
        description="Authorized SKUs and MIL thresholds per branch."
      />
      <PlanogramBranchesTable branches={branches} />
    </div>
  );
}
