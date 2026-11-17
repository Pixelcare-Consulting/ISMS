import type { SalesKpis } from "@/features/sales/services/sales-kpi.service";
import { buildSalesPageHref } from "@/features/sales/utils/sales-page-href";
import { GlobalKpiCards, buildStatusKpiItems } from "@/lib/kpi-cards";

interface SalesKpisStripProps {
  kpis: SalesKpis;
  /** Canonical status from `?status=`. Empty means the full list. */
  status?: string;
  /** Active table search. Card counts already reflect it; links keep it. */
  q?: string;
  limit: number;
  sort?: string;
  sortDir?: string;
  /** List page the cards link to. Defaults to branch Sales. */
  basePath?: string;
}

export function SalesKpisStrip({
  kpis,
  status,
  q,
  limit,
  sort,
  sortDir,
  basePath,
}: SalesKpisStripProps) {
  const items = buildStatusKpiItems({
    totalLabel: "Total lines",
    totalValue: kpis.totalLines,
    statuses: kpis.statuses,
    statusBadges: true,
  }).map((item) => {
    const itemStatus = item.key === "total" ? undefined : item.key;
    return {
      ...item,
      href: buildSalesPageHref({
        basePath,
        limit,
        sort,
        sortDir: sort ? sortDir : undefined,
        status: itemStatus,
        q,
      }),
      selected: item.key === "total" ? !status : status === item.key,
    };
  });

  return <GlobalKpiCards items={items} />;
}
