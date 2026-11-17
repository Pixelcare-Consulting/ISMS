import { lockSerialNumbers } from "@/features/inventory/services/serial-placement";
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
import { txWorkflowCodeId } from "@/features/logistics/services/delivery-settle";
import { nextDeliveryNo } from "@/features/logistics/services/logistics.service";
import {
  authorizePosting,
  claimHeader,
  claimInventory,
  type PostingActor,
} from "@/features/logistics/services/posting-support";
import { writePulloutHistory } from "@/features/logistics/services/pullout-posting.service";
import {
  PULLOUT_SAP_CHECK_CLAIM_LOST as CLAIM_LOST,
  pulloutSapCheckCodeIds,
  runPulloutSapCheck,
  type PulloutRedeliveryTarget,
  type PulloutSapCheckLedger,
} from "@/features/logistics/services/pullout-sap-check.runner";
import { SAP_FOLLOW_STATUS } from "@/features/logistics/services/sap-copy-to-follow.planner";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { prisma } from "@/lib/database/client";

/**
 * "Check SAP" on a sent branch pull-out (rules in `pullout-sap-check.runner.ts`). Branch
 * ledger writes: links on `branch_pullout_lines`, DIT → PO on Branch Inventory, and a DR that
 * redelivers a pulled-out unit becomes an order-less ISMS delivery at the DR's branch.
 */

type LoadedPullout = Awaited<ReturnType<typeof loadPullout>>;

async function loadPullout(actor: PostingActor, pulloutId: string) {
  const pullout = await prisma.branchPullout.findFirst({
    where: { id: pulloutId, tenantId: actor.tenantId },
    select: {
      id: true,
      pulloutNo: true,
      branchId: true,
      statusCodeId: true,
      statusCode: { select: { code: true } },
      lines: {
        select: {
          serialNumberId: true,
          sapDocType: true,
          sapDocEntry: true,
          redeliveryDeliveryId: true,
          receivedAt: true,
          rejectedAt: true,
          serialNumber: { select: { serialNo: true } },
        },
      },
    },
  });
  if (!pullout) throw new Error("Pull-out not found");
  await authorizePosting(actor, "pullout.checkSap", pullout.branchId);
  if (!(PULLOUT_SETTLED_CODES as readonly string[]).includes(pullout.statusCode.code)) {
    throw new Error("Check SAP only after the pull-out is sent");
  }
  const inventory = await prisma.branchInventory.findMany({
    where: {
      tenantId: actor.tenantId,
      branchId: pullout.branchId,
      serialNumberId: { in: pullout.lines.map((line) => line.serialNumberId) },
    },
    select: { serialNumberId: true, statusCode: { select: { code: true } } },
  });
  const codeBySerial = new Map(inventory.map((row) => [row.serialNumberId, row.statusCode.code]));
  const lines: PulloutCheckLine[] = pullout.lines.map((line) => ({
    serialNumberId: line.serialNumberId,
    serialNo: line.serialNumber.serialNo,
    inventoryCode: codeBySerial.get(line.serialNumberId) ?? null,
    linked: line.sapDocType ? { type: line.sapDocType, docEntry: line.sapDocEntry } : null,
    redelivered: line.redeliveryDeliveryId !== null,
    legacySettled: line.receivedAt !== null || line.rejectedAt !== null,
  }));
  return { ...pullout, checkLines: lines };
}

