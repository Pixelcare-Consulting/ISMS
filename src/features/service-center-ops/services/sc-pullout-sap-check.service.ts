import {
  DELIVERY_WORKFLOW_CODE,
  PULLOUT_SETTLED_CODES,
  PULLOUT_WORKFLOW_CODE,
} from "@/features/logistics/constants/workflow-codes";
import {
  formatPulloutSapDoc,
  type PulloutCheckLine,
  type PulloutLinkPlan,
  type PulloutSapCheckResult,
} from "@/features/logistics/lib/pullout-sap-document";
import type { PostingActor } from "@/features/logistics/services/posting-support";
import { pulloutWorkflowId } from "@/features/logistics/services/pullout-line-checklist";
import { writePulloutHistory } from "@/features/logistics/services/pullout-posting.service";
import {
  PULLOUT_SAP_CHECK_CLAIM_LOST as CLAIM_LOST,
  pulloutSapCheckCodeIds,
  runPulloutSapCheck,
  type PulloutRedeliveryApplied,
  type PulloutRedeliveryTarget,
} from "@/features/logistics/services/pullout-sap-check.runner";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { scDeliveryNoForDr } from "@/features/service-center-ordering/lib/sc-order-sap-check";
import {
  authorizeScPullout,
  claimScInventory,
  claimScPulloutHeader,
  lockSerialsThenScRows,
} from "@/features/service-center-ops/services/sc-pullout-posting.service";
import { prisma } from "@/lib/database/client";

/**
 * "Check SAP" on a sent service center pull-out (rules in `pullout-sap-check.runner.ts`).
 * SC ledger writes: links on `service_center_pullout_details`, DIT → PO on Service Center
 * Inventory, and a DR that redelivers a pulled-out unit becomes an SC delivery at the same
 * center (units PO → DIT), which the center accepts like any SAP DR delivery.
 *
 * Only redeliveries back to the pull-out's own center are followed: the DR line's
 * `CostingCode2` is blank or the center's SAP code. A DR to anywhere else is reported, not
 * applied, because it would move the unit off the SC ledger.
 */

const ENTITY_TYPE = "ServiceCenterPullout";

type Codes = { DIT: string; PO: string };
type DeliveryCodes = { pending: string; partial: string; accepted: string };
type LoadedPullout = Awaited<ReturnType<typeof loadPullout>>;

async function loadPullout(actor: PostingActor, pulloutId: string) {
  const pullout = await prisma.serviceCenterPullout.findFirst({
    where: { id: pulloutId, tenantId: actor.tenantId },
    select: {
      id: true,
      pulloutNo: true,
      serviceCenterId: true,
      serviceCenter: { select: { name: true, sapCode: true } },
      statusCode: { select: { code: true } },
      details: {
        select: {
          serialNumberId: true,
          sapDocType: true,
          sapDocEntry: true,
          redeliveryDeliveryId: true,
          serialNumber: { select: { serialNo: true } },
        },
      },
    },
  });
  if (!pullout?.statusCode) throw new Error("Pull-out not found");
  await authorizeScPullout(actor, "checkSap", pullout.serviceCenterId);
  if (!(PULLOUT_SETTLED_CODES as readonly string[]).includes(pullout.statusCode.code)) {
    throw new Error("Check SAP only after the pull-out is sent");
  }
  const inventory = await prisma.serviceCenterInventory.findMany({
    where: {
      tenantId: actor.tenantId,
      serviceCenterId: pullout.serviceCenterId,
      serialNumberId: { in: pullout.details.map((line) => line.serialNumberId) },
    },
    select: { serialNumberId: true, statusCode: { select: { code: true } } },
  });
  const codeBySerial = new Map(inventory.map((row) => [row.serialNumberId, row.statusCode?.code ?? null]));
  const checkLines: PulloutCheckLine[] = pullout.details.map((line) => ({
    serialNumberId: line.serialNumberId,
    serialNo: line.serialNumber.serialNo,
    inventoryCode: codeBySerial.get(line.serialNumberId) ?? null,
    linked: line.sapDocType ? { type: line.sapDocType, docEntry: line.sapDocEntry } : null,
    redelivered: line.redeliveryDeliveryId !== null,
    // SC pull-outs never had receiving.
    legacySettled: false,
  }));
  return { ...pullout, statusCode: pullout.statusCode, checkLines };
}

