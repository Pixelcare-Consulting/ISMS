"use client";

import type { ReactNode } from "react";

import {
  SalesSourceProvider,
  type SalesSource,
} from "@/app/(app)/sales/_components/sales-source";
import { getScSaleDetailsAction } from "@/features/service-center-ops/actions/sc-sales.actions";
import {
  listScProcessReturnLookupsAction,
  requestScSaleReturnAction,
} from "@/features/service-center-ops/actions/sc-service-returns.actions";

/**
 * Sales Transactions → Service Center tab: copies of branch sales whose Service Return /
 * Replacement went to a service center, and the sales a replacement creates for the new unit.
 * No `edit`; an open sale takes a Service Return / Replacement that its service center finishes.
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
  processReturn: {
    listLookups: () => listScProcessReturnLookupsAction(),
    request: (saleId, payload) => requestScSaleReturnAction(saleId, payload),
    sellerFinishes: true,
  },
};

/** Wraps the shared sales table and details dialog so they read SC sales. */
export function ScSalesSourceProvider({ children }: { children: ReactNode }) {
  return <SalesSourceProvider source={SC_SALES_SOURCE}>{children}</SalesSourceProvider>;
}
