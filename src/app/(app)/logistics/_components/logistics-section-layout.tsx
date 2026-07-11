"use client";

import { usePathname } from "next/navigation";

import type { PageTutorialContent } from "@/components/page-tutorial/types";
import { SectionLayout } from "@/components/navigation/section-layout";
import { DELIVERIES_PAGE_TUTORIAL } from "@/content/page-tutorials/deliveries";
import { PULLOUTS_PAGE_TUTORIAL } from "@/content/page-tutorials/pullouts";
import { TRANSFERS_PAGE_TUTORIAL } from "@/content/page-tutorials/transfers";

function resolveLogisticsTutorial(pathname: string): PageTutorialContent {
  if (pathname.startsWith("/logistics/transfers")) {
    return TRANSFERS_PAGE_TUTORIAL;
  }
  if (pathname.startsWith("/logistics/pickups")) {
    return PULLOUTS_PAGE_TUTORIAL;
  }
  return DELIVERIES_PAGE_TUTORIAL;
}

function resolveLogisticsDescription(pathname: string): string {
  if (pathname.startsWith("/logistics/transfers")) {
    return "Inter-branch transfers of serialized stock.";
  }
  if (pathname.startsWith("/logistics/pickups")) {
    return "Pull-outs from branch back through logistics to warehouse.";
  }
  return "Deliveries from approved orders, branch transfers, and pull-outs.";
}

export function LogisticsSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <SectionLayout
      title="Logistics"
      description={resolveLogisticsDescription(pathname)}
      tutorial={resolveLogisticsTutorial(pathname)}
    >
      {children}
    </SectionLayout>
  );
}
