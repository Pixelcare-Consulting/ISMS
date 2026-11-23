"use client";

import type { ReactNode } from "react";

import {
  SalesSourceProvider,
  type SalesSource,
} from "@/app/(app)/sales/_components/sales-source";
import { getScSaleDetailsAction } from "@/features/service-center-ops/actions/sc-sales.actions";

/**
 * Sales Transactions → Service Center tab: copies of branch sales whose Service Return /
 * Replacement went to a service center. Read only, so no `edit`.
 */
const SC_SALES_SOURCE: SalesSource = {
  listHref: "/sales",
  listTab: "service-center",
  proofHref: (saleId, index) =>
    `/api/service-centers/sales/${encodeURIComponent(saleId)}/proof?index=${index}`,
  copy: {
    soldColumn: "SERVICE CENTER",
    soldDetail: "Service center",
    stockSourceColumn: "LOCATION",
    stockSourceDetail: "Location",
  },
  getSaleDetails: (saleId) => getScSaleDetailsAction(saleId),
};

/** Wraps the shared sales table and details dialog so they read SC sales. */
export function ScSalesSourceProvider({ children }: { children: ReactNode }) {
  return <SalesSourceProvider source={SC_SALES_SOURCE}>{children}</SalesSourceProvider>;
}
