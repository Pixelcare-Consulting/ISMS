import {
  Banknote,
  PackageOpen,
  RotateCcw,
  ShoppingCart,
} from "lucide-react";

import type { DashboardSalesKpis } from "@/features/dashboard/services/dashboard-sales.service";
import { GlobalKpiCards } from "@/lib/kpi-cards";
import type { KpiCardItem, KpiCardTone } from "@/lib/kpi-cards";
import { formatPeso } from "@/utils/format-currency";

interface DashboardSalesKpisProps {
  kpis: DashboardSalesKpis;
}

function alertTone(
  count: number,
  severity: "info" | "warning" | "danger" = "warning",
): KpiCardTone {
  if (count <= 0) return "neutral";
  return severity;
}

export function DashboardSalesKpisStrip({ kpis }: DashboardSalesKpisProps) {
  const items: KpiCardItem[] = [
    {
      key: "salesThisMonth",
      label: "Sales this month",
      value: kpis.salesThisMonth,
      href: "/sales",
      icon: <ShoppingCart />,
    },
    {
      key: "saleAmountThisMonth",
      label: "Sale amount (month)",
      value: formatPeso(kpis.saleAmountThisMonth),
      href: "/sales",
      icon: <Banknote />,
    },
    {
      key: "openAtr",
      label: "Open ATR",
      value: kpis.openAtr,
      href: "/returns",
      icon: <PackageOpen />,
      tone: alertTone(kpis.openAtr, "warning"),
      hint: kpis.openAtr > 0 ? "Needs attention" : undefined,
    },
    {
      key: "returnsInProgress",
      label: "Returns in progress",
      value: kpis.returnsInProgress,
      href: "/returns",
      icon: <RotateCcw />,
      tone: alertTone(kpis.returnsInProgress, "info"),
    },
  ];

  return <GlobalKpiCards items={items} />;
}
