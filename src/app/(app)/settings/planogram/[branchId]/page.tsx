import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { branchService } from "@/features/branches/services/branch.service";
import {
  listAllowedModelsForBranchAction,
  listPlanogramAction,
} from "@/features/planogram/actions/planogram.actions";
import {
  buildPlanogramIndexHref,
  parsePlanogramIndexView,
} from "@/features/planogram/lib/planogram-index";
import { ModuleGuide } from "@/components/module-guide";
import { requirePlanogramView } from "@/lib/auth/permissions";
import { BRANCH_PLANOGRAM_MODULE_GUIDE } from "@/content/module-guides/planogram";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { BranchPlanogramTabs } from "@/app/(app)/settings/branches/[branchId]/planogram/_components/branch-planogram-tabs";
import { PlanogramTable } from "@/app/(app)/settings/branches/[branchId]/planogram/_components/planogram-table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface BranchPlanogramPageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ view?: string; q?: string }>;
}

function BackToPlanogramLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
    >
      <ArrowLeft className="size-4" />
      Back
    </Link>
  );
}

export default async function BranchPlanogramPage({
  params,
  searchParams,
}: BranchPlanogramPageProps) {
  const session = await requirePlanogramView();
  const { branchId } = await params;
  const query = await searchParams;
  const backHref = buildPlanogramIndexHref({
    view: parsePlanogramIndexView(query.view),
    q: query.q,
  });

  const branch = await branchService.listBranches(session.user.tenantId).then((list) =>
    list.find((b) => b.id === branchId),
  );

  if (!branch) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Branch not found.</p>
        <BackToPlanogramLink href={backHref} />
      </div>
    );
  }

  const result = await listPlanogramAction(branchId);
  if ("error" in result && result.error) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">{result.error}</p>
        <BackToPlanogramLink href={backHref} />
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
        actions={<BackToPlanogramLink href={backHref} />}
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
