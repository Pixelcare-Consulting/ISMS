import {
  getTransferKpisAction,
  listTransfersAction,
} from "@/features/logistics/actions/logistics.actions";
import { LOGISTICS_PAGE_PERMISSIONS } from "@/features/logistics/constants/logistics-permissions";
import { TransferKpisStrip } from "@/features/logistics/components/transfer-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { TransfersPanel } from "@/app/(app)/logistics/_components/transfers-panel";

interface TransfersPageProps {
  searchParams: Promise<{ page?: string; limit?: string; sort?: string; dir?: string }>;
}

export default async function TransfersPage({ searchParams }: TransfersPageProps) {
  await requireAnyPermission([...LOGISTICS_PAGE_PERMISSIONS]);
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const [transfers, kpis] = await Promise.all([
    listTransfersAction({ page, limit, sort: params.sort, sortDir: params.dir }),
    getTransferKpisAction(),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        PS requests → TL approves → logistics executes → receiving branch accepts.
      </SectionPageLead>
      <TransferKpisStrip kpis={kpis} />
      <TransfersPanel
        transfers={transfers}
        initialSort={params.sort ?? ""}
        initialSortDir={params.dir ?? "desc"}
      />
    </div>
  );
}
