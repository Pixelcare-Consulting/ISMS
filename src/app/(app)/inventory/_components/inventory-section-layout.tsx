"use client";

import { usePathname } from "next/navigation";

import type { PageTutorialContent } from "@/components/page-tutorial/types";
import { SectionLayout } from "@/components/navigation/section-layout";
import { INVENTORY_PAGE_TUTORIAL } from "@/content/page-tutorials/inventory";
import { STOCK_COUNT_PAGE_TUTORIAL } from "@/content/page-tutorials/stock-count";

function resolveInventoryTutorial(pathname: string): PageTutorialContent {
  if (pathname.startsWith("/inventory/stock-count")) {
    return STOCK_COUNT_PAGE_TUTORIAL;
  }
  return INVENTORY_PAGE_TUTORIAL;
}

export function InventorySectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const tutorial = resolveInventoryTutorial(pathname);
  const isStockCount = pathname.startsWith("/inventory/stock-count");

  return (
    <SectionLayout
      title="Inventory"
      description={
        isStockCount
          ? "Physical count sessions (P-Count) to align shelf and system stock."
          : "Serialized branch stock and physical count sessions."
      }
      tutorial={tutorial}
    >
      {children}
    </SectionLayout>
  );
}
