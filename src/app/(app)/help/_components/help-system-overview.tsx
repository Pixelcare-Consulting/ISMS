"use client";

import { useState } from "react";
import { GitBranch } from "lucide-react";

import {
  WORKFLOW_MASTER_OVERVIEW,
  WORKFLOW_SWIMLANE_CHARTS,
} from "@/content/workflow-flowcharts";
import { WorkflowFlowchart } from "@/app/(app)/help/_components/workflow-flowchart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/utils/cn";

const DEFAULT_FLOW_ID = WORKFLOW_SWIMLANE_CHARTS[0]?.id ?? "setup";

function processLabel(chart: (typeof WORKFLOW_SWIMLANE_CHARTS)[number]) {
  return chart.tabLabel ?? chart.title;
}

export function HelpSystemOverview() {
  const [activeFlow, setActiveFlow] = useState(DEFAULT_FLOW_ID);
  const activeChart =
    WORKFLOW_SWIMLANE_CHARTS.find((chart) => chart.id === activeFlow) ??
    WORKFLOW_SWIMLANE_CHARTS[0];

  return (
    <section id="how-isms-works" className="scroll-mt-24 space-y-6">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <GitBranch className="size-4 text-primary" />
          How ISMS Portal works
        </h2>
        <p className="text-sm text-muted-foreground">
          End-to-end path from setup to stock, sales, and reporting — then open a
          flow below to see who acts at each step.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-none sm:p-5">
        <WorkflowFlowchart
          chart={WORKFLOW_MASTER_OVERVIEW}
          showHeader={false}
          showCallouts={false}
        />
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Flow by role</h3>
          <p className="text-sm text-muted-foreground">
            Pick a process to see each role&apos;s steps in order.
          </p>
        </div>

        {/* Mobile: select + panel */}
        <div className="md:hidden">
          <Select value={activeFlow} onValueChange={setActiveFlow}>
            <SelectTrigger className="w-full border border-border bg-card shadow-none">
              <SelectValue placeholder="Choose a process" />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_SWIMLANE_CHARTS.map((chart) => (
                <SelectItem key={chart.id} value={chart.id}>
                  {chart.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeChart ? (
            <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium text-foreground">
                {activeChart.title}
              </p>
              <p className="text-sm text-muted-foreground">{activeChart.summary}</p>
              <WorkflowFlowchart chart={activeChart} showHeader={false} />
            </div>
          ) : null}
        </div>

        {/* Desktop: single-row segmented control + panel (no wrapping chips) */}
        <div className="hidden md:block">
          <Tabs
            value={activeFlow}
            onValueChange={setActiveFlow}
            className="w-full gap-0"
          >
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-none">
              <div
                className={cn(
                  "border-b border-border bg-muted",
                  "overflow-x-auto overscroll-x-contain scrollbar-none",
                )}
              >
                <TabsList
                  variant="default"
                  className="inline-flex h-auto w-max min-w-full justify-start gap-1.5 rounded-none bg-transparent p-1.5"
                >
                  {WORKFLOW_SWIMLANE_CHARTS.map((chart) => (
                    <TabsTrigger
                      key={chart.id}
                      value={chart.id}
                      title={chart.title}
                      className={cn(
                        "h-8 shrink-0 flex-none cursor-pointer rounded-md border px-3 text-xs font-medium shadow-none",
                        "data-[state=inactive]:border-border data-[state=inactive]:bg-card data-[state=inactive]:text-foreground",
                        "data-[state=inactive]:hover:border-primary/50 data-[state=inactive]:hover:bg-card",
                        "data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                        "data-[state=active]:hover:bg-primary data-[state=active]:hover:text-primary-foreground",
                        "after:hidden",
                      )}
                    >
                      {processLabel(chart)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {WORKFLOW_SWIMLANE_CHARTS.map((chart) => (
                <TabsContent
                  key={chart.id}
                  value={chart.id}
                  className="mt-0 space-y-3 p-4 sm:p-5"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {chart.title}
                    </p>
                    <p className="text-sm text-muted-foreground">{chart.summary}</p>
                  </div>
                  <WorkflowFlowchart chart={chart} showHeader={false} />
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </div>
      </div>
    </section>
  );
}
