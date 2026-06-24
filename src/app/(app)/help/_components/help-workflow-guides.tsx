"use client";

import Link from "next/link";
import { Route } from "lucide-react";

import { HELP_WORKFLOW_GUIDES } from "@/content/help-support";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function HelpWorkflowGuides() {
  return (
    <section id="workflows" className="scroll-mt-24 space-y-3">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Route className="size-4 text-primary" />
          Workflow guides
        </h2>
        <p className="text-sm text-muted-foreground">
          Step-by-step paths across modules. Expand a guide for the full sequence and
          open the related screen when you are ready.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">End-to-end processes</CardTitle>
          <CardDescription>
            {HELP_WORKFLOW_GUIDES.length} guides covering navigation, operations,
            logistics, compliance, and admin setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {HELP_WORKFLOW_GUIDES.map((workflow) => (
              <AccordionItem key={workflow.id} value={workflow.id} className="border-b px-1">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex flex-1 flex-col items-start gap-2 pr-4 text-left sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-semibold">{workflow.title}</span>
                    <Badge variant="secondary" className="font-normal">
                      {workflow.audience}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-4">
                  <p className="text-sm text-muted-foreground">{workflow.summary}</p>
                  <ol className="space-y-2">
                    {workflow.steps.map((step, index) => (
                      <li
                        key={`${workflow.id}-step-${index + 1}`}
                        className="flex items-start gap-3 text-sm text-muted-foreground"
                      >
                        <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                          {index + 1}
                        </span>
                        <span className="pt-0.5">{step.label}</span>
                      </li>
                    ))}
                  </ol>
                  {workflow.tips && workflow.tips.length > 0 ? (
                    <div className="rounded-lg border border-dashed bg-muted/40 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Tips
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                        {workflow.tips.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <Button asChild size="sm">
                    <Link href={workflow.href}>Go to module</Link>
                  </Button>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </section>
  );
}
