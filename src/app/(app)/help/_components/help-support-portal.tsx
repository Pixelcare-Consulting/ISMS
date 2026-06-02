"use client";

import Link from "next/link";
import { LifeBuoy, Mail, Sparkles } from "lucide-react";

import { HELP_FAQ_CATEGORIES } from "@/content/help-support";
import { HelpQuickActionsSidebar } from "@/app/(app)/help/_components/help-quick-actions-sidebar";
import { HelpWorkflowGuides } from "@/app/(app)/help/_components/help-workflow-guides";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WhatsNewDialog } from "@/components/whats-new-dialog";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

export function HelpSupportPortal() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="space-y-2">
          <Badge variant="secondary" className="w-fit">
            Support portal
          </Badge>
          <CardTitle className="flex items-center gap-2 text-xl">
            <LifeBuoy className="size-5 text-primary" />
            How to use ISMS
          </CardTitle>
          <CardDescription className="max-w-3xl">
            Read workflow guides for step-by-step processes. Use quick actions on
            the right to open the modules you use most.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] lg:items-start">
        <div className="min-w-0 space-y-8">
          <HelpWorkflowGuides />

          <section id="faq" className="scroll-mt-24 space-y-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">FAQ</h2>
              <p className="text-sm text-muted-foreground">
                Common questions by topic. Expand a category for answers.
              </p>
            </div>
            <Card className="bg-card">
              <CardContent className="pt-6">
                <Accordion type="single" collapsible className="w-full space-y-2">
                  {HELP_FAQ_CATEGORIES.map((category) => (
                    <AccordionItem
                      key={category.id}
                      value={category.id}
                      className="rounded-lg border px-4"
                    >
                      <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                        {category.title}
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-1">
                          {category.items.map((faq) => (
                            <div key={faq.id} className="space-y-1">
                              <p className="text-sm font-medium text-foreground">
                                {faq.question}
                              </p>
                              <p className="text-sm text-muted-foreground">{faq.answer}</p>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </section>

          <section id="contact" className="scroll-mt-24 space-y-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Contact & escalation
              </h2>
              <p className="text-sm text-muted-foreground">
                Start with your tenant admin for access, roles, and process questions.
              </p>
            </div>
            <Card className="bg-card">
              <CardContent className="space-y-3 pt-6">
                {SUPPORT_EMAIL ? (
                  <Button asChild className="w-full justify-start gap-2 sm:w-auto">
                    <a href={`mailto:${SUPPORT_EMAIL}`}>
                      <Mail className="size-4" />
                      Email support: {SUPPORT_EMAIL}
                    </a>
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No support email is configured. Contact your tenant admin for
                    assistance.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href="/settings/profile">Profile settings</Link>
                  </Button>
                  <WhatsNewDialog
                    trigger={
                      <Button type="button" variant="outline">
                        <Sparkles className="size-4" />
                        What&apos;s New
                      </Button>
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </section>
        </div>

        <HelpQuickActionsSidebar />
      </div>
    </div>
  );
}
