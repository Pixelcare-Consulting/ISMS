import Link from "next/link";

import { branchService } from "@/features/branches/services/branch.service";
import {
  listAllowedModelsForBranchAction,
  listPlanogramAction,
} from "@/features/planogram/actions/planogram.actions";
import { ModuleGuide } from "@/components/module-guide";
import { requirePlanogramView } from "@/lib/auth/permissions";
import { BRANCH_PLANOGRAM_MODULE_GUIDE } from "@/content/module-guides/planogram";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { BranchPlanogramTabs } from "@/app/(app)/settings/branches/[branchId]/planogram/_components/branch-planogram-tabs";
import { PlanogramTable } from "@/app/(app)/settings/branches/[branchId]/planogram/_components/planogram-table";
import { Button } from "@/components/ui/button";

interface PlanogramPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchPlanogramPage({ params }: PlanogramPageProps) {
  const session = await requirePlanogramView();
  const { branchId } = await params;

  const branch = await branchService.listBranches(session.user.tenantId).then((list) =>
    list.find((b) => b.id === branchId),
  );

  if (!branch) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Branch not found.</p>
        <Button variant="outline" asChild>
          <Link href="/settings/planogram">Back to planogram</Link>
        </Button>
      </div>
    );
  }

  const result = await listPlanogramAction(branchId);
  if ("error" in result && result.error) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">{result.error}</p>
        <Button variant="outline" asChild>
          <Link href="/settings/planogram">Back to planogram</Link>
        </Button>
      </div>
    );
  }

  const canManage = result.canManage ?? false;
  const allowedModels = canManage
    ? await listAllowedModelsForBranchAction(branchId)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Planogram — ${branch.name}`}
        description="Authorized models, shelf capacity (max qty), and minimum inventory life (MIL) aging rules."
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings/planogram">All branches</Link>
          </Button>
        }
      />
      <ModuleGuide {...BRANCH_PLANOGRAM_MODULE_GUIDE} />
      {canManage ? (
        <BranchPlanogramTabs
          branchId={branchId}
          rows={result.rows}
          allowedModels={allowedModels}
          canManage={canManage}
          offPlanogramSerialCount={result.summary?.offPlanogramSerialCount ?? 0}
        />
      ) : (
        <PlanogramTable
          branchId={branchId}
          rows={result.rows}
          canManage={canManage}
          offPlanogramSerialCount={result.summary?.offPlanogramSerialCount ?? 0}
        />
      )}
    </div>
  );
}
