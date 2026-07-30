import {
  getStockCountKpisAction,
  listStockCountSessionsAction,
} from "@/features/stock-audit/actions/stock-audit.actions";
import { StockCountKpisStrip } from "@/features/stock-audit/components/stock-count-kpis";
import { parseTablePageSize } from "@/components/data-table/table-page-size";
import { requirePermission } from "@/lib/auth/permissions";
import { SectionPageLead } from "@/components/navigation/section-page-lead";
import { StockCountListPanel } from "@/app/(app)/inventory/stock-count/_components/stock-count-list-panel";

interface StockCountPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function StockCountPage({ searchParams }: StockCountPageProps) {
  await requirePermission("inventory.view");
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = parseTablePageSize(params.limit);
  const [sessions, kpis] = await Promise.all([
    listStockCountSessionsAction({ page, limit }),
    getStockCountKpisAction(),
  ]);

  return (
    <div className="space-y-4">
      <SectionPageLead>
        Count list from branch STK, PS scan, variance report, TL investigation, SAP adjustment handoff.
      </SectionPageLead>
      <StockCountKpisStrip kpis={kpis} />
      <StockCountListPanel sessions={sessions} />
    </div>
  );
}
