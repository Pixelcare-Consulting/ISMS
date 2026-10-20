"use client";

import { useMemo } from "react";
import { createColumnHelper } from "@tanstack/react-table";

import type { SiteTrafficOverview } from "@/features/dashboard/services/site-traffic.service";
import { GlobalKpiCards } from "@/lib/kpi-cards";
import type { KpiCardItem } from "@/lib/kpi-cards";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RecentUserRow = SiteTrafficOverview["recentUsers"][number];
type PageRow = SiteTrafficOverview["pages"][number];
type TopPsRow = SiteTrafficOverview["topPs"][number];

const recentColumn = createColumnHelper<DataTableFeatures, RecentUserRow>();
const pageColumn = createColumnHelper<DataTableFeatures, PageRow>();
const topPsColumn = createColumnHelper<DataTableFeatures, TopPsRow>();

interface SiteTrafficPanelProps {
  overview: SiteTrafficOverview;
}

function relativeTime(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

export function SiteTrafficPanel({ overview }: SiteTrafficPanelProps) {
  const { kpis } = overview;

  const recentColumns = useMemo(() => {
    const cols: DataTableColumn<RecentUserRow>[] = [
      recentColumn.accessor("branchLabel", {
        header: "Branch",
        enableSorting: false,
        meta: { className: "max-w-48 truncate" },
      }),
      recentColumn.display({
        id: "user",
        header: "User",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.original.userName}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      }),
      recentColumn.accessor("roleLabel", {
        header: "Type",
        enableSorting: false,
        meta: { className: "text-xs uppercase" },
      }),
      recentColumn.display({
        id: "isLogin",
        header: "Is login",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.isLogin ? "default" : "secondary"}>
            {row.original.isLogin ? "Yes" : "No"}
          </Badge>
        ),
      }),
      recentColumn.accessor("lastAccess", {
        header: "Last access",
        enableSorting: false,
        meta: { className: "text-xs text-muted-foreground" },
      }),
      recentColumn.display({
        id: "timestamp",
        header: "Timestamp",
        enableSorting: false,
        cell: ({ row }) => relativeTime(row.original.lastSeenAt),
        meta: { className: "whitespace-nowrap text-xs tabular-nums" },
      }),
    ];
    return cols;
  }, []);

  const pageColumns = useMemo(() => {
    const cols: DataTableColumn<PageRow>[] = [
      pageColumn.accessor("location", {
        header: "Last location",
        enableSorting: false,
        meta: { className: "font-mono text-xs" },
      }),
      pageColumn.accessor("count", {
        header: "Count",
        enableSorting: false,
        meta: { className: "tabular-nums" },
      }),
      pageColumn.display({
        id: "timestamp",
        header: "Timestamp",
        enableSorting: false,
        cell: ({ row }) => relativeTime(row.original.lastSeenAt),
        meta: { className: "whitespace-nowrap text-xs tabular-nums" },
      }),
    ];
    return cols;
  }, []);

  const topPsColumns = useMemo(() => {
    const cols: DataTableColumn<TopPsRow>[] = [
      topPsColumn.accessor("branchName", { header: "Branch", enableSorting: false }),
      topPsColumn.accessor("userName", { header: "User", enableSorting: false }),
      topPsColumn.accessor("count", {
        header: "Count",
        enableSorting: false,
        meta: { className: "tabular-nums font-medium" },
      }),
    ];
    return cols;
  }, []);

  const kpiItems: KpiCardItem[] = [
    {
      key: "total-users",
      label: "Total users",
      value: kpis.totalUsers,
      tone: "neutral",
    },
    {
      key: "active-users",
      label: "Active users",
      value: kpis.activeUsers,
      tone: "info",
      hint: "With recent session or update (30 days)",
    },
    {
      key: "login-users",
      label: "Login users",
      value: kpis.loginUsers,
      tone: kpis.loginUsers > 0 ? "warning" : "neutral",
      hint: "Fresh session activity (~15 min)",
    },
    {
      key: "total-ps",
      label: "Total PS",
      value: kpis.totalPs,
      tone: "neutral",
    },
    {
      key: "active-ps",
      label: "Active PS",
      value: kpis.activePs,
      tone: "info",
    },
    {
      key: "login-ps",
      label: "Login PS",
      value: kpis.loginPs,
      tone: kpis.loginPs > 0 ? "warning" : "neutral",
    },
  ];

  return (
    <div className="space-y-4">
      <GlobalKpiCards items={kpiItems} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Activity</CardTitle>
          <CardDescription>
            Live session and sales signals for this tenant — empty cells mean no
            data yet, not placeholders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="recent">
            <TabsList>
              <TabsTrigger value="recent">Recent users</TabsTrigger>
              <TabsTrigger value="pages">Pages</TabsTrigger>
              <TabsTrigger value="top-ps">Top PS</TabsTrigger>
            </TabsList>

            <TabsContent value="recent" className="mt-4">
              <DataTable
                chrome="plain"
                data={overview.recentUsers}
                columns={recentColumns}
                getRowId={(row) => row.userId}
                stickyHeader
                empty={overview.recentUsers.length === 0}
                emptyMessage="No session activity recorded yet."
              />
            </TabsContent>

            <TabsContent value="pages" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">{overview.pagesNote}</p>
              <DataTable
                chrome="plain"
                data={overview.pages}
                columns={pageColumns}
                getRowId={(row) => row.location}
                stickyHeader
                empty={overview.pages.length === 0}
                emptyMessage="No audit activity to summarize yet."
              />
            </TabsContent>

            <TabsContent value="top-ps" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                PS sales for {overview.topPsPeriodLabel}. Total successful
                transactions this month:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {overview.topPsTotalSales}
                </span>
              </p>
              <DataTable
                chrome="plain"
                data={overview.topPs}
                columns={topPsColumns}
                getRowId={(row) => row.userId}
                stickyHeader
                empty={overview.topPs.length === 0}
                emptyMessage="No sales transactions this month yet."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
