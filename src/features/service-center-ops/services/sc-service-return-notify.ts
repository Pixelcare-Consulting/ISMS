import { notificationService } from "@/features/notifications/services/notification.service";
import { SC_RETURNS_PROCESS } from "@/features/service-center-ops/constants/sc-permissions";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/shared/logger";

/**
 * Notifications for Service Returns / Replacements (Process V-b). The request is already
 * saved when these run, so a failure only logs.
 */

const NOTIFICATION_TYPE = "sc_service_return";

export function scServiceReturnHref(returnRequestId: string): string {
  return `/service-centers/returns?request=${encodeURIComponent(returnRequestId)}`;
}

/** The CSR follows the request on the SC sale it was raised from. */
function csrTrackingHref(transactionNo: string): string {
  return `/service-centers/sales?q=${encodeURIComponent(transactionNo)}`;
}

/** Users assigned to the service center whose role can process its service returns. */
async function listScProcessorIds(tenantId: string, serviceCenterId: string): Promise<string[]> {
  const rows = await prisma.aor.findMany({
    where: {
      tenantId,
      serviceCenterId,
      user: {
        deletedAt: null,
        userRoles: {
          some: {
            role: {
              tenantId,
              deletedAt: null,
              rolePermissions: { some: { permission: { slug: SC_RETURNS_PROCESS } } },
            },
          },
        },
      },
    },
    select: { userId: true },
    distinct: ["userId"],
    orderBy: { userId: "asc" },
  });
  return rows.map((row) => row.userId);
}

async function notifyUsers(input: {
  tenantId: string;
  actorUserId: string;
  userIds: string[];
  title: string;
  body: string;
  href: string;
  returnRequestId: string;
}): Promise<void> {
  const recipients = [...new Set(input.userIds)].filter((id) => id !== input.actorUserId);
  await Promise.all(
    recipients.map((userId) =>
      notificationService.createNotification({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        data: {
          audience: "USER",
          userId,
          type: NOTIFICATION_TYPE,
          title: input.title,
          body: input.body,
          href: input.href,
          metadata: { returnRequestId: input.returnRequestId },
        },
      }),
    ),
  );
}

function actionLabel(actionType: "return" | "replacement" | null | undefined): string {
  return actionType === "replacement" ? "Service Replacement" : "Service Return";
}

/** CSR sent a Service Return / Replacement: the service center's processors inspect it. */
export async function notifyScServiceReturnRequested(input: {
  tenantId: string;
  actorUserId: string;
  returnRequestId: string;
  serviceCenterId: string;
  transactionNo: string;
  actionType: "return" | "replacement";
  serialNo: string | null;
}): Promise<void> {
  try {
    const userIds = await listScProcessorIds(input.tenantId, input.serviceCenterId);
    await notifyUsers({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      userIds,
      title: `${actionLabel(input.actionType)} · ${input.transactionNo}`,
      body: `Inspect the returned unit${input.serialNo ? ` ${input.serialNo}` : ""} and finish the request.`,
      href: scServiceReturnHref(input.returnRequestId),
      returnRequestId: input.returnRequestId,
    });
  } catch (error) {
    logger.warn(
      { tenantId: input.tenantId, returnRequestId: input.returnRequestId, err: error },
      "sc service return request notification failed",
    );
  }
}

/** The special order for a replacement arrived, or was rejected: back to the service center. */
export async function notifyScSpecialOrderOutcome(input: {
  tenantId: string;
  actorUserId: string;
  returnRequestId: string;
  serviceCenterId: string;
  transactionNo: string;
  orderNumber: string;
  outcome: "DELIVERED" | "REJECTED";
}): Promise<void> {
  try {
    const userIds = await listScProcessorIds(input.tenantId, input.serviceCenterId);
    const delivered = input.outcome === "DELIVERED";
    await notifyUsers({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      userIds,
      title: `Service Replacement · ${input.transactionNo}`,
      body: delivered
        ? `Special order ${input.orderNumber} arrived. The unit is held for this replacement.`
        : `Special order ${input.orderNumber} was rejected. Choose a replacement or raise another order.`,
      href: scServiceReturnHref(input.returnRequestId),
      returnRequestId: input.returnRequestId,
    });
  } catch (error) {
    logger.warn(
      { tenantId: input.tenantId, returnRequestId: input.returnRequestId, err: error },
      "sc special order notification failed",
    );
  }
}

/** The service center finished or rejected the request: tell the CSR who sent it. */
export async function notifyCsrScServiceReturnDecided(input: {
  tenantId: string;
  actorUserId: string;
  returnRequestId: string;
  requestedById: string;
  transactionNo: string;
  actionType: "return" | "replacement" | null;
  serviceCenterName: string;
  outcome: "COMPLETED" | "REJECTED";
  reason?: string | null;
}): Promise<void> {
  try {
    const completed = input.outcome === "COMPLETED";
    await notifyUsers({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      userIds: [input.requestedById],
      title: `${actionLabel(input.actionType)} ${completed ? "completed" : "rejected"} · ${input.transactionNo}`,
      body: completed
        ? `${input.serviceCenterName} finished this request.`
        : `${input.serviceCenterName} rejected this request${input.reason ? `: ${input.reason}` : "."} The sale is open again.`,
      href: csrTrackingHref(input.transactionNo),
      returnRequestId: input.returnRequestId,
    });
  } catch (error) {
    logger.warn(
      { tenantId: input.tenantId, returnRequestId: input.returnRequestId, err: error },
      "sc service return decision notification failed",
    );
  }
}
