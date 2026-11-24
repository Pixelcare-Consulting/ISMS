"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { formatSiteTrafficRelativeTime } from "@/features/dashboard/lib/site-traffic-time";
import type { SiteTrafficOverview } from "@/features/dashboard/services/site-traffic.service";
import { resetUserSessionAction } from "@/features/users/actions/user.actions";
import {
  resetSessionConfirmDescription,
  resetSessionDeniedReason,
} from "@/features/users/lib/user-account-guards";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFeatures,
} from "@/lib/data-table";
import { DeleteConfirmDialog } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/utils/cn";

type RecentUserRow = SiteTrafficOverview["recentUsers"][number];
type PageRow = SiteTrafficOverview["pages"][number];
type TopPsRow = SiteTrafficOverview["topPs"][number];

const recentColumn = createColumnHelper<DataTableFeatures, RecentUserRow>();
const pageColumn = createColumnHelper<DataTableFeatures, PageRow>();
const topPsColumn = createColumnHelper<DataTableFeatures, TopPsRow>();

interface SiteTrafficPanelProps {
  overview: SiteTrafficOverview;
  /** Server render instant. First paint uses this clock so the label matches the HTML. */
  observedAt: string;
  currentUserId: string;
  canResetSessions: boolean;
}

const RING_STROKE = {
  orange: "stroke-orange-500",
  green: "stroke-emerald-500",
  blue: "stroke-sky-500",
} as const;

function TrafficRing({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: keyof typeof RING_STROKE;
}) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const ratio =
    tone === "orange"
      ? value > 0
        ? 1
        : 0
      : total > 0
        ? Math.min(value / total, 1)
        : 0;
  const dash = circumference * ratio;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative size-32" role="img" aria-label={`${label}: ${value}`}>
        <svg viewBox="0 0 80 80" className="size-32 -rotate-90" aria-hidden>
          <circle
            cx="40"
            cy="40"
            r={radius}
            className="fill-none stroke-muted"
            strokeWidth="8"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            className={cn("fill-none", RING_STROKE[tone])}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-3xl font-semibold tabular-nums">
          {value}
        </div>
      </div>
      <p className="text-center text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

function SiteTrafficTimestamp({
  value,
  observedAt,
}: {
  value: Date | string | null;
  observedAt: string;
}) {
  const [liveNowMs, setLiveNowMs] = useState<number | null>(null);
  const valueMs =
    value == null ? Number.NaN : value instanceof Date ? value.getTime() : Date.parse(value);
  const valueKey = Number.isNaN(valueMs) ? "" : String(valueMs);

  useEffect(() => {
    if (!valueKey) return;
    const tick = () => setLiveNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [valueKey]);

  if (!valueKey || value == null) return "—";
  return formatSiteTrafficRelativeTime(value, liveNowMs ?? observedAt);
}

export function SiteTrafficPanel({
  overview,
  observedAt,
  currentUserId,
  canResetSessions,
}: SiteTrafficPanelProps) {
  const router = useRouter();
  const { kpis } = overview;
  const [resettingUser, setResettingUser] = useState<RecentUserRow | null>(null);
  const [pending, startTransition] = useTransition();

  function handleResetSessionConfirm() {
    if (!resettingUser) return;
    startTransition(async () => {
      const result = await resetUserSessionAction(resettingUser.userId);
      if (result.error) {
        toast.error("Could not reset session", { description: result.error });
        return;
      }
      toast.success("Session reset", {
        description: `${resettingUser.userName} can sign in again.`,
      });
      setResettingUser(null);
      router.refresh();
    });
  }

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
        cell: ({ row }) => (
          <SiteTrafficTimestamp
            value={row.original.lastSeenAt}
            observedAt={observedAt}
          />
        ),
        meta: { className: "whitespace-nowrap text-xs tabular-nums" },
      }),
    ];
    if (canResetSessions) {
      cols.push(
        recentColumn.display({
          id: "reset",
          header: "",
          enableSorting: false,
          cell: ({ row }) => {
            const denied = resetSessionDeniedReason({
              actorUserId: currentUserId,
              targetUserId: row.original.userId,
              targetRoles: row.original.isSuperAdmin
                ? [{ role: { slug: "super_admin" } }]
                : [],
            });
            return (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={Boolean(denied)}
                title={denied ?? "Reset session"}
                aria-label="Reset session"
                onClick={() => setResettingUser(row.original)}
              >
                <LogOut className="size-4" />
              </Button>
            );
          },
          meta: { align: "end" },
        }),
      );
    }
    return cols;
  }, [canResetSessions, currentUserId, observedAt]);

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
        cell: ({ row }) => (
          <SiteTrafficTimestamp
            value={row.original.lastSeenAt}
            observedAt={observedAt}
          />
        ),
        meta: { className: "whitespace-nowrap text-xs tabular-nums" },
      }),
    ];
    return cols;
  }, [observedAt]);

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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <TrafficRing label="Total users" value={kpis.totalUsers} total={kpis.totalUsers} tone="orange" />
          <TrafficRing label="Active users" value={kpis.activeUsers} total={kpis.totalUsers} tone="green" />
          <TrafficRing label="Login users" value={kpis.loginUsers} total={kpis.totalUsers} tone="blue" />
          <TrafficRing label="Total PS" value={kpis.totalPs} total={kpis.totalPs} tone="orange" />
          <TrafficRing label="Active PS" value={kpis.activePs} total={kpis.totalPs} tone="green" />
          <TrafficRing label="Login PS" value={kpis.loginPs} total={kpis.totalPs} tone="blue" />
        </div>
        {/* DO NOT UNCOMMENT THIS, NO NEED TO SHOW IN THE SITE TRAFFIC PANEL <p className="text-xs text-muted-foreground">
          Orange is the total. Green is active. Blue is signed in within the last 30 minutes.
        </p> */}
      </div>

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
              <DataTable
                chrome="plain"
                data={overview.pages}
                columns={pageColumns}
                getRowId={(row) => row.location}
                stickyHeader
                empty={overview.pages.length === 0}
                emptyMessage="No page visits recorded yet."
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

      {resettingUser ? (
        <DeleteConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setResettingUser(null);
          }}
          title="Reset session"
          description={resetSessionConfirmDescription(resettingUser.userName)}
          confirmLabel="Reset session"
          pendingLabel="Resetting…"
          confirmVariant="default"
          pending={pending}
          onConfirm={handleResetSessionConfirm}
        />
      ) : null}
    </div>
  );
}
