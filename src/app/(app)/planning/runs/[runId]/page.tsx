import { redirect } from "next/navigation";

import { demandPlanningRunsHref } from "@/features/demand-planning/lib/paths";
import { canViewDemandPlanning } from "@/features/demand-planning/lib/permissions";
import { requireAuth } from "@/lib/auth/permissions";

interface RunDocumentPageProps {
  params: Promise<{ runId: string }>;
}

export default async function DemandPlanningRunPage({ params }: RunDocumentPageProps) {
  const session = await requireAuth();
  if (!canViewDemandPlanning(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const { runId } = await params;
  redirect(demandPlanningRunsHref({ run: runId }));
}
