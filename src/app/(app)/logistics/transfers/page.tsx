import { redirect } from "next/navigation";

import { DeliveryTransfersPanel } from "@/app/(app)/logistics/_components/delivery-transfers-panel";
import { TransfersPageTabs } from "@/app/(app)/logistics/_components/transfers-page-tabs";
import { TransfersPanel } from "@/app/(app)/logistics/_components/transfers-panel";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { TransferKpisStrip } from "@/features/logistics/components/transfer-kpis";
import {
  getTransferKpisAction,
  listDeliveryTransfersAction,
  listTransfersAction,
} from "@/features/logistics/actions/logistics.actions";
import {
  LOGISTICS_DELIVERY_TRANSFER_APPROVE,
  LOGISTICS_DELIVERY_TRANSFER_CREATE,
  LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
  LOGISTICS_PAGE_PERMISSIONS,
  resolveLogisticsCapabilities,
} from "@/features/logistics/constants/logistics-permissions";
import {
  TRANSFERS_LIST_PATH,
  TRANSFERS_PAGE_TABS,
  parseTransfersPageTab,
  transfersListHref,
  type TransfersPageTab,
} from "@/features/logistics/constants/transfers-page-tabs";
import { isBranchScopeUnrestricted } from "@/features/logistics/services/logistics-posting-access";
import { getUserBranchIds } from "@/lib/aor/scope";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";

const UNIT_TRANSFER_PAGE_PERMISSIONS = [
  ...LOGISTICS_PAGE_PERMISSIONS,
  LOGISTICS_DELIVERY_TRANSFER_CREATE,
  LOGISTICS_DELIVERY_TRANSFER_APPROVE,
  LOGISTICS_DELIVERY_TRANSFER_RECEIVE,
] as const;

interface TransfersPageProps {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
  }>;
}

function canViewBranchTransfers(permissions: string[] | undefined): boolean {
  return LOGISTICS_PAGE_PERMISSIONS.some((slug) => hasPermission(permissions, slug));
}

function visibleTabs(permissions: string[] | undefined): readonly TransfersPageTab[] {
  if (canViewBranchTransfers(permissions)) return TRANSFERS_PAGE_TABS;
  return ["unit"];
}

export default async function TransfersPage({ searchParams }: TransfersPageProps) {
  const session = await requireAnyPermission([...UNIT_TRANSFER_PAGE_PERMISSIONS]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const tabs = visibleTabs(session.user.permissions);
  const requestedTab = parseTransfersPageTab(params.tab);
  const activeTab: TransfersPageTab = tabs.includes(requestedTab) ? requestedTab : "unit";

  if (activeTab === "unit" && params.tab !== "unit") {
    redirect(transfersListHref("unit", page, limit));
  }
  if (activeTab === "transfers" && params.tab && params.tab !== "transfers") {
    redirect(transfersListHref("transfers", page, limit));
  }

  const capabilities = resolveLogisticsCapabilities(session.user.permissions);
  const unrestricted = isBranchScopeUnrestricted(session.user.permissions);
  const [transfers, kpis, branchScope, unitTransfers] = await Promise.all([
    activeTab === "transfers"
      ? listTransfersAction({ page, limit, sort: params.sort, sortDir: params.dir })
      : Promise.resolve(null),
    activeTab === "transfers" ? getTransferKpisAction() : Promise.resolve(null),
    activeTab === "transfers" && !unrestricted
      ? getUserBranchIds(session.user.tenantId, session.user.id)
      : Promise.resolve(null),
    activeTab === "unit"
      ? listDeliveryTransfersAction({ page, limit })
      : Promise.resolve(null),
  ]);
  const currentUserName = session.user.name?.trim() || session.user.email || "";

  return (
    <div className="space-y-4">
      <TransfersPageTabs
        activeTab={activeTab}
        basePath={TRANSFERS_LIST_PATH}
        tabs={tabs}
        transfersContent={
          transfers && kpis ? (
            <div className="space-y-4">
              <SectionPageLead>
                Request a transfer, approve it, send it, then receive the units that arrived.
              </SectionPageLead>
              <TransferKpisStrip kpis={kpis} />
              <TransfersPanel
                transfers={transfers}
                capabilities={capabilities}
                branchScope={unrestricted ? null : branchScope}
                currentUserName={currentUserName}
                initialSort={params.sort ?? ""}
                initialSortDir={params.dir ?? "desc"}
              />
            </div>
          ) : null
        }
        unitContent={
          unitTransfers ? (
            <div className="space-y-4">
              <SectionPageLead>
                Units a branch did not accept from a delivery go on a unit transfer. Approve or delete each line, release it, then accept each unit where it arrives.
              </SectionPageLead>
              <DeliveryTransfersPanel transfers={unitTransfers} />
            </div>
          ) : null
        }
      />
    </div>
  );
}