async function applyLinks(
  actor: PostingActor,
  pullout: LoadedPullout,
  plan: PulloutLinkPlan,
  finishHeader: boolean,
  codes: Codes,
): Promise<void> {
  const [inTransitId, pulledOutId] = finishHeader
    ? await Promise.all([
        pulloutWorkflowId(actor.tenantId, PULLOUT_WORKFLOW_CODE.in_transit),
        pulloutWorkflowId(actor.tenantId, PULLOUT_WORKFLOW_CODE.pulled_out),
      ])
    : [null, null];

  await prisma.$transaction(async (tx) => {
    await lockSerialsThenScRows(tx, actor.tenantId, pullout.serviceCenterId, plan.pullOutIds);
    const now = new Date();
    for (const { doc, serialNumberIds } of plan.links) {
      const linked = await tx.serviceCenterPulloutDetail.updateMany({
        where: { pulloutId: pullout.id, serialNumberId: { in: serialNumberIds }, sapDocType: null },
        data: {
          sapDocType: doc.type,
          sapDocEntry: doc.docEntry,
          sapDocNum: doc.docNum,
          sapDocDate: doc.docDate ? new Date(`${doc.docDate}T00:00:00.000Z`) : null,
          sapDocLinkedAt: now,
          sapDocLinkedById: actor.userId,
        },
      });
      if (linked.count !== serialNumberIds.length) throw new Error(CLAIM_LOST);
      await writePulloutHistory(tx, {
        tenantId: actor.tenantId,
        userId: actor.userId,
        pulloutNo: pullout.pulloutNo,
        serialNumberIds,
        status: null,
        details: `SAP ${formatPulloutSapDoc(doc.type, doc.docNum)} found for ${pullout.pulloutNo}`,
      });
    }

    await claimScInventory(tx, {
      tenantId: actor.tenantId,
      serviceCenterId: pullout.serviceCenterId,
      serialNumberIds: plan.pullOutIds,
      fromStatusCodeId: codes.DIT,
      toStatusCodeId: codes.PO,
      message: CLAIM_LOST,
    });
    await writePulloutHistory(tx, {
      tenantId: actor.tenantId,
      userId: actor.userId,
      pulloutNo: pullout.pulloutNo,
      serialNumberIds: plan.pullOutIds,
      status: "PO",
      details: `Pulled out in SAP on ${pullout.pulloutNo}`,
    });

    if (inTransitId && pulledOutId) {
      await claimScPulloutHeader(tx, {
        id: pullout.id,
        tenantId: actor.tenantId,
        fromStatusCodeIds: [inTransitId],
        toStatusCodeId: pulledOutId,
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.userId,
        action: finishHeader ? "pullout.pulled_out" : "pullout.sap_checked",
        entityType: ENTITY_TYPE,
        entityId: pullout.id,
        metadata: {
          pulloutNo: pullout.pulloutNo,
          documents: plan.links.map(({ doc, serialNumberIds }) => ({
            sapDocType: doc.type,
            sapDocNum: doc.docNum,
            sapDocEntry: doc.docEntry,
            serialNumberIds,
          })),
          pulledOutSerialNumberIds: plan.pullOutIds,
          status: finishHeader ? PULLOUT_WORKFLOW_CODE.pulled_out : pullout.statusCode.code,
        },
      },
    });
  });
}

async function deliveryCodeIds(tenantId: string): Promise<DeliveryCodes> {
  const [pending, partial, accepted] = await Promise.all([
    reasonStatusService.requireCodeId(tenantId, "delivery_workflow", DELIVERY_WORKFLOW_CODE.pending),
    reasonStatusService.requireCodeId(tenantId, "delivery_workflow", DELIVERY_WORKFLOW_CODE.partial),
    reasonStatusService.requireCodeId(tenantId, "delivery_workflow", DELIVERY_WORKFLOW_CODE.accepted),
  ]);
  return { pending, partial, accepted };
}

/**
 * One redelivery DR: an SC delivery at the center, units PO → DIT where they are. SC
 * deliveries are one per DR, so a DR that also redelivers another pull-out's units here
 * adds to the delivery made the first time.
 */
