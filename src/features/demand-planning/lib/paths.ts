/** Canonical Demand Planning runs list (Settings → Operations & Planning). */
export const DEMAND_PLANNING_RUNS_PATH = "/settings/planning/runs";

export function demandPlanningRunsHref(query?: {
  page?: number;
  period?: string;
  run?: string | null;
  newRun?: boolean;
}): string {
  const params = new URLSearchParams();
  if (query?.period) params.set("period", query.period);
  if (query?.page && query.page > 1) params.set("page", String(query.page));
  if (query?.run) params.set("run", query.run);
  if (query?.newRun) params.set("new", "1");
  const qs = params.toString();
  return qs ? `${DEMAND_PLANNING_RUNS_PATH}?${qs}` : DEMAND_PLANNING_RUNS_PATH;
}

export function demandPlanningRunsPathFromSearch(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${DEMAND_PLANNING_RUNS_PATH}?${qs}` : DEMAND_PLANNING_RUNS_PATH;
}
