import { listBranchesForPlanogramAction } from "@/features/planogram/actions/planogram.actions";
import { ModuleGuide } from "@/components/module-guide";
import { requirePlanogramView } from "@/lib/auth/permissions";
import { PLANOGRAM_MODULE_GUIDE } from "@/content/module-guides/planogram";
import { PLANOGRAM_PAGE_TUTORIAL } from "@/content/page-tutorials/planogram";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PlanogramBranchesTable } from "@/app/(app)/settings/planogram/_components/planogram-branches-table";

export default async function PlanogramIndexPage() {
  await requirePlanogramView();
  const branches = await listBranchesForPlanogramAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planogram"
        tutorial={PLANOGRAM_PAGE_TUTORIAL}
        description="Authorized SKUs and MIL thresholds per branch."
        sticky={false}
      />
      <ModuleGuide {...PLANOGRAM_MODULE_GUIDE} />
      <PlanogramBranchesTable branches={branches} />
    </div>
  );
}
