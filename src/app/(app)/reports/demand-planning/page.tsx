import { CoverageMonitorPanel } from "@/app/(app)/reports/demand-planning/_components/coverage-monitor-panel";
import {
  coverageService,
  DEMAND_PLANNING_COVERAGE_PERMISSIONS,
} from "@/features/demand-planning/services/coverage.service";
import { requireAnyPermission } from "@/lib/auth/permissions";

interface DemandPlanningCoveragePageProps {
  searchParams: Promise<{
    period?: string;
  }>;
}

export default async function DemandPlanningCoveragePage({
  searchParams,
}: DemandPlanningCoveragePageProps) {
  const session = await requireAnyPermission([...DEMAND_PLANNING_COVERAGE_PERMISSIONS]);
  const params = await searchParams;
  const view = await coverageService.getCoverageMonitor(
    session.user.tenantId,
    params.period,
  );

  return <CoverageMonitorPanel view={view} />;
}
