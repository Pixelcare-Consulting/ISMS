"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DemandPlanSeriesMix } from "@/features/demand-planning";

interface MixRationalisationChartProps {
  mixBySeries: DemandPlanSeriesMix[];
}

export function MixRationalisationChart({ mixBySeries }: MixRationalisationChartProps) {
  const hasAny = mixBySeries.some((row) => row.historyShare > 0 || row.milShare > 0);
  const minWidth = Math.max(320, mixBySeries.length * 56);

  return (
    <div className="flex h-full min-h-64 w-full min-w-0 flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div>
        <h3 className="font-semibold">Mix rationalisation</h3>
        <p className="text-sm text-muted-foreground">
          History share vs MIL share by series
        </p>
      </div>

      {!hasAny ? (
        <div className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">
          No series mix to compare yet.
        </div>
      ) : (
        <div className="mt-3 h-72 w-full min-w-0 overflow-x-auto">
          <div style={{ minWidth, height: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={mixBySeries.map((row) => ({
                  series: row.series,
                  historyShare: Number((row.historyShare * 100).toFixed(1)),
                  milShare: Number((row.milShare * 100).toFixed(1)),
                }))}
                margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                barCategoryGap="22%"
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="series"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={64}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) => `${value}%`}
                  width={40}
                />
                <Tooltip
                  formatter={(value) => [
                    typeof value === "number" ? `${value.toFixed(1)}%` : String(value ?? ""),
                  ]}
                  contentStyle={{
                    borderRadius: "0.5rem",
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    color: "hsl(var(--card-foreground))",
                    fontSize: "0.75rem",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "0.75rem" }} />
                <Bar
                  dataKey="historyShare"
                  name="History share"
                  fill="hsl(var(--muted-foreground))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="milShare"
                  name="MIL share"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
