import { redirect } from "next/navigation";

import { SalesReturnsTable } from "@/app/(app)/sales/_components/sales-returns-table";
import { ReturnsApprovalsPanel } from "@/app/(app)/returns/_components/returns-approvals-panel";
import {
  ReturnsPageTabs,
  type ReturnsPageTab,
} from "@/app/(app)/returns/_components/returns-page-tabs";
import { ScReturnsPanel } from "@/app/(app)/returns/_components/sc-returns-panel";
import { PageHeader } from "@/app/(app)/_components/page-header";
import { ModuleGuide } from "@/components/module-guide";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { RETURNS_MODULE_GUIDE } from "@/content/module-guides/returns";
import { RETURNS_PAGE_TUTORIAL } from "@/content/page-tutorials/returns";
import { listSalesReturnsAction } from "@/features/sales/actions/sales.actions";
import { resolveSalesCapabilities } from "@/features/sales/constants/sales-permissions";
import {
  canAccessReturns,
  resolveReturnsCapabilities,
} from "@/features/returns/constants/returns-permissions";
import { getReturnsKpisAction } from "@/features/returns/actions/returns.actions";
import { ReturnsKpisStrip } from "@/features/returns/components/returns-kpis";
import { listScReturnsAction } from "@/features/service-center-ops/actions/sc-sales.actions";
import { requireAuth } from "@/lib/auth/permissions";
import { pageMetadata } from "@/lib/shared/seo";

export const metadata = pageMetadata(
  "Returns / Replacement",
  "Track and finish customer returns for branch and service center sales.",
);

const APPROVAL_STATUSES = [
  "pending_cs",
  "pending_tl",
  "approved",
] as const;

interface ReturnsPageProps {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
  }>;
}

function parseReturnsTab(value?: string): ReturnsPageTab {
  if (value === "service") return "service";
  if (value === "approvals") return "approvals";
  return "branch";
}

export default async function ReturnsPage({ searchParams }: ReturnsPageProps) {
  const session = await requireAuth();
  if (!canAccessReturns(session.user.permissions)) {
    redirect("/dashboard?error=forbidden");
  }

  const returnsCapabilities = resolveReturnsCapabilities(
    session.user.permissions,
  );
  const salesCapabilities = resolveSalesCapabilities(session.user.permissions);
  const params = await searchParams;
  const activeTab = parseReturnsTab(params.tab);
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const listInput = {
    page,
    limit,
    sort: params.sort,
    sortDir: params.dir,
  };

  const tableCaps = {
    canUpdateSaleHeader: salesCapabilities.canUpdateSaleHeader,
    canCreateSale: salesCapabilities.canCreateSale,
    canRequestReturn: returnsCapabilities.canRequestReturn,
    canEvaluateReturn: returnsCapabilities.canEvaluateReturn,
    canApproveReturn: returnsCapabilities.canApproveReturn,
    canCompleteReturn: returnsCapabilities.canCompleteReturn,
  };

  const [branchResult, scResult, approvalsBranch, approvalsSc, returnsKpis] =
    await Promise.all([
      activeTab === "branch"
        ? listSalesReturnsAction(listInput)
        : Promise.resolve(null),
      activeTab === "service"
        ? listScReturnsAction({ page, limit })
        : Promise.resolve(null),
      activeTab === "approvals"
        ? listSalesReturnsAction({
            ...listInput,
            statusIn: [...APPROVAL_STATUSES],
          })
        : Promise.resolve(null),
      activeTab === "approvals"
        ? listScReturnsAction({
            page: 1,
            limit: 200,
            statusIn: [...APPROVAL_STATUSES],
          })
        : Promise.resolve(null),
      getReturnsKpisAction(),
    ]);

  const activeKpis =
    activeTab === "service"
      ? returnsKpis.service
      : activeTab === "approvals"
        ? returnsKpis.approvals
        : returnsKpis.branch;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns / Replacement"
        sticky={false}
        tutorial={RETURNS_PAGE_TUTORIAL}
        description="Track branch and service center customer returns — evaluate, approve, and restore stock. Start a request from the sale’s View details."
      />
      <ModuleGuide {...RETURNS_MODULE_GUIDE} />
      <ReturnsKpisStrip kpis={activeKpis} />
      <ReturnsPageTabs
        activeTab={activeTab}
        branchContent={
          branchResult ? (
            <SalesReturnsTable
              result={branchResult}
              capabilities={tableCaps}
              initialSort={params.sort ?? ""}
              initialSortDir={params.dir ?? "desc"}
              listTab="branch"
            />
          ) : null
        }
        serviceContent={
          scResult ? (
            <ScReturnsPanel
              items={scResult.items}
              capabilities={returnsCapabilities}
            />
          ) : null
        }
        approvalsContent={
          approvalsBranch && approvalsSc ? (
            <ReturnsApprovalsPanel
              branchResult={approvalsBranch}
              scItems={approvalsSc.items}
              returnsCapabilities={returnsCapabilities}
              salesCapabilities={salesCapabilities}
              initialSort={params.sort ?? ""}
              initialSortDir={params.dir ?? "desc"}
            />
          ) : null
        }
      />
    </div>
  );
}
