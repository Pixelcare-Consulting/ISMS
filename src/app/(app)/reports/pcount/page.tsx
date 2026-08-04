import { listPcountReportAction } from "@/features/stock-audit/actions/stock-audit.actions";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { PcountReportPanel } from "@/app/(app)/reports/pcount/_components/pcount-report-panel";

interface PcountReportPageProps {
  searchParams: Promise<{
    page?: string;
    branchId?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function PcountReportPage({
  searchParams,
}: PcountReportPageProps) {
  await requireAnyPermission(["reports.view", "inventory.view"]);
  const params = await searchParams;
  const page = Number(params.page) || 1;

  const sessions = await listPcountReportAction({
    page,
    branchId: params.branchId,
    from: params.from,
    to: params.to,
  });

  return (
    <PcountReportPanel
      sessions={sessions}
      currentBranchId={params.branchId}
      currentFrom={params.from}
      currentTo={params.to}
    />
  );
}
