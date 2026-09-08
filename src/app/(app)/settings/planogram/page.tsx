import { listBranchesForPlanogramAction } from "@/features/planogram/actions/planogram.actions";
import { ModuleGuide } from "@/components/module-guide";
import { canManagePlanogram, requirePlanogramView } from "@/lib/auth/permissions";
import { PLANOGRAM_MODULE_GUIDE } from "@/content/module-guides/planogram";
import { PLANOGRAM_PAGE_TUTORIAL } from "@/content/page-tutorials/planogram";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PlanogramBranchesTable } from "@/app/(app)/settings/planogram/_components/planogram-branches-table";

export default async function PlanogramIndexPage() {
  const session = await requirePlanogramView();
  const branches = await listBranchesForPlanogramAction();
  const canManage = canManagePlanogram(session.user.permissions);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planogram"
        tutorial={PLANOGRAM_PAGE_TUTORIAL}
        description="Authorized SKUs and MIL thresholds per branch. Download the official template to set shelf max and MIL days."
        sticky={false}
      />
      <ModuleGuide {...PLANOGRAM_MODULE_GUIDE} />
      <PlanogramBranchesTable branches={branches} canManage={canManage} />
    </div>
  );
}
