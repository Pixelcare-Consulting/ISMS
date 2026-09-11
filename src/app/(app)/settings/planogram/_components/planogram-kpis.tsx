import { GlobalKpiCards, type KpiCardItem, type KpiCardTone } from "@/lib/kpi-cards";
import {
  buildPlanogramIndexHref,
  type PlanogramIndexKpis,
  type PlanogramIndexView,
} from "@/features/planogram/lib/planogram-index";

interface PlanogramKpisStripProps {
  kpis: PlanogramIndexKpis;
  view: PlanogramIndexView | null;
  query: string;
}

function selectedTone(selected: boolean, fallback: KpiCardTone = "neutral"): KpiCardTone {
  return selected ? "info" : fallback;
}

function cardHref(
  cardView: PlanogramIndexView | null,
  currentView: PlanogramIndexView | null,
  query: string,
): string {
  if (cardView == null) {
    return buildPlanogramIndexHref({ view: null, q: query });
  }
  const next = currentView === cardView ? null : cardView;
  return buildPlanogramIndexHref({ view: next, q: query });
}

export function PlanogramKpisStrip({ kpis, view, query }: PlanogramKpisStripProps) {
  const items: KpiCardItem[] = [
    {
      key: "total",
      label: "Total branches",
      value: kpis.totalBranches,
      href: cardHref(null, view, query),
      tone: selectedTone(view == null),
    },
    {
      key: "with",
      label: "With planogram",
      value: kpis.withPlanogram,
      href: cardHref("with", view, query),
      tone: selectedTone(view === "with"),
      hint: "At least one SKU",
    },
    {
      key: "empty",
      label: "No planogram",
      value: kpis.noPlanogram,
      href: cardHref("empty", view, query),
      tone: selectedTone(view === "empty"),
      hint: "Zero SKU rows",
    },
    {
      key: "skuRows",
      label: "SKU rows",
      value: kpis.skuRows,
      href: cardHref("with", view, query),
      tone: selectedTone(view === "with"),
    },
  ];

  return <GlobalKpiCards items={items} />;
}
