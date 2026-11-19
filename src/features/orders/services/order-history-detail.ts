import type { BranchOrderStatus, BranchOrderType } from "@prisma/client";

import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";
import { hasPermission, requireAnyPermission } from "@/lib/auth/permissions";
import { decimalToNumberOrNull } from "@/lib/database/decimal";
import { resolveActiveOrderPrice } from "@/features/master-data/utils/resolve-active-order-price";
import {
  formatOrderModeOfPayment,
  type OrderSapDocType,
} from "@/features/orders/constants/order-sap-doc-type";
import {
  canAccessOrderType,
  hasAnyOrderPermission,
  orderTypeAccessPermissions,
} from "@/features/orders/constants/order-permissions";
import { mayViewOrderAsProductSpecialist } from "@/features/orders/constants/order-workflow";
import { orderRepository } from "@/features/orders/repositories/order.repository";
import { orderAttachmentStoragePrefix } from "@/features/orders/utils/order-attachment-paths";
import {
  parseSaleProofPaths,
  saleProofFileName,
  saleProofMimeType,
} from "@/features/sales/utils/sale-proof";
import type {
  OrderHistoryDetail,
  OrderHistoryLinkedDelivery,
} from "@/features/orders/types/order-analytics";

function hasFullOrderAccess(permissions: string[] | undefined) {
  return (
    hasAnyOrderPermission(permissions, "approve") ||
    hasPermission(permissions, "branches.manage")
  );
}

async function resolveOrderBranchScope(
  tenantId: string,
  userId: string,
  permissions: string[] | undefined,
): Promise<string[] | null> {
  if (hasFullOrderAccess(permissions)) return null;
  return getUserBranchIds(tenantId, userId);
}

