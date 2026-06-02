"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  HELP_QUICK_LINKS,
  HELP_QUICK_LINK_GROUP_LABELS,
  type HelpQuickLinkGroup,
} from "@/content/help-support";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/utils/cn";

const GROUP_ORDER: HelpQuickLinkGroup[] = ["daily", "inventory", "logistics"];

export function HelpQuickActionsSidebar() {
  return (
    <div className="lg:sticky lg:top-20 lg:z-10 lg:self-start">
      <aside id="quick-actions" className="scroll-mt-24">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick actions</CardTitle>
            <CardDescription>Most-used modules for daily work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {GROUP_ORDER.map((group) => {
              const links = HELP_QUICK_LINKS.filter((item) => item.group === group);
              if (links.length === 0) return null;

              return (
                <div key={group} className="space-y-1">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {HELP_QUICK_LINK_GROUP_LABELS[group]}
                  </p>
                  <ul className="space-y-0.5">
                    {links.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className={cn(
                            "group flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                          )}
                        >
                          <span className="min-w-0 flex-1 font-medium leading-snug">
                            {item.title}
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-accent-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
