"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  FileText,
  ListChecks,
  Package,
  RotateCcw,
  Settings,
  ShoppingCart,
  Truck,
} from "lucide-react";

import type {
  WorkflowChart,
  WorkflowChartNode,
} from "@/content/workflow-flowcharts";
import { cn } from "@/utils/cn";

const OVERVIEW_ICONS: Record<string, LucideIcon> = {
  setup: Settings,
  plan: ClipboardList,
  order: ClipboardCheck,
  deliver: Truck,
  stock: Package,
  sell: ShoppingCart,
  return: RotateCcw,
  move: ArrowLeftRight,
  count: ListChecks,
  report: BarChart3,
  policies: FileText,
};

function nodeById(
  nodes: WorkflowChartNode[],
  id: string,
): WorkflowChartNode | undefined {
  return nodes.find((node) => node.id === id);
}

function OverviewStepCard({
  node,
  index,
  total,
}: {
  node: WorkflowChartNode;
  index: number;
  total: number;
}) {
  const Icon = OVERVIEW_ICONS[node.id];
  const step = index + 1;

  return (
    <li className="relative min-w-0">
      <div className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card px-3 py-3 transition-colors hover:border-primary/40 hover:bg-muted/50">
        <div className="flex items-start gap-2.5">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground">
            {step}
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5">
              {Icon ? (
                <Icon className="size-3.5 shrink-0 text-primary" aria-hidden />
              ) : null}
              <p className="text-sm font-semibold leading-snug text-foreground">
                {node.label}
              </p>
            </div>
            {node.hint ? (
              <p className="text-[11px] leading-snug text-muted-foreground">
                {node.hint}
              </p>
            ) : null}
          </div>
        </div>
        {index < total - 1 ? (
          <span className="sr-only">Then step {step + 1}</span>
        ) : null}
      </div>
    </li>
  );
}

function OverviewFlow({ chart }: { chart: WorkflowChart }) {
  const total = chart.nodes.length;

  return (
    <>
      {/* Mobile: vertical numbered timeline */}
      <ol className="relative space-y-0 md:hidden">
        {chart.nodes.map((node, index) => {
          const Icon = OVERVIEW_ICONS[node.id];
          const isLast = index === total - 1;

          return (
            <li key={node.id} className="relative flex gap-3 pb-5 last:pb-0">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span className="z-1 inline-flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground">
                  {index + 1}
                </span>
                {!isLast ? (
                  <span
                    className="mt-1 w-px flex-1 bg-border"
                    aria-hidden
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-1.5">
                  {Icon ? (
                    <Icon
                      className="size-3.5 shrink-0 text-primary"
                      aria-hidden
                    />
                  ) : null}
                  <p className="text-sm font-semibold leading-snug text-foreground">
                    {node.label}
                  </p>
                </div>
                {node.hint ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {node.hint}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Desktop: wrapping equal step cards — no overflow-x */}
      <ol className="hidden gap-2.5 md:grid md:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
        {chart.nodes.map((node, index) => (
          <OverviewStepCard
            key={node.id}
            node={node}
            index={index}
            total={total}
          />
        ))}
      </ol>
    </>
  );
}

function SwimlaneStep({
  node,
  index,
  isLast,
}: {
  node: WorkflowChartNode;
  index: number;
  isLast: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <div className="flex w-5 shrink-0 flex-col items-center">
        <span className="z-1 mt-0.5 size-2.5 shrink-0 rounded-full border-2 border-background bg-primary" />
        {!isLast ? (
          <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pb-0.5">
        <p className="text-sm font-medium leading-snug text-foreground">
          <span className="mr-1.5 text-[11px] font-semibold tabular-nums text-primary">
            {index + 1}.
          </span>
          {node.label}
        </p>
        {node.hint ? (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {node.hint}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function SwimlaneFlow({ chart }: { chart: WorkflowChart }) {
  const lanes = chart.lanes ?? [];

  return (
    <div className="space-y-5">
      {lanes.map((lane) => {
        const laneNodes = lane.nodeIds
          .map((id) => nodeById(chart.nodes, id))
          .filter((node): node is WorkflowChartNode => Boolean(node));

        return (
          <div key={lane.id} className="space-y-2.5">
            <span className="inline-flex rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
              {lane.role}
            </span>
            <ol className="pl-0.5">
              {laneNodes.map((node, index) => (
                <SwimlaneStep
                  key={node.id}
                  node={node}
                  index={index}
                  isLast={index === laneNodes.length - 1}
                />
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function MatrixFlow({ chart }: { chart: WorkflowChart }) {
  const lanes = chart.lanes ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-64 border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-muted-foreground">
            <th className="py-2 pr-4 text-xs font-medium">Role</th>
            <th className="py-2 text-xs font-medium">Responsibilities</th>
          </tr>
        </thead>
        <tbody>
          {lanes.map((lane) => {
            const responsibility = lane.nodeIds
              .map((id) => nodeById(chart.nodes, id)?.label)
              .filter(Boolean)
              .join("; ");

            return (
              <tr
                key={lane.id}
                className="border-b border-border/40 last:border-0"
              >
                <td className="py-2.5 pr-4 align-top font-medium text-foreground">
                  {lane.role}
                </td>
                <td className="py-2.5 align-top text-muted-foreground">
                  {responsibility}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface WorkflowFlowchartProps {
  chart: WorkflowChart;
  className?: string;
  /** When false, skip chart title/summary (parent already labels the section/tab). */
  showHeader?: boolean;
  showCallouts?: boolean;
}

function ChartBody({ chart }: { chart: WorkflowChart }) {
  switch (chart.kind) {
    case "overview":
      return <OverviewFlow chart={chart} />;
    case "swimlane":
      return <SwimlaneFlow chart={chart} />;
    case "matrix":
      return <MatrixFlow chart={chart} />;
    default: {
      const _exhaustive: never = chart.kind;
      return _exhaustive;
    }
  }
}

export function WorkflowFlowchart({
  chart,
  className,
  showHeader = true,
  showCallouts = true,
}: WorkflowFlowchartProps) {
  const callouts =
    showCallouts && chart.callouts && chart.callouts.length > 0 ? (
      <ul className="mt-4 space-y-1.5 border-t border-border/50 pt-3 text-xs text-muted-foreground">
        {chart.callouts.map((callout) => (
          <li key={callout} className="leading-snug">
            {callout}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className={cn("min-w-0", className)}>
      {showHeader ? (
        <div className="mb-3 space-y-1">
          <h3 className="text-sm font-semibold text-foreground">{chart.title}</h3>
          <p className="text-sm text-muted-foreground">{chart.summary}</p>
        </div>
      ) : null}
      <ChartBody chart={chart} />
      {callouts}
    </div>
  );
}
