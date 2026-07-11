import { listPcountReportAction } from "@/features/stock-audit/actions/stock-audit.actions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
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
    <div className="space-y-4">
      <SectionPageLead>
        Closed physical stock counts (P-Count) by branch and date — line counts,
        variances, and links to session detail.
      </SectionPageLead>
      <PcountReportPanel
        sessions={sessions}
        currentBranchId={params.branchId}
        currentFrom={params.from}
        currentTo={params.to}
      />
    </div>
  );
}
