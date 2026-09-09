import { redirect } from "next/navigation";

import {
  buildBranchPlanogramHref,
  parsePlanogramIndexView,
} from "@/features/planogram/lib/planogram-index";

interface LegacyBranchPlanogramPageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ view?: string; q?: string }>;
}

export default async function LegacyBranchPlanogramRedirect({
  params,
  searchParams,
}: LegacyBranchPlanogramPageProps) {
  const { branchId } = await params;
  const query = await searchParams;
  redirect(
    buildBranchPlanogramHref(branchId, {
      view: parsePlanogramIndexView(query.view),
      q: query.q,
    }),
  );
}