function lastUpdatedByName(order: {
  createdBy: { name: string | null; email: string };
  approvalLevels: {
    approvedAt: Date | null;
    rejectedAt: Date | null;
    approvedBy: { name: string | null; email: string } | null;
  }[];
}): string {
  const actors = order.approvalLevels
    .map((level) => {
      const at = level.approvedAt ?? level.rejectedAt;
      return at && level.approvedBy ? { at, person: level.approvedBy } : null;
    })
    .filter((row): row is { at: Date; person: { name: string | null; email: string } } => row !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const person = actors[0]?.person ?? order.createdBy;
  return person.name?.trim() || person.email;
}

/** The order's one delivery, for its stored status and a link. No status is derived. */
async function findLinkedDelivery(
  tenantId: string,
  orderId: string,
  branchIds: string[] | null,
): Promise<OrderHistoryLinkedDelivery | null> {
  const delivery = await prisma.branchDelivery.findFirst({
    where: {
      tenantId,
      orderId,
      ...(branchIds === null ? {} : { branchId: { in: branchIds } }),
    },
    select: {
      id: true,
      deliveryNo: true,
      statusCode: { select: { code: true, name: true, color: true } },
    },
  });
  if (!delivery) return null;
  return {
    id: delivery.id,
    deliveryNo: delivery.deliveryNo,
    status: {
      code: delivery.statusCode.code,
      name: delivery.statusCode.name,
      color: delivery.statusCode.color,
    },
  };
}

/** Order History page. Same branch scope as the history list. Null when the order is out of scope. */
export async function getOrderHistoryDetail(
  orderType: BranchOrderType,
  orderId: string,
): Promise<OrderHistoryDetail | null> {
  const session = await requireAnyPermission(orderTypeAccessPermissions(orderType));
  const branchScope = await resolveOrderBranchScope(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  const order = await orderRepository.findScopedById(
    session.user.tenantId,
    orderId,
    branchScope,
    orderType,
  );
  if (!order) return null;
  switch (orderType) {
    case "manual":
    case "special":
      if (
        !mayViewOrderAsProductSpecialist({
          roleSlugs: session.user.roleSlugs ?? [],
          viewerUserId: session.user.id,
          createdById: order.createdById,
        })
      ) {
        return null;
      }
      break;
    case "auto_replenish":
      break;
    default: {
      const _exhaustive: never = orderType;
      return _exhaustive;
    }
  }

  const delivery = await findLinkedDelivery(session.user.tenantId, order.id, branchScope);
  const attachments = parseSaleProofPaths(order.attachments);

  let orderQty = 0;
  let appQty = 0;
  let totalAmt = 0;
  let appAmt = 0;
  const lines = order.details.map((detail) => {
    const srp = resolveActiveOrderPrice(detail.model.priceLists, detail.model.srp);
    const approved = detail.approvedQty ?? 0;
    orderQty += detail.quantity;
    appQty += approved;
    totalAmt += detail.quantity * srp;
    appAmt += approved * srp;
    return {
      detailId: detail.id,
      modelId: detail.model.id,
      skuCode: detail.model.skuCode,
      name: detail.model.name,
      quantity: detail.quantity,
      approvedQty: detail.approvedQty,
      remarks: detail.remarks,
      spRemarks: detail.spRemarks,
      amount: detail.quantity * srp,
      approvedAmount: detail.approvedQty == null ? null : detail.approvedQty * srp,
      unitCbm: decimalToNumberOrNull(detail.model.cbm),
    };
  });

  const orderPayment = order.modeOfPayment?.name?.trim() || null;
  const dealerPayment = order.branch.dealer?.modeOfPayment?.name?.trim() || null;
  const formattedPayment =
    orderPayment || dealerPayment
      ? formatOrderModeOfPayment({
          orderModeOfPayment: orderPayment,
          dealerModeOfPayment: dealerPayment,
        })
      : null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    source: order.source,
    status: order.status,
    dealerName: order.branch.dealer?.name?.trim() || null,
    paymentLabel: formattedPayment && formattedPayment !== "—" ? formattedPayment : null,
    branchId: order.branchId,
    branchName: order.branch.name,
    brandId: order.brandId,
    notes: order.notes,
    attachments,
    deliveryDueDate: order.deliveryDueDate?.toISOString() ?? null,
    createdByName: order.createdBy.name?.trim() || order.createdBy.email,
    reviewSnapshot: order.reviewSnapshot,
    reviewSnapshotAt: order.reviewSnapshotAt?.toISOString() ?? null,
    sapDocType: order.sapDocType,
    sapDocNum: order.sapDocNum,
    orderQty,
    totalAmt,
    appQty,
    appAmt,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    processedAt: order.processedAt?.toISOString() ?? null,
    lastUpdatedBy: lastUpdatedByName(order),
    lines,
    approvalLevels: order.approvalLevels.map((level) => ({
      level: level.level,
      roleSlug: level.roleSlug,
      approvedAt: level.approvedAt?.toISOString() ?? null,
      rejectedAt: level.rejectedAt?.toISOString() ?? null,
      comment: level.comment,
      approvedBy: level.approvedBy
        ? { name: level.approvedBy.name, email: level.approvedBy.email }
        : null,
    })),
    delivery,
  };
}

export interface SubmittedOrderLine {
  id: string;
  modelId: string;
  skuCode: string;
  name: string;
  quantity: number;
  /** Stored line amount. Null when the order has no amount for this line. */
  amount: number | null;
  /** Unit CBM on the model. Null when the model has none. */
  unitCbm: number | null;
  note: string | null;
  spNote: string | null;
}

export interface SubmittedOrderSummary {
  id: string;
  orderNumber: string;
  orderType: "manual" | "special";
  status: BranchOrderStatus;
  branchId: string;
  dealerName: string | null;
  branchName: string;
  /** Resolved payment name, or null when the order has none. */
  paymentLabel: string | null;
  notes: string | null;
  attachments: string[];
  sapDocType: OrderSapDocType | null;
  sapDocNum: number | null;
  reviewSnapshot: unknown;
  createdAt: string;
  processedAt: string | null;
  createdByName: string;
  lines: SubmittedOrderLine[];
  approvalLevels: {
    level: number;
    approvedAt: string | null;
    rejectedAt: string | null;
    actorName: string | null;
  }[];
}

/**
 * Saved manual or special order for the page after submit.
 * Null when it is missing, out of branch scope, or the viewer cannot open that order type.
 */
export async function getSubmittedOrderSummary(
  orderId: string,
): Promise<SubmittedOrderSummary | null> {
  const session = await requireAnyPermission([
    ...orderTypeAccessPermissions("manual"),
    ...orderTypeAccessPermissions("special"),
  ]);
  const branchScope = await resolveOrderBranchScope(
    session.user.tenantId,
    session.user.id,
    session.user.permissions,
  );
  const order = await orderRepository.findManualOrSpecialById(
    session.user.tenantId,
    orderId,
    branchScope,
  );
  if (!order) return null;
  if (order.orderType !== "manual" && order.orderType !== "special") return null;
  if (!canAccessOrderType(session.user.permissions, order.orderType)) return null;
  if (
    !mayViewOrderAsProductSpecialist({
      roleSlugs: session.user.roleSlugs ?? [],
      viewerUserId: session.user.id,
      createdById: order.createdById,
    })
  ) {
    return null;
  }

  const attachments = parseSaleProofPaths(order.attachments);
  const orderPayment = order.modeOfPayment?.name?.trim() || null;
  const dealerPayment = order.branch.dealer?.modeOfPayment?.name?.trim() || null;
  const paymentLabel =
    orderPayment || dealerPayment
      ? formatOrderModeOfPayment({
          orderModeOfPayment: orderPayment,
          dealerModeOfPayment: dealerPayment,
        })
      : null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    status: order.status,
    branchId: order.branchId,
    dealerName: order.branch.dealer?.name?.trim() || null,
    branchName: order.branch.name,
    paymentLabel: paymentLabel === "—" ? null : paymentLabel,
    notes: order.notes,
    attachments,
    sapDocType: order.sapDocType,
    sapDocNum: order.sapDocNum,
    reviewSnapshot: order.reviewSnapshot,
    createdAt: order.createdAt.toISOString(),
    processedAt: order.processedAt?.toISOString() ?? null,
    createdByName: order.createdBy.name?.trim() || order.createdBy.email,
    lines: order.details.map((detail) => ({
      id: detail.id,
      modelId: detail.modelId,
      skuCode: detail.model.skuCode,
      name: detail.model.name,
      quantity: detail.quantity,
      amount: decimalToNumberOrNull(detail.amount),
      unitCbm: decimalToNumberOrNull(detail.model.cbm),
      note: detail.remarks,
      spNote: detail.spRemarks,
    })),
    approvalLevels: order.approvalLevels.map((level) => ({
      level: level.level,
      approvedAt: level.approvedAt?.toISOString() ?? null,
      rejectedAt: level.rejectedAt?.toISOString() ?? null,
      actorName: level.approvedBy?.name?.trim() || level.approvedBy?.email || null,
    })),
  };
}

