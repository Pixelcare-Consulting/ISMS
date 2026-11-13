import {
  ORDER_ATTACHMENT_CLOSED_STATUSES,
  type OrderAttachmentSummary,
} from "@/features/orders/constants/order-attachments";
import { prisma } from "@/lib/database/client";
import { buildOrderAttachmentPath, getObjectStorage } from "@/lib/storage";
import { documentAttachmentError } from "@/lib/storage/document-attachment-rules";

export const orderAttachmentService = {
  /** Only the order's creator can attach, and only while the order is open. */
  async add(actor: { tenantId: string; userId: string }, orderId: string, file: File) {
    const order = await prisma.branchOrder.findFirst({
      where: { id: orderId, tenantId: actor.tenantId },
      select: {
        orderNumber: true,
        orderType: true,
        status: true,
        createdById: true,
        _count: { select: { attachments: true } },
      },
    });
    if (!order) throw new Error("Order not found");
    if (order.createdById !== actor.userId) {
      throw new Error("Only the person who created this order can attach files");
    }
    if (ORDER_ATTACHMENT_CLOSED_STATUSES.includes(order.status)) {
      throw new Error("Files can only be attached to an open order");
    }
    const refused = documentAttachmentError({
      mimeType: file.type,
      sizeBytes: file.size,
      attachedCount: order._count.attachments,
    });
    if (refused) throw new Error(refused);

    const storagePath = buildOrderAttachmentPath({
      tenantId: actor.tenantId,
      orderId,
      fileId: crypto.randomUUID(),
      fileName: file.name,
    });
    const storage = getObjectStorage();
    await storage.upload({
      path: storagePath,
      body: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.branchOrderAttachment.create({
          data: {
            orderId,
            fileName: file.name,
            storagePath,
            mimeType: file.type,
            sizeBytes: file.size,
            uploadedById: actor.userId,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            action: "order.attachment_added",
            entityType: "BranchOrder",
            entityId: orderId,
            metadata: { orderNumber: order.orderNumber, fileName: file.name },
          },
        });
      });
    } catch (error) {
      // A file with no row can never be found again, so do not leave it behind.
      await storage.remove(storagePath).catch(() => undefined);
      throw error;
    }
    return { orderType: order.orderType };
  },

  /** Callers have already checked that the viewer can open this order. */
  listForOrder(orderId: string): Promise<OrderAttachmentSummary[]> {
    return prisma.branchOrderAttachment.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
      select: { id: true, fileName: true },
    });
  },
};
