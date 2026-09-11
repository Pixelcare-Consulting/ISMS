import { getPlanogramIndexAction } from "@/features/planogram/actions/planogram.actions";
import { parsePlanogramIndexView } from "@/features/planogram/lib/planogram-index";
import { ModuleGuide } from "@/components/module-guide";
import { canManagePlanogram, requirePlanogramView } from "@/lib/auth/permissions";
import { PLANOGRAM_MODULE_GUIDE } from "@/content/module-guides/planogram";
import { PLANOGRAM_PAGE_TUTORIAL } from "@/content/page-tutorials/planogram";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { PlanogramIndexPanel } from "@/app/(app)/settings/planogram/_components/planogram-index-panel";

interface PlanogramIndexPageProps {
  searchParams: Promise<{ view?: string; q?: string }>;
}

export default async function PlanogramIndexPage({
  searchParams,
}: PlanogramIndexPageProps) {
  const session = await requirePlanogramView();
  const params = await searchParams;
  const { branches, kpis } = await getPlanogramIndexAction();
  const canManage = canManagePlanogram(session.user.permissions);
  const view = parsePlanogramIndexView(params.view);
  const initialQuery = params.q?.trim() ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planogram"
        tutorial={PLANOGRAM_PAGE_TUTORIAL}
        description="Authorized SKUs per branch. Download the official template to assign branch SAP codes and SKUs."
        sticky={false}
      />
      <ModuleGuide {...PLANOGRAM_MODULE_GUIDE} />
      <PlanogramIndexPanel
        branches={branches}
        kpis={kpis}
        view={view}
        initialQuery={initialQuery}
        canManage={canManage}
      />
    </div>
  );
}
