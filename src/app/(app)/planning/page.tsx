import { redirect } from "next/navigation";

import { demandPlanningRunsPathFromSearch } from "@/features/demand-planning/lib/paths";

interface LegacyDemandPlanningRedirectProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Bookmarks to `/planning` land on Settings → Planning → Demand Planning. */
export default async function LegacyDemandPlanningRedirect({
  searchParams,
}: LegacyDemandPlanningRedirectProps) {
  redirect(demandPlanningRunsPathFromSearch(await searchParams));
}
