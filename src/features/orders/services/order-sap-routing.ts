import type { OrderSapDocType } from "@/features/orders/constants/order-sap-doc-type";

export { SAP_ORDER_DOC_TYPE_LABELS } from "@/features/orders/constants/order-sap-doc-type";

export type OrderSapRouting =
  | {
      ok: true;
      docType: OrderSapDocType;
      sourceWarehouseId: string;
      sourceWhsCode: string;
      branchWhsCode: string;
      cardCode: string | null;
    }
  | { ok: false; error: string };

export interface OrderSapRoutingInput {
  branch: {
    name: string;
    sapCode: string | null;
    /** The warehouse's BP Code UDF: the customer an outright SO bills. */
    bpCode: string | null;
    primaryWarehouse: { id: string; code: string } | null;
  };
  mainWarehouse: { id: string; code: string } | null;
  dealer: {
    name: string;
    sapCode: string | null;
    modeOfPayment: { name: string; kind: "CONSIGNMENT" | "OUTRIGHT" | null } | null;
  } | null;
  /** The order's own mode of payment. When set it overrides the dealer's for this order. */
  orderModeOfPayment?: { name: string; kind: "CONSIGNMENT" | "OUTRIGHT" | null } | null;
  /** CardCode stored on the order at final approval. Read only after approval. */
  storedCardCode?: string | null;
}

const block = (error: string): OrderSapRouting => ({ ok: false, error });

const noBranchSapCode = (branch: { name: string }) => `${branch.name} has no SAP warehouse code.`;
const noDealer = (branch: { name: string }) =>
  `${branch.name} has no dealer. Set the dealer before final approval.`;

/** Outright needs the branch warehouse's BP Code, which only SAP sets. */
export const noBranchBpCode = (branch: { name: string; sapCode: string | null }) =>
  `${branch.name} has no BP Code. Set the BP Code on warehouse ${branch.sapCode ?? branch.name} in SAP, then sync branches in Settings → Branches.`;
const noSourceWarehouse = (branch: { name: string }) =>
  `${branch.name} has no primary warehouse and no main warehouse is set.`;

/**
 * Decides ITR (consignment) or SO (outright) and checks the SAP data the document needs.
 * Consignment goes through the branch's dealer; outright bills the branch warehouse's
 * BP Code and needs no dealer. Pure: used at final approval and again in the SAP job.
 */
export function resolveOrderSapRouting(input: OrderSapRoutingInput): OrderSapRouting {
  const { branch, mainWarehouse, dealer } = input;

  const mop = input.orderModeOfPayment ?? dealer?.modeOfPayment ?? null;
  if (!mop) {
    if (!dealer) return block(noDealer(branch));
    return block(
      `Dealer ${dealer.name} has no mode of payment. Set it in Settings → Dealers before final approval.`,
    );
  }
  if (!mop.kind) {
    return block(
      `Mode of payment ${mop.name} has no type. Set it to Consignment or Outright in Settings → Master data → Modes of payment.`,
    );
  }
  if (!branch.sapCode) {
    return block(noBranchSapCode(branch));
  }
  if (mop.kind === "CONSIGNMENT" && !dealer) {
    return block(noDealer(branch));
  }
  if (mop.kind === "OUTRIGHT" && !branch.bpCode) {
    return block(noBranchBpCode(branch));
  }
  const source = branch.primaryWarehouse ?? mainWarehouse;
  if (!source) {
    return block(noSourceWarehouse(branch));
  }

  return {
    ok: true,
    docType: mop.kind === "OUTRIGHT" ? "SO" : "ITR",
    sourceWarehouseId: source.id,
    sourceWhsCode: source.code,
    branchWhsCode: branch.sapCode,
    cardCode: mop.kind === "OUTRIGHT" ? branch.bpCode : null,
  };
}

export type OrderSapPlaces =
  | { ok: true; sourceWarehouseId: string; sourceWhsCode: string; branchWhsCode: string; cardCode: string | null }
  | { ok: false; error: string };

/**
 * Warehouses and customer for an order whose SAP type was stored at approval.
 * The mode of payment is not read again: changing it after approval must not block
 * or re-route the order. SO uses the CardCode stored at approval; only an SO approved
 * without one falls back to the branch's current BP Code.
 */
export function resolveStoredOrderSapPlaces(
  docType: OrderSapDocType,
  input: OrderSapRoutingInput,
): OrderSapPlaces {
  const { branch, mainWarehouse } = input;
  if (!branch.sapCode) return { ok: false, error: noBranchSapCode(branch) };
  let cardCode: string | null = null;
  if (docType === "SO") {
    cardCode = input.storedCardCode || branch.bpCode;
    if (!cardCode) return { ok: false, error: noBranchBpCode(branch) };
  }
  const source = branch.primaryWarehouse ?? mainWarehouse;
  if (!source) return { ok: false, error: noSourceWarehouse(branch) };
  return {
    ok: true,
    sourceWarehouseId: source.id,
    sourceWhsCode: source.code,
    branchWhsCode: branch.sapCode,
    cardCode,
  };
}

/** Stored type wins after approval, so later dealer changes never re-route an order. */
export function docTypeForOrder(order: { sapDocType: OrderSapDocType | null }): OrderSapDocType {
  if (!order.sapDocType) throw new Error("This order has no SAP document type");
  return order.sapDocType;
}
