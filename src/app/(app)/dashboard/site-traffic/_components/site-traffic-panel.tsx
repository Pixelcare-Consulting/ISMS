"use client";

import type { SiteTrafficOverview } from "@/features/dashboard/services/site-traffic.service";
import { GlobalKpiCards } from "@/lib/kpi-cards";
import type { KpiCardItem } from "@/lib/kpi-cards";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
              {overview.recentUsers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No session activity recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Branch</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Is login</TableHead>
                        <TableHead>Last access</TableHead>
                        <TableHead>Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.recentUsers.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell className="max-w-[12rem] truncate">
                            {row.branchLabel}
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {row.userName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {row.email}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs uppercase">
                            {row.roleLabel}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={row.isLogin ? "default" : "secondary"}
                            >
                              {row.isLogin ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.lastAccess}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {relativeTime(row.lastSeenAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="pages" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">{overview.pagesNote}</p>
              {overview.pages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No audit activity to summarize yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Last location</TableHead>
                        <TableHead className="w-24">Count</TableHead>
                        <TableHead className="w-40">Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.pages.map((row) => (
                        <TableRow key={row.location}>
                          <TableCell className="font-mono text-xs">
                            {row.location}
                          </TableCell>
                          <TableCell className="tabular-nums">{row.count}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {relativeTime(row.lastSeenAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="top-ps" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                PS sales for {overview.topPsPeriodLabel}. Total successful
                transactions this month:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {overview.topPsTotalSales}
                </span>
              </p>
              {overview.topPs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No sales transactions this month yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Branch</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead className="w-24">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.topPs.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell>{row.branchName}</TableCell>
                          <TableCell>{row.userName}</TableCell>
                          <TableCell className="tabular-nums font-medium">
                            {row.count}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
