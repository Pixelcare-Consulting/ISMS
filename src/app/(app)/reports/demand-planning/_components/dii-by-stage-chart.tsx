"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CoverageDiiStage } from "@/features/demand-planning/services/coverage.service";

interface DiiByStageChartProps {
  stages: CoverageDiiStage[];
  targetDays: number;
}

function formatDays(value: number): string {
  return `${value.toFixed(1)} d`;
}

export function DiiByStageChart({ stages, targetDays }: DiiByStageChartProps) {
  const hasAny = stages.some((stage) => stage.days > 0);

  return (
    <div className="flex h-full min-h-64 w-full flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div>
        <h3 className="font-semibold">DII by stage</h3>
        <p className="text-sm text-muted-foreground">
          Days in inventory vs min-level target ({formatDays(targetDays)})
        </p>
      </div>

      {!hasAny ? (
        <div className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">
          No planned coverage to chart yet.
        </div>
      ) : (
        <div className="mt-3 h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stages.map((stage) => ({
                stage: stage.label,
                days: Number(stage.days.toFixed(1)),
              }))}
              margin={{ top: 12, right: 12, left: 0, bottom: 8 }}
              barCategoryGap="18%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="stage"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={56}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value: number) => value.toFixed(0)}
                width={36}
              />
              <Tooltip
                formatter={(value) => [
                  typeof value === "number" ? formatDays(value) : String(value ?? ""),
                  "DII",
                ]}
                contentStyle={{
                  borderRadius: "0.5rem",
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  color: "hsl(var(--card-foreground))",
                  fontSize: "0.75rem",
                }}
              />
              <ReferenceLine
                y={targetDays}
                stroke="#dc2626"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{
                  value: "Min level",
                  fill: "#dc2626",
                  fontSize: 11,
                  position: "insideTopRight",
                }}
              />
              <Bar
                dataKey="days"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