/**
 * Stored file of an order attachment, for the download route.
 * Same access as opening the order: type permission, branch scope, and the Product
 * Specialist own-orders rule. Null when the viewer cannot open that order.
 */
export async function findViewableOrderAttachment(
  viewer: { tenantId: string; userId: string; permissions: string[]; roleSlugs: string[] },
  attachmentId: string,
): Promise<{ fileName: string; storagePath: string; mimeType: string } | null> {
  const attachment = await prisma.branchOrderAttachment.findFirst({
    where: { id: attachmentId, order: { tenantId: viewer.tenantId } },
    select: {
      fileName: true,
      storagePath: true,
      mimeType: true,
      order: { select: { orderType: true, branchId: true, createdById: true } },
    },
  });
  if (!attachment) return null;
  const { order } = attachment;
  if (!canAccessOrderType(viewer.permissions, order.orderType)) return null;
  const branchScope = await resolveOrderBranchScope(
    viewer.tenantId,
    viewer.userId,
    viewer.permissions,
  );
  if (branchScope !== null && !branchScope.includes(order.branchId)) return null;
  if (
    order.orderType !== "auto_replenish" &&
    !mayViewOrderAsProductSpecialist({
      roleSlugs: viewer.roleSlugs,
      viewerUserId: viewer.userId,
      createdById: order.createdById,
    })
  ) {
    return null;
  }
  return {
    fileName: attachment.fileName,
    storagePath: attachment.storagePath,
    mimeType: attachment.mimeType,
  };
}

/**
 * One path on the order, for the preview route.
 * Same access as opening the order. Null when the index is missing or out of scope.
 */
export async function findViewableOrderAttachmentFile(
  viewer: { tenantId: string; userId: string; permissions: string[]; roleSlugs: string[] },
  orderId: string,
  index: number,
): Promise<{ fileName: string; storagePath: string; mimeType: string } | null> {
  if (!Number.isInteger(index) || index < 0) return null;
  const order = await prisma.branchOrder.findFirst({
    where: { id: orderId, tenantId: viewer.tenantId },
    select: {
      attachments: true,
      orderType: true,
      branchId: true,
      createdById: true,
    },
  });
  if (!order) return null;
  if (!canAccessOrderType(viewer.permissions, order.orderType)) return null;
  const branchScope = await resolveOrderBranchScope(
    viewer.tenantId,
    viewer.userId,
    viewer.permissions,
  );
  if (branchScope !== null && !branchScope.includes(order.branchId)) return null;
  if (
    order.orderType !== "auto_replenish" &&
    !mayViewOrderAsProductSpecialist({
      roleSlugs: viewer.roleSlugs,
      viewerUserId: viewer.userId,
      createdById: order.createdById,
    })
  ) {
    return null;
  }
  const storagePath = parseSaleProofPaths(order.attachments)[index];
  if (!storagePath?.startsWith(orderAttachmentStoragePrefix(viewer.tenantId))) return null;
  return {
    fileName: saleProofFileName(storagePath),
    storagePath,
    mimeType: saleProofMimeType(storagePath),
  };
}
