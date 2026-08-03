import Link from "next/link";

import type { DashboardPeriodSnapshot } from "@/features/dashboard/services/dashboard-kpi.service";

interface DashboardPeriodSnapshotProps {
  snapshot: DashboardPeriodSnapshot;
  showOrders: boolean;
  showSales: boolean;
  showDeliveryInTransit: boolean;
}

interface SnapshotStat {
  key: string;
  label: string;
  value: number;
  href: string;
}

export function DashboardPeriodSnapshotCard({
  snapshot,
  showOrders,
  showSales,
  showDeliveryInTransit,
}: DashboardPeriodSnapshotProps) {
  const stats: SnapshotStat[] = [];

  if (showOrders) {
    stats.push({
      key: "orders",
      label: "Orders created",
      value: snapshot.ordersThisMonth,
      href: "/orders",
    });
  }
  if (showSales) {
    stats.push({
      key: "sales",
      label: "Sales transactions",
      value: snapshot.salesThisMonth,
      href: "/sales",
    });
  }
  if (showDeliveryInTransit) {
    stats.push({
      key: "dit",
      label: "In transit",
      value: snapshot.deliveryInTransit,
      href: "/logistics/deliveries",
    });
  }

  if (stats.length === 0) return null;

  const monthLabel = new Date().toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex min-h-64 flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div>
        <h3 className="font-semibold">This month</h3>
        <p className="text-sm text-muted-foreground">
          Snapshot for {monthLabel} in your branches
        </p>
      </div>

      <div
        className={
          stats.length === 1
            ? "mt-6 flex flex-1 items-center"
            : stats.length === 2
              ? "mt-6 grid flex-1 grid-cols-1 gap-6 sm:grid-cols-2 sm:items-center"
              : "mt-6 grid flex-1 grid-cols-1 gap-6 sm:grid-cols-3 sm:items-center"
        }
      >
        {stats.map((stat) => (
          <Link
            key={stat.key}
            href={stat.href}
            className="group block rounded-lg p-1 transition-colors hover:bg-muted/40"
          >
            <p className="text-3xl font-semibold tracking-tight tabular-nums group-hover:text-primary">
              {stat.value.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
