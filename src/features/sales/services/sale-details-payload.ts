import { returnHistoryStatusRef } from "@/features/sales/constants/return-history-status";
import { TO_FOLLOW_SERIAL_LABEL } from "@/features/sales/constants/to-follow-serial";
import { isSaleReserved, toDateInputValue } from "@/features/sales/services/sale-encode";
import {
  replacementPairFromSerials,
  type ReplacementPairLabels,
  type ReplacementSerialModel,
} from "@/features/sales/utils/replacement-unit-label";
import {
  loadSalesAtrCodesByCode,
  resolveListedLineStatus,
  resolveSalesAtrStatusCode,
  resolveToFollowStatusCode,
} from "@/features/sales/utils/resolve-line-status";
import { parseSaleProofPaths } from "@/features/sales/utils/sale-proof";

interface MoneyLike {
  toString(): string;
}

interface PlaceRef {
  id: string;
  name: string;
}

/**
 * A sale header with its lines, from any stock source. `branch` is the sold place
 * (branch or service center); `stockSourceBranch` is the stock source (alternate branch
 * or SC location).
 */
export interface SaleDetailsSource {
  id: string;
  branchId: string;
  alternateBranchId: string | null;
  paymentTypeId: string | null;
  saleTypeId: string | null;
  customerDeliveryMethodId: string | null;
  transactionNo: string;
  transactionDate: Date | null;
  customerName: string | null;
  contactNo: string | null;
  siTrans: string | null;
  infoSlipVsoRrReleased: string | null;
  rrReceiveDeliver: string | null;
  atrStatus: string;
  notes: string | null;
  proof: unknown;
  amount: MoneyLike;
  branch: PlaceRef;
  stockSourceBranch: PlaceRef | null;
  paymentType: PlaceRef | null;
  saleType: PlaceRef | null;
  customerDeliveryMethod: PlaceRef | null;
  returnRequest: {
    id: string;
    status: string;
    saleDetailId: string | null;
    actionType?: "return" | "replacement" | null;
    stockStatusCode?: "STK" | "DEF" | null;
    atrOdrfPdfPath?: string | null;
    documentType: { name: string } | null;
  } | null;
  /** Original and new serials: SalesReplacement rows on branch sales, the SC request on SC copies. */
  replacements?: Array<{
    originalSerialNumber: {
      serialNo: string;
      model: ReplacementSerialModel | null;
    } | null;
    replacementSerialNumber: {
      serialNo: string;
      model: ReplacementSerialModel | null;
    } | null;
  }>;
  createdBy: { name: string | null; email: string } | null;
  details: Array<{
    id: string;
    serialNumberId: string | null;
    modelId: string | null;
    saleAmount: MoneyLike | null;
    amount: MoneyLike | null;
    modelPrice: MoneyLike | null;
    deliveryNo: string | null;
    deliveryDate: Date | null;
    statusCode: { code: string; name: string; color: string | null } | null;
    packageType: { name: string } | null;
    brand: { name: string } | null;
    model: { id: string; skuCode: string; name: string } | null;
    serialNumber: { id: string; serialNo: string } | null;
  }>;
}

/** The View details payload the sales table and its dialogs read. */
export async function toSaleDetailsPayload(tenantId: string, sale: SaleDetailsSource) {
  const [toFollowStatus, salesAtrCodes] = await Promise.all([
    resolveToFollowStatusCode(tenantId),
    loadSalesAtrCodesByCode(tenantId),
  ]);

  const proofPaths = parseSaleProofPaths(sale.proof);
  const request = sale.returnRequest;
  const returnStatusCode = request
    ? (returnHistoryStatusRef(
        request.status,
        request.documentType?.name,
        request.actionType,
      ) ?? resolveSalesAtrStatusCode(request.status, salesAtrCodes))
    : null;

  return {
    id: sale.id,
    transactionNo: sale.transactionNo,
    transactionDate: sale.transactionDate ? sale.transactionDate.toISOString() : null,
    /** YYYY-MM-DD for header edit date input. */
    transactionDateInput: toDateInputValue(sale.transactionDate),
    customerName: sale.customerName,
    contactNo: sale.contactNo,
    siTrans: sale.siTrans,
    infoSlipVsoRrReleased: sale.infoSlipVsoRrReleased,
    rrReceiveDeliver: sale.rrReceiveDeliver,
    atrStatus: sale.atrStatus,
    atrStatusCode: resolveSalesAtrStatusCode(sale.atrStatus, salesAtrCodes),
    notes: sale.notes,
    proofPaths,
    proofCount: proofPaths.length,
    amount: sale.amount.toString(),
    reserved: isSaleReserved(sale.details),
    /** Stock source used when editing serials (matches list row branchId). */
    stockBranchId: sale.stockSourceBranch?.id ?? sale.branch.id,
    branchId: sale.branchId,
    alternateBranchId: sale.alternateBranchId ?? sale.branchId,
    paymentTypeId: sale.paymentTypeId,
    saleTypeId: sale.saleTypeId,
    customerDeliveryMethodId: sale.customerDeliveryMethodId,
    branch: sale.branch,
    stockSourceBranch: sale.stockSourceBranch,
    paymentType: sale.paymentType,
    saleType: sale.saleType,
    customerDeliveryMethod: sale.customerDeliveryMethod,
    returnRequest: request
      ? {
          id: request.id,
          status: request.status,
          saleDetailId: request.saleDetailId,
          actionType: request.actionType ?? "return",
          stockStatusCode: request.stockStatusCode ?? "STK",
          hasAtrOdrfPdf: Boolean(request.atrOdrfPdfPath),
          documentTypeName: request.documentType?.name ?? null,
        }
      : null,
    replacements: replacementPairs(sale),
    returnStatusCode,
    createdByName: sale.createdBy?.name ?? sale.createdBy?.email ?? null,
    lines: sale.details.map((detail) => {
      const lineAmount = detail.saleAmount ?? detail.amount;
      return {
        detailId: detail.id,
        packageName: detail.packageType?.name ?? null,
        brandName: detail.brand?.name ?? null,
        modelId: detail.modelId ?? detail.model?.id ?? null,
        modelLabel: detail.model
          ? detail.model.skuCode?.trim() || detail.model.name?.trim() || null
          : null,
        serialNumberId: detail.serialNumberId,
        serialNo: detail.serialNumber?.serialNo ?? TO_FOLLOW_SERIAL_LABEL,
        saleAmount: (lineAmount ?? 0).toString(),
        modelPrice: detail.modelPrice != null ? detail.modelPrice.toString() : null,
        deliveryNo: detail.deliveryNo,
        // YYYY-MM-DD so <input type="date"> round-trips without timezone drift.
        deliveryDate: toDateInputValue(detail.deliveryDate),
        statusCode: resolveListedLineStatus(detail, sale, toFollowStatus, salesAtrCodes),
      };
    }),
  };
}

function replacementPairs(sale: SaleDetailsSource): ReplacementPairLabels[] {
  const pairs: ReplacementPairLabels[] = [];
  for (const row of sale.replacements ?? []) {
    const pair = replacementPairFromSerials(row);
    if (pair) pairs.push(pair);
  }
  return pairs;
}

export type SaleDetailsPayloadData = Awaited<ReturnType<typeof toSaleDetailsPayload>>;
