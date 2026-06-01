"use client";

import Link from "next/link";
import { ExternalLink, MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardModuleCardProps {
  title: string;
  href: string;
  modified: string;
  children: React.ReactNode;
}

export function DashboardModuleCard({
  title,
  href,
  modified,
  children,
}: DashboardModuleCardProps) {
  return (
    <div className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <Link href={href} className="block">
        <div className="h-32 overflow-hidden border-b bg-slate-50 p-2">{children}</div>
      </Link>
      <div className="flex items-start justify-between gap-2 p-3">
        <Link href={href} className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{title}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            Modified {modified}
          </p>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground"
            >
              <MoreVertical className="size-4" />
              <span className="sr-only">Open {title} menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={href}>
                <ExternalLink />
                Open
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
