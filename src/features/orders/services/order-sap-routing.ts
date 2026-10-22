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
    primaryWarehouse: { id: string; code: string } | null;
  };
  mainWarehouse: { id: string; code: string } | null;
  dealer: {
    name: string;
    sapCode: string | null;
    modeOfPayment: { name: string; kind: "CONSIGNMENT" | "OUTRIGHT" | null } | null;
  } | null;
}

const block = (error: string): OrderSapRouting => ({ ok: false, error });

const noBranchSapCode = (branch: { name: string }) => `${branch.name} has no SAP warehouse code.`;
const noDealerCardCode = (dealer: { name: string }) => `Dealer ${dealer.name} has no SAP customer code.`;
const noSourceWarehouse = (branch: { name: string }) =>
  `${branch.name} has no primary warehouse and no main warehouse is set.`;

/**
 * Decides ITR (dealer pays by consignment) or SO (outright) and checks the SAP
 * data the document needs. Pure: used at final approval and again in the SAP job.
 */
export function resolveOrderSapRouting(input: OrderSapRoutingInput): OrderSapRouting {
  const { branch, mainWarehouse, dealer } = input;

  if (!dealer) {
    return block(`${branch.name} has no dealer. Set the dealer before final approval.`);
  }
  const mop = dealer.modeOfPayment;
  if (!mop) {
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
  if (mop.kind === "OUTRIGHT" && !dealer.sapCode) {
    return block(noDealerCardCode(dealer));
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
    cardCode: mop.kind === "OUTRIGHT" ? dealer.sapCode : null,
  };
}

export type OrderSapPlaces =
  | { ok: true; sourceWarehouseId: string; sourceWhsCode: string; branchWhsCode: string; cardCode: string | null }
  | { ok: false; error: string };

/**
 * Warehouses and customer for an order whose SAP type was stored at approval.
 * The dealer's mode of payment is not read again: changing it after approval
 * must not block or re-route the order. SO still needs the dealer's CardCode.
 */
export function resolveStoredOrderSapPlaces(
  docType: OrderSapDocType,
  input: OrderSapRoutingInput,
): OrderSapPlaces {
  const { branch, mainWarehouse, dealer } = input;
  if (!branch.sapCode) return { ok: false, error: noBranchSapCode(branch) };
  let cardCode: string | null = null;
  if (docType === "SO") {
    if (!dealer) return { ok: false, error: `${branch.name} has no dealer.` };
    if (!dealer.sapCode) return { ok: false, error: noDealerCardCode(dealer) };
    cardCode = dealer.sapCode;
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
