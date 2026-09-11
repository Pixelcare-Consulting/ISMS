export const PLANOGRAM_INDEX_VIEWS = ["with", "empty"] as const;

export type PlanogramIndexView = (typeof PLANOGRAM_INDEX_VIEWS)[number];

export interface PlanogramIndexKpis {
  totalBranches: number;
  withPlanogram: number;
  noPlanogram: number;
  skuRows: number;
}

export interface PlanogramIndexBranch {
  id: string;
  name: string;
  sapCode: string;
  skuCount: number;
}

export function parsePlanogramIndexView(
  value: string | undefined,
): PlanogramIndexView | null {
  if (value === "with" || value === "empty") {
    return value;
  }
  return null;
}

export function buildPlanogramIndexHref(input: {
  view?: PlanogramIndexView | null;
  q?: string;
}): string {
  const params = new URLSearchParams();
  if (input.view) params.set("view", input.view);
  const query = input.q?.trim();
  if (query) params.set("q", query);
  const qs = params.toString();
  return qs ? `/settings/planogram?${qs}` : "/settings/planogram";
}

export function buildBranchPlanogramHref(
  branchId: string,
  input?: { view?: PlanogramIndexView | null; q?: string },
): string {
  const params = new URLSearchParams();
  if (input?.view) params.set("view", input.view);
  const query = input?.q?.trim();
  if (query) params.set("q", query);
  const qs = params.toString();
  return qs
    ? `/settings/planogram/${branchId}?${qs}`
    : `/settings/planogram/${branchId}`;
}

export function matchesPlanogramIndexView(
  branch: PlanogramIndexBranch,
  view: PlanogramIndexView | null,
): boolean {
  if (view == null) return true;

  switch (view) {
    case "with":
      return branch.skuCount > 0;
    case "empty":
      return branch.skuCount === 0;
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}
