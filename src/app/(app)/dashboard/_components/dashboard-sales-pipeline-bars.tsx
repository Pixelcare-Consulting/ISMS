"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { KpiStatusCount } from "@/lib/kpi-cards";

interface DashboardSalesPipelineBarsProps {
  data: KpiStatusCount[];
}

export function DashboardSalesPipelineBars({
  data,
}: DashboardSalesPipelineBarsProps) {
  const chartData = data.map((row) => ({
    code: row.code,
    name: row.name,
    count: row.count,
  }));
  const total = data.reduce((sum, row) => sum + row.count, 0);
  const hasAny = total > 0;

  return (
    <div className="flex h-full min-h-64 w-full flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">ATR / return pipeline</h3>
          <p className="text-sm text-muted-foreground">
            Sales ATR and return request stages
          </p>
        </div>
        <Link
          href="/sales"
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          View sales
        </Link>
      </div>

      {!hasAny ? (
        <div className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">
          No ATR or return activity yet.
        </div>
      ) : (
        <div className="mt-3 h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              barCategoryGap="18%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="hsl(var(--border))"
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={108}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickMargin={6}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <Tooltip
                formatter={(value) => [
                  typeof value === "number"
                    ? value.toLocaleString()
                    : String(value ?? ""),
                  "Count",
                ]}
                contentStyle={{
                  borderRadius: "0.5rem",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  color: "hsl(var(--card-foreground))",
                  fontSize: "0.75rem",
                }}
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--primary))"
                radius={[0, 4, 4, 0]}
                maxBarSize={18}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