async function applyRedelivery(
  actor: PostingActor,
  pullout: LoadedPullout,
  redelivery: PulloutRedeliveryTarget,
  codes: Codes,
  deliveryCodes: DeliveryCodes,
): Promise<PulloutRedeliveryApplied> {
  const { dr, serialNumberIds } = redelivery;
  const serviceCenterId = pullout.serviceCenterId;
  return prisma.$transaction(async (tx) => {
    await lockSerialsThenScRows(tx, actor.tenantId, serviceCenterId, serialNumberIds);

    // Accept places units at the delivery's location; name it when they share one.
    const rows = await tx.serviceCenterInventory.findMany({
      where: { tenantId: actor.tenantId, serviceCenterId, serialNumberId: { in: serialNumberIds } },
      select: { serviceCenterLocationId: true },
    });
    const locations = [...new Set(rows.map((row) => row.serviceCenterLocationId))];
    const locationId = locations.length === 1 ? locations[0] : null;

    const existing = await tx.serviceCenterDelivery.findFirst({
      where: { tenantId: actor.tenantId, sapDocEntry: dr.docEntry },
      select: { id: true, deliveryNo: true, serviceCenterId: true, statusCodeId: true },
    });
    if (existing && existing.serviceCenterId !== serviceCenterId) {
      throw new Error(`DR ${dr.displayNo} is already delivery ${existing.deliveryNo} at another service center`);
    }
    const delivery =
      existing ??
      (await tx.serviceCenterDelivery.create({
        data: {
          tenantId: actor.tenantId,
          serviceCenterId,
          serviceCenterLocationId: locationId,
          deliveryNo: scDeliveryNoForDr(dr.docEntry),
          statusCodeId: deliveryCodes.pending,
          sapDocEntry: dr.docEntry,
          sapDocNum: dr.docNum,
          sapDocNo: dr.displayNo,
          sapDocDate: dr.docDate ? new Date(dr.docDate) : null,
        },
        select: { id: true, deliveryNo: true, serviceCenterId: true, statusCodeId: true },
      }));
    await tx.serviceCenterDeliveryLine.createMany({
      data: serialNumberIds.map((serialNumberId) => ({ deliveryId: delivery.id, serialNumberId })),
      skipDuplicates: true,
    });
    // New units on a delivery the center already took in fully: it is partly accepted again.
    if (existing && existing.statusCodeId === deliveryCodes.accepted) {
      await tx.serviceCenterDelivery.update({
        where: { id: existing.id },
        data: { statusCodeId: deliveryCodes.partial },
      });
    }

    await claimScInventory(tx, {
      tenantId: actor.tenantId,
      serviceCenterId,
      serialNumberIds,
      fromStatusCodeId: codes.PO,
      toStatusCodeId: codes.DIT,
      message: CLAIM_LOST,
    });
    const marked = await tx.serviceCenterPulloutDetail.updateMany({
      where: { pulloutId: pullout.id, serialNumberId: { in: serialNumberIds }, redeliveryDeliveryId: null },
      data: { redeliveryDeliveryId: delivery.id },
    });
    if (marked.count !== serialNumberIds.length) throw new Error(CLAIM_LOST);

    await tx.serialNumberHistory.createMany({
      data: serialNumberIds.map((serialNumberId) => ({
        tenantId: actor.tenantId,
        serialNumberId,
        txnType: "delivery" as const,
        details: `Redelivered in SAP on DR ${dr.displayNo} for ${delivery.deliveryNo}, after ${pullout.pulloutNo}`,
        status: "DIT",
        createdById: actor.userId,
      })),
    });
    // A DR takes the serial out of SAP's warehouse to the service center.
    await tx.serialNumber.updateMany({
      where: { id: { in: serialNumberIds } },
      data: { sapWhsCode: null, sapOnHand: false, sapOnHandSyncedAt: new Date() },
    });

    const metadata = {
      pulloutId: pullout.id,
      pulloutNo: pullout.pulloutNo,
      drDocEntry: dr.docEntry,
      drNo: dr.displayNo,
      serialNumberIds,
      redelivery: true,
    };
    await tx.auditLog.createMany({
      data: [
        {
          tenantId: actor.tenantId,
          userId: actor.userId,
          action: "sc_delivery.created_from_sap",
          entityType: "ServiceCenterDelivery",
          entityId: delivery.id,
          metadata: { ...metadata, deliveryNo: delivery.deliveryNo, serialCount: serialNumberIds.length },
        },
        {
          tenantId: actor.tenantId,
          userId: actor.userId,
          action: "pullout.redelivered",
          entityType: ENTITY_TYPE,
          entityId: pullout.id,
          metadata: { ...metadata, deliveryId: delivery.id, deliveryNo: delivery.deliveryNo },
        },
      ],
    });
    return { deliveryNo: delivery.deliveryNo, drNo: dr.displayNo, unitCount: serialNumberIds.length };
  });
}

export async function checkScPulloutInSap(
  actor: PostingActor,
  pulloutId: string,
): Promise<PulloutSapCheckResult> {
  const pullout = await loadPullout(actor, pulloutId);
  const [codes, deliveryCodes] = await Promise.all([
    pulloutSapCheckCodeIds(actor.tenantId),
    deliveryCodeIds(actor.tenantId),
  ]);
  const ownCode = pullout.serviceCenter.sapCode.trim();
  return runPulloutSapCheck(
    actor.tenantId,
    {
      id: pullout.id,
      pulloutNo: pullout.pulloutNo,
      status: pullout.statusCode.code,
      placeId: pullout.serviceCenterId,
      lines: pullout.checkLines,
      linkedReturnEntries: pullout.details.flatMap((line) =>
        line.sapDocType === "RETURN" && line.sapDocEntry != null ? [line.sapDocEntry] : [],
      ),
    },
    {
      placeNoun: "place",
      unknownPlaceReason: (code) =>
        `it delivers to "${code}", not back to ${pullout.serviceCenter.name}, so ISMS did not follow it`,
      applyLinks: (plan, finishHeader) => applyLinks(actor, pullout, plan, finishHeader, codes),
      placeIdsBySapCode: async (sapCodes) =>
        new Map(ownCode && sapCodes.includes(ownCode) ? [[ownCode, pullout.serviceCenterId]] : []),
      // One SC delivery per DR: applyRedelivery adds to an existing one instead.
      appliedDrEntries: async () => new Set<number>(),
      applyRedelivery: (redelivery) => applyRedelivery(actor, pullout, redelivery, codes, deliveryCodes),
    },
  );
}
