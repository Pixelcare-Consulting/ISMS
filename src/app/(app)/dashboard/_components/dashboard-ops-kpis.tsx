import {
  AlertTriangle,
  ClipboardList,
  Package,
  PackageOpen,
  ShoppingCart,
  TrendingDown,
  Truck,
  Warehouse,
} from "lucide-react";

import type { DashboardKpiKey } from "@/features/dashboard/constants/dashboard-permissions";
import type { DashboardKpis } from "@/features/dashboard/services/dashboard-kpi.service";
import { GlobalKpiCards } from "@/lib/kpi-cards";
import type { KpiCardItem, KpiCardTone } from "@/lib/kpi-cards";

interface DashboardOpsKpisProps {
  kpis: DashboardKpis;
  visibleKeys: DashboardKpiKey[];
}

function alertTone(count: number, severity: "warning" | "danger" = "warning"): KpiCardTone {
  if (count <= 0) return "neutral";
  return severity;
}

/** Shared KPI card metadata for activity strip and Planning & alerts list. */
export function buildDashboardKpiItem(
  key: DashboardKpiKey,
  kpis: DashboardKpis,
): KpiCardItem {
  switch (key) {
    case "pendingOrderApprovals":
      return {
        key,
        label: "Pending order approvals",
        value: kpis.pendingOrderApprovals,
        href: "/orders",
        icon: <ClipboardList />,
        tone: alertTone(kpis.pendingOrderApprovals, "danger"),
        hint: kpis.pendingOrderApprovals > 0 ? "Needs review" : undefined,
      };
    case "deliveryInTransit":
      return {
        key,
        label: "Delivery in transit",
        value: kpis.deliveryInTransit,
        href: "/logistics/deliveries",
        icon: <Truck />,
        tone: alertTone(kpis.deliveryInTransit, "info"),
      };
    case "stockCount":
      return {
        key,
        label: "Stock on hand",
        value: kpis.stockCount,
        href: "/inventory",
        icon: <Warehouse />,
      };
    case "openAtr":
      return {
        key,
        label: "Open ATR",
        value: kpis.openAtr,
        href: "/sales",
        icon: <PackageOpen />,
        tone: alertTone(kpis.openAtr, "warning"),
        hint: kpis.openAtr > 0 ? "Returns in progress" : undefined,
      };
    case "belowPlanogramCapacity":
      return {
        key,
        label: "Below planogram capacity",
        value: kpis.belowPlanogramCapacity,
        href: "/settings/planogram",
        icon: <TrendingDown />,
        tone: alertTone(kpis.belowPlanogramCapacity, "warning"),
      };
    case "milBreaches":
      return {
        key,
        label: "MIL threshold breaches",
        value: kpis.milBreaches,
        href: "/settings/planogram",
        icon: <AlertTriangle />,
        tone: alertTone(kpis.milBreaches, "danger"),
        hint: kpis.milBreaches > 0 ? "Below minimum" : undefined,
      };
    case "allocationGaps":
      return {
        key,
        label: "Allocation gaps",
        value: kpis.allocationGapCount,
        href: "/settings/planning",
        icon: <Package />,
        tone: alertTone(kpis.allocationGapCount, "warning"),
      };
    case "draftSuggestedOrders":
      return {
        key,
        label: "Draft suggested orders",
        value: kpis.draftSuggestedOrders,
        href: "/planning/suggested-orders",
        icon: <ShoppingCart />,
        tone: alertTone(kpis.draftSuggestedOrders, "info"),
      };
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function DashboardOpsKpis({ kpis, visibleKeys }: DashboardOpsKpisProps) {
  if (visibleKeys.length === 0) return null;
  const items = visibleKeys.map((key) => buildDashboardKpiItem(key, kpis));
  return <GlobalKpiCards items={items} />;
}