async function applyLinks(
  actor: PostingActor,
  pullout: LoadedPullout,
  plan: PulloutLinkPlan,
  finishHeader: boolean,
  codes: { DIT: string; PO: string },
): Promise<void> {
  const [inTransitId, pulledOutId] = finishHeader
    ? await Promise.all([
        reasonStatusService.requireCodeId(actor.tenantId, "pullout_workflow", PULLOUT_WORKFLOW_CODE.in_transit),
        reasonStatusService.requireCodeId(actor.tenantId, "pullout_workflow", PULLOUT_WORKFLOW_CODE.pulled_out),
      ])
    : [null, null];

  await prisma.$transaction(async (tx) => {
    await lockSerialNumbers(tx, plan.pullOutIds);
    const now = new Date();
    for (const { doc, serialNumberIds } of plan.links) {
      const linked = await tx.branchPulloutLine.updateMany({
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

    await claimInventory(tx, {
      tenantId: actor.tenantId,
      branchId: pullout.branchId,
      serialNumberIds: plan.pullOutIds,
      fromStatusCodeId: codes.DIT,
      toStatusCodeId: codes.PO,
      userId: actor.userId,
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

    if (finishHeader && inTransitId && pulledOutId) {
      await claimHeader(tx, "branchPullout", {
        id: pullout.id,
        tenantId: actor.tenantId,
        fromStatusCodeIds: [inTransitId],
        toStatusCodeId: pulledOutId,
        message: "This pull-out was updated by someone else",
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.userId,
        action: finishHeader ? "pullout.pulled_out" : "pullout.sap_checked",
        entityType: "BranchPullout",
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

/** One redelivery DR: a new ISMS delivery at the DR's branch, units PO → DIT there. */
async function applyRedelivery(
  actor: PostingActor,
  pullout: LoadedPullout,
  redelivery: PulloutRedeliveryTarget,
  codes: { DIT: string; PO: string },
): Promise<{ deliveryNo: string; drNo: string; unitCount: number }> {
  const { dr, placeId: branchId, serialNumberIds } = redelivery;
  return prisma.$transaction(async (tx) => {
    await lockSerialNumbers(tx, serialNumberIds);
    const pendingId = await txWorkflowCodeId(tx, actor.tenantId, DELIVERY_WORKFLOW_CODE.pending);
    const delivery = await tx.branchDelivery.create({
      data: {
        tenantId: actor.tenantId,
        branchId,
        deliveryNo: nextDeliveryNo(),
        statusCodeId: pendingId,
        sapDocEntry: dr.docEntry,
        sapDocNo: dr.displayNo,
        drNo: dr.displayNo,
        drDate: dr.docDate ? new Date(dr.docDate) : null,
      },
      select: { id: true, deliveryNo: true },
    });

    await claimInventory(tx, {
      tenantId: actor.tenantId,
      branchId: pullout.branchId,
      serialNumberIds,
      fromStatusCodeId: codes.PO,
      toStatusCodeId: codes.DIT,
      userId: actor.userId,
      message: CLAIM_LOST,
      toBranchId: branchId,
    });
    const marked = await tx.branchPulloutLine.updateMany({
      where: { pulloutId: pullout.id, serialNumberId: { in: serialNumberIds }, redeliveryDeliveryId: null },
      data: { redeliveryDeliveryId: delivery.id },
    });
    if (marked.count !== serialNumberIds.length) throw new Error(CLAIM_LOST);

    await tx.branchDeliveryLine.createMany({
      data: serialNumberIds.map((serialNumberId) => ({ deliveryId: delivery.id, serialNumberId })),
      skipDuplicates: true,
    });
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
    // A DR takes the serial out of SAP's warehouse to the dealer.
    await tx.serialNumber.updateMany({
      where: { id: { in: serialNumberIds } },
      data: { sapWhsCode: null, sapOnHand: false, sapOnHandSyncedAt: new Date() },
    });

    const record = {
      deliveryId: delivery.id,
      docNum: dr.docNum,
      displayNo: dr.displayNo,
      docDate: dr.docDate ? new Date(dr.docDate) : null,
      status: SAP_FOLLOW_STATUS.APPLIED,
      serialCount: serialNumberIds.length,
      error: null,
    };
    // A FLAGGED/FAILED row means the Copy To cron saw this DR first and could not place it.
    await tx.deliverySapDocument.upsert({
      where: { tenantId_docKind_docEntry: { tenantId: actor.tenantId, docKind: "DR", docEntry: dr.docEntry } },
      create: { tenantId: actor.tenantId, docKind: "DR", docEntry: dr.docEntry, ...record },
      update: { ...record, attempts: { increment: 1 } },
    });

    const metadata = {
      pulloutId: pullout.id,
      pulloutNo: pullout.pulloutNo,
      docKind: "DR",
      docEntry: dr.docEntry,
      displayNo: dr.displayNo,
      serialNumberIds,
      redelivery: true,
    };
    await tx.auditLog.createMany({
      data: [
        {
          tenantId: actor.tenantId,
          userId: actor.userId,
          action: "delivery.dispatched_in_sap",
          entityType: "BranchDelivery",
          entityId: delivery.id,
          metadata: { ...metadata, status: DELIVERY_WORKFLOW_CODE.pending },
        },
        {
          tenantId: actor.tenantId,
          userId: actor.userId,
          action: "pullout.redelivered",
          entityType: "BranchPullout",
          entityId: pullout.id,
          metadata: { ...metadata, deliveryId: delivery.id, deliveryNo: delivery.deliveryNo },
        },
      ],
    });
    return { deliveryNo: delivery.deliveryNo, drNo: dr.displayNo, unitCount: serialNumberIds.length };
  });
}

async function branchIdsBySapCode(tenantId: string, codes: string[]) {
  const branches = await prisma.branch.findMany({
    where: { tenantId, deletedAt: null, sapCode: { in: codes } },
    select: { id: true, sapCode: true },
  });
  return new Map(branches.flatMap((row) => (row.sapCode ? [[row.sapCode, row.id] as const] : [])));
}

/** DRs another delivery already applied (e.g. the Copy To cron for an order). */
async function appliedDrEntries(tenantId: string, docEntries: number[]): Promise<Set<number>> {
  if (docEntries.length === 0) return new Set();
  const rows = await prisma.deliverySapDocument.findMany({
    where: { tenantId, docKind: "DR", docEntry: { in: docEntries }, status: SAP_FOLLOW_STATUS.APPLIED },
    select: { docEntry: true },
  });
  return new Set(rows.map((row) => row.docEntry));
}

export async function checkPulloutInSap(
  actor: PostingActor,
  pulloutId: string,
): Promise<PulloutSapCheckResult> {
  const pullout = await loadPullout(actor, pulloutId);
  const codes = await pulloutSapCheckCodeIds(actor.tenantId);
  const ledger: PulloutSapCheckLedger = {
    placeNoun: "branch",
    applyLinks: (plan, finishHeader) => applyLinks(actor, pullout, plan, finishHeader, codes),
    placeIdsBySapCode: (sapCodes) => branchIdsBySapCode(actor.tenantId, sapCodes),
    appliedDrEntries: (docEntries) => appliedDrEntries(actor.tenantId, docEntries),
    applyRedelivery: (redelivery) => applyRedelivery(actor, pullout, redelivery, codes),
  };
  return runPulloutSapCheck(
    actor.tenantId,
    {
      id: pullout.id,
      pulloutNo: pullout.pulloutNo,
      status: pullout.statusCode.code,
      placeId: pullout.branchId,
      lines: pullout.checkLines,
      linkedReturnEntries: pullout.lines.flatMap((line) =>
        line.sapDocType === "RETURN" && line.sapDocEntry != null ? [line.sapDocEntry] : [],
      ),
    },
    ledger,
  );
}
