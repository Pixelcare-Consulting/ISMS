import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, ShoppingCart, Truck } from "lucide-react";

import type { DashboardPeriodSnapshot } from "@/features/dashboard/services/dashboard-kpi.service";
import { cn } from "@/utils/cn";

interface DashboardPeriodSnapshotProps {
  snapshot: DashboardPeriodSnapshot;
  showOrders: boolean;
  showSales: boolean;
  showDeliveryInTransit: boolean;
  className?: string;
}

interface SnapshotStat {
  key: string;
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
  iconClass: string;
}

export function DashboardPeriodSnapshotCard({
  snapshot,
  showOrders,
  showSales,
  showDeliveryInTransit,
  className,
}: DashboardPeriodSnapshotProps) {
  const stats: SnapshotStat[] = [];

  if (showOrders) {
    stats.push({
      key: "orders",
      label: "Orders created",
      value: snapshot.ordersThisMonth,
      href: "/orders",
      icon: ClipboardList,
      iconClass: "bg-primary/10 text-primary",
    });
  }
  if (showSales) {
    stats.push({
      key: "sales",
      label: "Sales transactions",
      value: snapshot.salesThisMonth,
      href: "/sales",
      icon: ShoppingCart,
      iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    });
  }
  if (showDeliveryInTransit) {
    stats.push({
      key: "dit",
      label: "In transit",
      value: snapshot.deliveryInTransit,
      href: "/logistics/deliveries",
      icon: Truck,
      iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    });
  }

  if (stats.length === 0) return null;

  const monthLabel = new Date().toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className={cn(
        "flex h-full min-h-64 flex-col rounded-xl border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div>
        <h3 className="font-semibold">This month</h3>
        <p className="text-sm text-muted-foreground">
          Snapshot for {monthLabel} in your branches
        </p>
      </div>

      <ul className="mt-4 flex flex-1 flex-col justify-center gap-2">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <li key={stat.key}>
              <Link
                href={stat.href}
                className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2.5 transition-colors hover:border-border hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg",
                    stat.iconClass,
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums group-hover:text-primary">
                    {stat.value.toLocaleString()}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
