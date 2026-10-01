import type { PcountDashboardKpis } from "@/features/stock-audit/services/pcount-dashboard.service";
import { GlobalKpiCards } from "@/lib/kpi-cards";
import type { KpiCardItem } from "@/lib/kpi-cards";

interface PcountDashboardKpisStripProps {
  kpis: PcountDashboardKpis;
  periodLabel: string;
}

export function PcountDashboardKpisStrip({
  kpis,
  periodLabel,
}: PcountDashboardKpisStripProps) {
  const items: KpiCardItem[] = [
    {
      key: "done",
      label: "Branches done this month",
      value: `${kpis.branchesDone} / ${kpis.branchesActive}`,
      tone: kpis.branchesDone === kpis.branchesActive && kpis.branchesActive > 0
        ? "info"
        : "neutral",
      hint: periodLabel,
    },
    {
      key: "counting",
      label: "Counting open",
      value: kpis.countingOpen,
      tone: kpis.countingOpen > 0 ? "warning" : "neutral",
    },
    {
      key: "ready",
      label: "Ready to post",
      value: kpis.readyToPost,
      tone: kpis.readyToPost > 0 ? "warning" : "neutral",
    },
    {
      key: "pending-sap",
      label: "Posted · pending SAP",
      value: kpis.pendingSap,
      tone: kpis.pendingSap > 0 ? "info" : "neutral",
    },
  ];

  return <GlobalKpiCards items={items} />;
}
