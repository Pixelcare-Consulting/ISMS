"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
} from "recharts";

import type { KpiStatusCount } from "@/lib/kpi-cards";

interface StockStatusDonutProps {
  data: KpiStatusCount[];
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(220 14% 55%)",
  "hsl(38 92% 50%)",
  "hsl(var(--destructive))",
  "hsl(200 18% 46%)",
  "hsl(160 20% 40%)",
  "hsl(240 5% 64%)",
  "hsl(25 70% 48%)",
];

interface SegmentPayload {
  name: string;
  code: string;
  count: number;
}

function isSegmentPayload(value: unknown): value is SegmentPayload {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.name === "string" &&
    row.name.toLowerCase() !== "total" &&
    typeof row.code === "string" &&
    typeof row.count === "number"
  );
}

function StockDonutTooltip({
  active,
  payload,
  coordinate,
}: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!isSegmentPayload(row)) return null;

  // Keep tooltip away from the center total label.
  const style: CSSProperties = {
    borderRadius: "0.5rem",
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    color: "hsl(var(--card-foreground))",
    fontSize: "0.75rem",
    padding: "0.5rem 0.625rem",
    boxShadow: "0 1px 2px hsl(var(--foreground) / 0.06)",
    pointerEvents: "none",
  };

  if (coordinate?.x != null && coordinate.x < 110) {
    style.transform = "translate(12px, -50%)";
  }

  return (
    <div style={style}>
      <p className="font-medium">{row.name}</p>
      <p className="mt-0.5 tabular-nums text-muted-foreground">
        {row.count.toLocaleString()} units
        <span className="ml-1 text-[0.65rem] uppercase tracking-wide opacity-70">
          ({row.code})
        </span>
      </p>
    </div>
  );
}

export function StockStatusDonut({ data }: StockStatusDonutProps) {
  const chartData = data
    .filter((row) => row.count > 0)
    .map((row) => ({
      name: row.name,
      code: row.code,
      count: row.count,
    }));
  const total = chartData.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex min-h-64 flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Inventory summary</h3>
          <p className="text-sm text-muted-foreground">
            Units by inventory status in your branches
          </p>
        </div>
        <Link
          href="/inventory"
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          View inventory
        </Link>
      </div>

      {total === 0 || chartData.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
          No stock in your branches yet.
        </div>
      ) : (
        <div className="mt-4 flex flex-1 flex-col gap-4 sm:flex-row sm:items-stretch">
          <div className="relative mx-auto h-44 w-full max-w-52 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={70}
                  paddingAngle={2}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={entry.code}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={StockDonutTooltip}
                  allowEscapeViewBox={{ x: true, y: true }}
                  wrapperStyle={{ outline: "none", zIndex: 10 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 z-1 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold tabular-nums">
                {total.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">total</span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 divide-y rounded-lg border">
            {chartData.map((row, index) => (
              <li
                key={row.code}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    background: CHART_COLORS[index % CHART_COLORS.length],
                  }}
                  aria-hidden
                />
                <span className="w-10 shrink-0 font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {row.code}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {row.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {row.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
