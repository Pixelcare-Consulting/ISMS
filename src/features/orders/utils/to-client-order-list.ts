/**
 * Order list rows are loaded with price-list periods so the server can price
 * history totals. Those Prisma values must not cross into a Client Component.
 */

export interface ClientOrderListModel {
  id: string;
  skuCode: string;
  name: string;
  brandId: string | null;
  sku: string;
}

export interface ClientOrderListDetail {
  id: string;
  quantity: number;
  approvedQty: number | null;
  remarks: string | null;
  spRemarks: string | null;
  model: ClientOrderListModel;
}

type OrderListDetailSource = {
  id: string;
  quantity: number;
  approvedQty: number | null;
  remarks: string | null;
  spRemarks?: string | null;
  model: {
    id: string;
    skuCode: string;
    name: string;
    brandId: string | null;
  };
};

export function toClientOrderListDetail(detail: OrderListDetailSource): ClientOrderListDetail {
  return {
    id: detail.id,
    quantity: detail.quantity,
    approvedQty: detail.approvedQty,
    remarks: detail.remarks,
    spRemarks: detail.spRemarks ?? null,
    model: {
      id: detail.model.id,
      skuCode: detail.model.skuCode,
      name: detail.model.name,
      brandId: detail.model.brandId,
      sku: detail.model.skuCode,
    },
  };
}

export function toClientOrderListItem<T extends { details: OrderListDetailSource[] }>(
  order: T,
): Omit<T, "details"> & { details: ClientOrderListDetail[] } {
  return {
    ...order,
    details: order.details.map(toClientOrderListDetail),
  };
}
