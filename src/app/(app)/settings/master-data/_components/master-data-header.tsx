"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PageHeader } from "@/app/(app)/_components/page-header";
import {
  MASTER_DATA_ROOT,
  MASTER_DATA_TAB_GROUPS,
} from "@/config/section-tabs";

function findActiveItem(pathname: string) {
  for (const group of MASTER_DATA_TAB_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return { ...item, group: group.label };
      }
    }
  }
  return null;
}

const HUB_DESCRIPTION =
  "Product, geography, sales, service, and operations lookup tables for orders, planograms, and branch workflows.";

/**
 * Header for the master-data section. Renders the hub title on the landing
 * route and a breadcrumb + submodule title on each lookup page — so the layout
 * stays shared without every submodule page needing its own header.
 */
export function MasterDataHeader() {
  const pathname = usePathname();
  const active = findActiveItem(pathname);

  if (!active) {
    return (
      <PageHeader title="Master data" description={HUB_DESCRIPTION} sticky={false} />
    );
  }

  return (
    <div className="space-y-3">
      <Link
        href={MASTER_DATA_ROOT}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        <span>Master data</span>
        <span aria-hidden className="text-muted-foreground/50">
          /
        </span>
        <span className="text-foreground">{active.group}</span>
      </Link>
      <PageHeader title={active.label} sticky={false} />
    </div>
  );
}
