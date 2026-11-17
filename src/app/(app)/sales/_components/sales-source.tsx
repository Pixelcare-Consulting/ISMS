"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { SaleDetailsPayload } from "@/app/(app)/sales/_components/sale-details-dialog";
import {
  countAgingSellableStockAction,
  createSaleAction,
  getSaleDetailsAction,
  listBranchesForSalesAction,
  listSaleableSerialsAction,
  listStockSourceBranchesForSalesAction,
  updateSaleHeaderAction,
  updateSaleSerialAction,
  type AgingSellableSerial,
} from "@/features/sales/actions/sales.actions";
import type { SaleableSerialItem } from "@/features/sales/lib/saleable-serial-query";
import { saleProofViewUrl } from "@/features/sales/utils/sale-proof";
import type { PaginatedResult } from "@/lib/shared/pagination";

/**
 * Where a sale's stock comes from. Branch Sales Transactions and service center sales use
 * the same encode form, table, and dialogs; a source supplies their server actions, links,
 * and the words for "sold place" and "stock source".
 */

type ActionResult = { error?: string; success?: boolean };

export interface SaleEncodeHeaderInput {
  transactionNo: string;
  customerName: string;
  contactNo?: string;
  siTrans?: string;
  paymentTypeId: string;
  saleTypeId: string;
  customerDeliveryMethodId: string;
  infoSlipVsoRrReleased?: string;
  rrReceiveDeliver?: string;
  proof?: string[];
  transactionDate?: string;
  reserved: boolean;
  /** Branch sold, or service center sold. */
  soldId: string;
  /** Branch or alternate branch, or service center location. */
  stockSourceId: string;
}

export interface SaleEncodeDetailInput {
  packageTypeId: string;
  brandId: string;
  promoTypeId?: string;
  modelId: string;
  serialNumberId: string;
  saleAmount: number;
  modelPrice?: number;
  deliveryNo?: string;
  deliveryDate?: string;
}

export interface SaleSerialEditInput {
  saleId: string;
  /** Omitted: the sale's first line. */
  detailId?: string;
  serialNumberId: string;
  deliveryNo?: string;
  deliveryDate?: string;
}

export interface SalesSourceOption {
  id: string;
  name: string;
}

export interface SalesSource {
  /** List page; the encode form returns here. */
  listHref: string;
  newHref: string;
  /** Builds the authenticated preview URL for proof `index` of a sale. */
  proofHref: (saleId: string, index: number) => string;
  copy: {
    encodeTitle: string;
    encodeDescription: string;
    backToList: string;
    sectionDescription: string;
    soldLabel: string;
    soldPlaceholder: string;
    soldSearchPlaceholder: string;
    selectSoldError: string;
    noSoldPlaces: string;
    soldLocked: string;
    stockSourceLabel: string;
    stockSourcePlaceholder: string;
    stockSourceNeedsSold: string;
    stockSourceSearchPlaceholder: string;
    stockSourceEmpty: string;
    selectStockSourceError: string;
    stockSourceLoadError: string;
    /** Table column and details row for the sold place. */
    soldColumn: string;
    soldDetail: string;
    /** Table column and details row for the stock source. */
    stockSourceColumn: string;
    stockSourceDetail: string;
  };
  actions: {
    getSaleDetails: (saleId: string) => Promise<SaleDetailsPayload | { error: string }>;
    createSale: (
      input: SaleEncodeHeaderInput & { details: SaleEncodeDetailInput[] },
    ) => Promise<ActionResult>;
    updateSaleHeader: (
      input: SaleEncodeHeaderInput & { saleId: string; proof: string[] },
    ) => Promise<ActionResult>;
    updateSaleSerial: (input: SaleSerialEditInput) => Promise<ActionResult>;
    listSoldPlaces: () => Promise<SalesSourceOption[]>;
    listStockSources: (soldId: string) => Promise<SalesSourceOption[]>;
    listSaleableSerials: (input: {
      stockSourceId: string;
      modelId: string;
      search?: string;
      page: number;
      limit: number;
    }) => Promise<PaginatedResult<SaleableSerialItem>>;
    /** Aged sellable units of a model at the stock source. Omitted: no aging check. */
    countAgingSellableStock?: (input: {
      stockSourceId: string;
      modelId: string;
    }) => Promise<{ count: number; serials: AgingSellableSerial[] }>;
  };
}

export const BRANCH_SALES_SOURCE: SalesSource = {
  listHref: "/sales",
  newHref: "/sales/new",
  proofHref: saleProofViewUrl,
  copy: {
    encodeTitle: "New sales transaction",
    encodeDescription: "Enter header details, add package line sets, then save to update stock.",
    backToList: "Back to sales",
    sectionDescription: "Branch, customer, payment, and proof for this sale.",
    soldLabel: "Branch sold",
    soldPlaceholder: "Select branch…",
    soldSearchPlaceholder: "Search branches…",
    selectSoldError: "Select a branch",
    noSoldPlaces: "No branch in your area of responsibility. Assign an AOR before recording sales.",
    soldLocked: "Branch is locked because this sale already has real serials.",
    stockSourceLabel: "Branch or alternate branch",
    stockSourcePlaceholder: "Select branch with stock…",
    stockSourceNeedsSold: "Select branch sold first…",
    stockSourceSearchPlaceholder: "Search branches with stock…",
    stockSourceEmpty: "No sellable stock in your area.",
    selectStockSourceError: "Select a stock source branch",
    stockSourceLoadError: "Failed to load stock source branches",
    soldColumn: "BRANCH",
    soldDetail: "Branch",
    stockSourceColumn: "ALTERNATE BRANCH",
    stockSourceDetail: "Stock source",
  },
  actions: {
    getSaleDetails: (saleId) => getSaleDetailsAction(saleId),
    createSale: ({ soldId, stockSourceId, ...rest }) =>
      createSaleAction({ ...rest, branchId: soldId, alternateBranchId: stockSourceId }),
    updateSaleHeader: ({ soldId, stockSourceId, ...rest }) =>
      updateSaleHeaderAction({ ...rest, branchId: soldId, alternateBranchId: stockSourceId }),
    updateSaleSerial: (input) => updateSaleSerialAction(input),
    listSoldPlaces: () => listBranchesForSalesAction(),
    listStockSources: (soldId) => listStockSourceBranchesForSalesAction(soldId),
    listSaleableSerials: ({ stockSourceId, ...rest }) =>
      listSaleableSerialsAction({ ...rest, branchId: stockSourceId }),
    countAgingSellableStock: ({ stockSourceId, modelId }) =>
      countAgingSellableStockAction({ branchId: stockSourceId, modelId }),
  },
};

const SalesSourceContext = createContext<SalesSource>(BRANCH_SALES_SOURCE);

export function SalesSourceProvider({
  source,
  children,
}: {
  source: SalesSource;
  children: ReactNode;
}) {
  return <SalesSourceContext.Provider value={source}>{children}</SalesSourceContext.Provider>;
}

/** The sale stock source for the surrounding page. Branch sales when no provider is set. */
export function useSalesSource(): SalesSource {
  return useContext(SalesSourceContext);
}
