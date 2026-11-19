"use client";

import type { ReactNode } from "react";

import {
  SalesSourceProvider,
  type SalesSource,
} from "@/app/(app)/sales/_components/sales-source";
import {
  createScSaleAction,
  getScSaleDetailsAction,
  listScCentersForSalesAction,
  listScSaleableSerialsAction,
  listScStockSourcesForSalesAction,
  updateScSaleHeaderAction,
  updateScSaleSerialAction,
} from "@/features/service-center-ops/actions/sc-sales.actions";
import {
  listScProcessReturnLookupsAction,
  requestScServiceReturnAction,
} from "@/features/service-center-ops/actions/sc-service-returns.actions";

/** Service center sales: sold at a service center, stock from one of its locations. */
const SC_SALES_SOURCE: SalesSource = {
  listHref: "/service-centers/sales",
  newHref: "/service-centers/sales/new",
  proofHref: (saleId, index) =>
    `/api/service-centers/sales/${encodeURIComponent(saleId)}/proof?index=${index}`,
  copy: {
    encodeTitle: "New service center sale",
    encodeDescription:
      "Enter header details, add package line sets, then save to update service center stock.",
    backToList: "Back to service center sales",
    sectionDescription: "Service center, customer, payment, and proof for this sale.",
    soldLabel: "Service center sold",
    soldPlaceholder: "Select service center…",
    soldSearchPlaceholder: "Search service centers…",
    selectSoldError: "Select a service center",
    noSoldPlaces:
      "No service center in your area of responsibility. Assign an AOR before recording sales.",
    soldLocked: "Service center is locked because this sale already has real serials.",
    stockSourceLabel: "Location",
    stockSourcePlaceholder: "Select location…",
    stockSourceNeedsSold: "Select service center first…",
    stockSourceSearchPlaceholder: "Search locations…",
    stockSourceEmpty: "This service center has no locations.",
    selectStockSourceError: "Select a location",
    stockSourceLoadError: "Failed to load service center locations",
    soldColumn: "SERVICE CENTER",
    soldDetail: "Service center",
    stockSourceColumn: "LOCATION",
    stockSourceDetail: "Location",
  },
  actions: {
    getSaleDetails: (saleId) => getScSaleDetailsAction(saleId),
    createSale: ({ soldId, stockSourceId, ...rest }) =>
      createScSaleAction({
        ...rest,
        serviceCenterId: soldId,
        serviceCenterLocationId: stockSourceId,
      }),
    updateSaleHeader: ({ soldId, stockSourceId, ...rest }) =>
      updateScSaleHeaderAction({
        ...rest,
        serviceCenterId: soldId,
        serviceCenterLocationId: stockSourceId,
      }),
    updateSaleSerial: (input) => updateScSaleSerialAction(input),
    listSoldPlaces: () => listScCentersForSalesAction(),
    listStockSources: (soldId) => listScStockSourcesForSalesAction(soldId),
    listSaleableSerials: ({ stockSourceId, ...rest }) =>
      listScSaleableSerialsAction({ ...rest, serviceCenterLocationId: stockSourceId }),
  },
  processReturn: {
    listLookups: () => listScProcessReturnLookupsAction(),
    request: (saleId, payload) => requestScServiceReturnAction(saleId, payload),
    sellerFinishes: true,
    serviceNextStep:
      "The service center that sold the unit finishes the request in SC Returns and Replacement.",
  },
};

/** Wraps the shared sales form, table, and dialogs so they work on SC sales. */
export function ScSalesSourceProvider({ children }: { children: ReactNode }) {
  return <SalesSourceProvider source={SC_SALES_SOURCE}>{children}</SalesSourceProvider>;
}
