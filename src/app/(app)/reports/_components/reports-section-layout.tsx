"use client";

import { usePathname } from "next/navigation";

import type { PageTutorialContent } from "@/components/page-tutorial/types";
import { SectionLayout } from "@/components/navigation/section-layout";
import { resolveRouteTitle } from "@/config/route-titles";
import { OFFICIAL_SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/official-sales";

function resolveReportsTutorial(
  pathname: string,
): PageTutorialContent | undefined {
  if (pathname.startsWith("/reports/official-sales")) {
    return OFFICIAL_SALES_PAGE_TUTORIAL;
  }
  return undefined;
}

function resolveReportsDescription(pathname: string): string {
  if (pathname.startsWith("/reports/official-sales")) {
    return "Upload dealer DR files to a staging table, then process SALE (STK→SLD) or RETURN (SLD/RSV→STK) per serial.";
  }
  if (pathname.startsWith("/reports/sales")) {
    return "Branch sales with serial numbers and ATR/return status.";
  }
  if (pathname.startsWith("/reports/processed-orders")) {
    return "CSV export of approved order lines (SO#, approved qty, SPA remarks, CBM).";
  }
  if (pathname.startsWith("/reports/transfers")) {
    return "Branch transfers — number, branches, status, date.";
  }
  if (pathname.startsWith("/reports/daily-stock")) {
    return "Planogram SKUs with inventory status counts for a single day.";
  }
  if (pathname.startsWith("/reports/pcount")) {
    return "Closed physical stock counts (P-Count) by branch and date — line counts, variances, and links to session detail.";
  }
  if (pathname.startsWith("/reports/inventory")) {
    return "Inventory stock units by branch, status, and serial number details.";
  }
  if (pathname.startsWith("/reports/aging")) {
    return "Inventory aging by branch, stock age buckets, and serial number details.";
  }
  if (pathname.startsWith("/reports/dii")) {
    return "Days in inventory (DII) by branch, stock age, and serial number details.";
  }
  if (pathname.startsWith("/reports/pull-outs")) {
    return "Branch pull-outs from branch to warehouse with status and reason details.";
  }
  if (pathname.startsWith("/reports/branch-returns")) {
    return "Branch return and replacement requests with status and service details.";
  }
  if (pathname.startsWith("/reports/service-returns")) {
    return "Service return and replacement requests with status and service center details.";
  }
  if (pathname.startsWith("/reports/variance-discrepancy")) {
    return "Stock count variances and discrepancies by branch, type, and status.";
  }
  if (pathname.startsWith("/reports/consolidated-discrepancy")) {
    return "Consolidated stock discrepancies across branches, sessions, and variance types.";
  }
  return "CSV exports aligned with BRS / xlsx report sheets.";
}

export function ReportsSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const title = resolveRouteTitle(pathname) ?? "Reports";

  return (
    <SectionLayout
      title={title}
      description={resolveReportsDescription(pathname)}
      tutorial={resolveReportsTutorial(pathname)}
    >
      {children}
    </SectionLayout>
  );
}
