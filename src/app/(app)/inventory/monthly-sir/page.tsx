import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import {
  listMonthlySirBranchesAction,
  listMonthlySirRequestsAction,
} from "@/features/monthly-sir/actions/monthly-sir.actions";
import { MonthlySirPanel } from "@/app/(app)/inventory/monthly-sir/_components/monthly-sir-panel";

interface MonthlySirPageProps {
  searchParams: Promise<{
    tab?: string;
    branch?: string;
    page?: string;
    limit?: string;
  }>;
}

export default async function MonthlySirPage({
  searchParams,
}: MonthlySirPageProps) {
  const session = await requirePermission("inventory.view");
  const params = await searchParams;
  const tab = params.tab === "approval" ? "approval" : "all";
  const [requests, branches] = await Promise.all([
    listMonthlySirRequestsAction({
      tab,
      branchId: params.branch,
      page: Number(params.page) || 1,
      limit: parseTablePageSize(params.limit),
    }),
    listMonthlySirBranchesAction(),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Request a monthly inventory record, complete PCOUNT in Excel, and review
        variances through the existing P-Count workflow.
      </SectionPageLead>
      <MonthlySirPanel
        requests={requests}
        branches={branches}
        tab={tab}
        branchId={params.branch ?? ""}
        canManage={hasPermission(session.user.permissions, "inventory.manage")}
      />
    </div>
  );
}
