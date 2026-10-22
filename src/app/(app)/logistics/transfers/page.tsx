import {
  getTransferKpisAction,
  listTransfersAction,
} from "@/features/logistics/actions/logistics.actions";
import {
  LOGISTICS_PAGE_PERMISSIONS,
  resolveLogisticsCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import { TransferKpisStrip } from "@/features/logistics/components/transfer-kpis";
import { isBranchScopeUnrestricted } from "@/features/logistics/services/logistics-posting-access";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { getUserBranchIds } from "@/lib/aor/scope";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { TransfersPanel } from "@/app/(app)/logistics/_components/transfers-panel";

interface TransfersPageProps {
  searchParams: Promise<{ page?: string; limit?: string; sort?: string; dir?: string }>;
}

export default async function TransfersPage({ searchParams }: TransfersPageProps) {
  const session = await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const capabilities = resolveLogisticsCapabilities(session.user.permissions);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const unrestricted = isBranchScopeUnrestricted(session.user.permissions);
  const [transfers, kpis, branchScope] = await Promise.all([
    listTransfersAction({ page, limit, sort: params.sort, sortDir: params.dir }),
    getTransferKpisAction(),
    unrestricted
      ? Promise.resolve(null)
      : getUserBranchIds(session.user.tenantId, session.user.id),
  ]);
  const currentUserName = session.user.name?.trim() || session.user.email || "";

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Request a transfer, approve it, send it, then receive the units that arrived.
      </SectionPageLead>
      <TransferKpisStrip kpis={kpis} />
      <TransfersPanel
        transfers={transfers}
        capabilities={capabilities}
        branchScope={branchScope}
        currentUserName={currentUserName}
        initialSort={params.sort ?? ""}
        initialSortDir={params.dir ?? "desc"}
      />
    </div>
  );
}
