"use client";

import { usePathname } from "next/navigation";

import type { PageTutorialContent } from "@/components/page-tutorial/types";
import { SectionLayout } from "@/components/navigation/section-layout";
import { resolveRouteTitle } from "@/config/route-titles";
import { INVENTORY_PAGE_TUTORIAL } from "@/content/page-tutorials/inventory";
import { STOCK_COUNT_PAGE_TUTORIAL } from "@/content/page-tutorials/stock-count";

function resolveInventoryTutorial(pathname: string): PageTutorialContent {
  if (pathname.startsWith("/inventory/stock-count")) {
    return STOCK_COUNT_PAGE_TUTORIAL;
  }
  return INVENTORY_PAGE_TUTORIAL;
}

function resolveInventoryDescription(pathname: string): string {
  if (pathname.startsWith("/inventory/stock-count")) {
    return "Physical count sessions (P-Count) to align shelf and system stock.";
  }
  if (pathname.startsWith("/inventory/serial-numbers")) {
    return "Serial master records and activity for your area of responsibility.";
  }
  return "Serialized units by branch. Series summary mirrors the INVENTORY Excel mock (QTY × SRP).";
}

export function InventorySectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const tutorial = resolveInventoryTutorial(pathname);
  const title = resolveRouteTitle(pathname) ?? "Inventory";

  return (
    <SectionLayout
      title={title}
      description={resolveInventoryDescription(pathname)}
      tutorial={tutorial}
    >
      {children}
    </SectionLayout>
  );
}
