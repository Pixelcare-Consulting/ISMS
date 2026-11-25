"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { SaleDetailsPayload } from "@/app/(app)/sales/_components/sale-details-dialog";
import {
  countAgingSellableStockAction,
  createSaleAction,
  getSaleDetailsAction,
  listBranchesForSalesAction,
  listProcessReturnLookupsAction,
  requestReturnAction,
  listSaleableSerialsAction,
  listStockSourceBranchesForSalesAction,
  updateSaleHeaderAction,
  updateSaleSerialAction,
  type AgingSellableSerial,
} from "@/features/sales/actions/sales.actions";
import type { SaleableSerialItem } from "@/features/sales/lib/saleable-serial-query";
import type {
  ProcessReturnLookups,
  ProcessReturnPayload,
} from "@/features/sales/services/process-return-input";
import { saleProofViewUrl } from "@/features/sales/utils/sale-proof";
import type { SalesPageTab } from "@/features/sales/utils/sales-page-href";
import type { PaginatedResult } from "@/lib/shared/pagination";

/**
 * Where a sale list's rows come from. Branch Sales Transactions and the Service Center tab use
 * the same table and details dialog; a source supplies their server actions, links, and the
 * words for "sold place" and "stock source". Only branch sales can be encoded or edited
 * (`edit`). Both offer Process Return (`processReturn`): on the Service Center tab it is for
 * open SC sales, finished by the service center that holds them.
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
  /** Branch sold. */
  soldId: string;
  /** Branch or alternate branch. */
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

/** Table column and details row labels. */
export interface SalesListCopy {
  /** Table column and details row for the sold place. */
  soldColumn: string;
  soldDetail: string;
  /** Table column and details row for the stock source. */
  stockSourceColumn: string;
  stockSourceDetail: string;
}

/** Encode form and edit dialog labels. */
export interface SalesEncodeCopy {
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
}

export interface SalesEditActions {
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
}

/** Process Return form on a sale line. */
export interface SalesProcessReturnSource {
  listLookups: () => Promise<ProcessReturnLookups>;
  request: (saleId: string, payload: ProcessReturnPayload) => Promise<ActionResult>;
  /**
   * True on SC sales: the unit is already at the service center that finishes the request, so
   * only Service Return / Replacement apply and there is no service center picker.
   */
  sellerFinishes?: boolean;
}

export interface SalesSource {
  /** List page; the encode form returns here. */
  listHref: string;
  /** Sales Transactions tab of this list. Omitted: the branch tab. */
  listTab?: SalesPageTab;
  /** Builds the authenticated preview URL for proof `index` of a sale. */
  proofHref: (saleId: string, index: number) => string;
  copy: SalesListCopy;
  getSaleDetails: (saleId: string) => Promise<SaleDetailsPayload | { error: string }>;
  /** Encode and edit. Omitted: no sale can be encoded or edited. */
  edit?: {
    newHref: string;
    copy: SalesEncodeCopy;
    actions: SalesEditActions;
  };
  /** Process Return on a sale line. Omitted: no returns from this list. */
  processReturn?: SalesProcessReturnSource;
}

/** What the encode form and the edit / return dialogs read. */
export interface SalesEditSource {
  listHref: string;
  newHref: string;
  copy: SalesListCopy & SalesEncodeCopy;
  actions: SalesEditActions;
}

export const BRANCH_SALES_SOURCE: SalesSource = {
  listHref: "/sales",
  proofHref: saleProofViewUrl,
  copy: {
    soldColumn: "BRANCH",
    soldDetail: "Branch",
    stockSourceColumn: "ALTERNATE BRANCH",
    stockSourceDetail: "Stock source",
  },
  getSaleDetails: (saleId) => getSaleDetailsAction(saleId),
  edit: {
    newHref: "/sales/new",
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
    },
    actions: {
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
  },
  processReturn: {
    listLookups: () => listProcessReturnLookupsAction(),
    request: (saleId, payload) => requestReturnAction(saleId, payload),
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

/**
 * Encode and edit actions of the surrounding source. Those forms and dialogs open only behind
 * create / update capabilities, which read-only sources never grant.
 */
export function useSalesEditSource(): SalesEditSource {
  const source = useSalesSource();
  const { edit } = source;
  if (!edit) throw new Error("This sales list is read only");
  return {
    listHref: source.listHref,
    newHref: edit.newHref,
    copy: { ...source.copy, ...edit.copy },
    actions: edit.actions,
  };
}

/** Process Return of the surrounding source; the dialog opens only behind `canRequestReturn`. */
export function useSalesProcessReturn(): SalesProcessReturnSource {
  const { processReturn } = useSalesSource();
  if (!processReturn) throw new Error("This sales list takes no returns");
  return processReturn;
}
