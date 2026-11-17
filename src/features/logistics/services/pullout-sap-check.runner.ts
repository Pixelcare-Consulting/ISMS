import { PULLOUT_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import {
  formatPulloutSapDoc,
  planPulloutLinks,
  planPulloutRedeliveries,
  pulloutFullyInSap,
  type PulloutCheckLine,
  type PulloutLinkPlan,
  type PulloutSapCheckResult,
  type RedeliveryPlan,
} from "@/features/logistics/lib/pullout-sap-document";
import { postingError } from "@/features/logistics/services/posting-support";
import {
  findPulloutSapDocuments,
  findSapRedeliveries,
} from "@/features/logistics/services/pullout-sap-document.service";
import { reasonStatusService } from "@/features/reason-status/services/reason-status.service";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import { logger } from "@/lib/shared/logger";

/**
 * "Check SAP" on a sent pull-out, shared by branch and service center pull-outs. SAP users
 * create the IT or Return by hand with the pull-out number in the row UDF; this finds them,
 * links each unit (DIT → PO, header Pulled out once every unit is in SAP), then follows any
 * DR that redelivers a pulled-out unit. Each pull-out kind supplies its own ledger writes.
 * Manual on purpose: SAP reads only run when a person asks.
 */

const NOT_CONNECTED =
  "SAP is not connected, so the pull-out cannot be checked. Ask an admin to set up the Service Layer in Settings.";

export const PULLOUT_SAP_CHECK_CLAIM_LOST = "One or more units changed in ISMS while SAP was checked. Check again.";

/** A sent pull-out as Check SAP needs it, from either ledger. */
export interface PulloutSapCheckSubject {
  id: string;
  pulloutNo: string;
  /** Pull-out workflow code of the header now. */
  status: string;
  /** The branch or service center the pull-out left. */
  placeId: string;
  lines: PulloutCheckLine[];
  /** DocEntries of the Returns already linked to its lines. */
  linkedReturnEntries: number[];
}

export type PulloutRedeliveryTarget = RedeliveryPlan["deliveries"][number];
export type PulloutRedeliveryApplied = PulloutSapCheckResult["redeliveries"][number];

/** The writes that differ between branch and service center pull-outs. */
export interface PulloutSapCheckLedger {
  /** "branch" or "service center", for skip reasons. */
  placeNoun: string;
  unknownPlaceReason?: (code: string) => string;
  /** Links, DIT → PO and (when `finishHeader`) In transit → Pulled out, in one transaction. */
  applyLinks(plan: PulloutLinkPlan, finishHeader: boolean): Promise<void>;
  /** Place ids for the `CostingCode2` values on redelivery lines. */
  placeIdsBySapCode(codes: string[]): Promise<Map<string, string>>;
  /** DRs another ISMS document already applied, left out of this check. */
  appliedDrEntries(docEntries: number[]): Promise<Set<number>>;
  /** One redelivery DR, in one transaction: a delivery at the place, units PO → DIT. */
  applyRedelivery(redelivery: PulloutRedeliveryTarget): Promise<PulloutRedeliveryApplied>;
}

export async function pulloutSapCheckCodeIds(tenantId: string): Promise<{ DIT: string; PO: string }> {
  const [dit, po] = await Promise.all([
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "DIT"),
    reasonStatusService.requireCodeId(tenantId, "inventory_system", "PO"),
  ]);
  return { DIT: dit, PO: po };
}

export async function runPulloutSapCheck(
  tenantId: string,
  subject: PulloutSapCheckSubject,
  ledger: PulloutSapCheckLedger,
): Promise<PulloutSapCheckResult> {
  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error(NOT_CONNECTED);

  const documents = await findPulloutSapDocuments(creds, subject.pulloutNo);
  const linkPlan = planPulloutLinks({ pulloutNo: subject.pulloutNo, lines: subject.lines, documents });
  const notes = linkPlan.cancelledDocs.map(
    (doc) => `${formatPulloutSapDoc(doc.type, doc.docNum)} is cancelled in SAP, so it was not used`,
  );

  // Units that are PO once the links apply: already PO, or moving from DIT now.
  const movingToPo = new Set(linkPlan.pullOutIds);
  const pulledOut = subject.lines.filter(
    (line) => !line.redelivered && (line.inventoryCode === "PO" || movingToPo.has(line.serialNumberId)),
  );
  const returnDocEntries = [
    ...documents.filter((doc) => doc.type === "RETURN" && !doc.cancelled).map((doc) => doc.docEntry),
    ...subject.linkedReturnEntries,
  ];
  const redeliveries =
    pulledOut.length > 0 ? await findSapRedeliveries(creds, subject.pulloutNo, returnDocEntries) : [];

  const finishHeader =
    subject.status === PULLOUT_WORKFLOW_CODE.in_transit && pulloutFullyInSap(subject.lines, linkPlan);
  if (linkPlan.links.length > 0 || linkPlan.pullOutIds.length > 0 || finishHeader) {
    try {
      await ledger.applyLinks(linkPlan, finishHeader);
    } catch (error) {
      throw postingError(error, "Failed to save what SAP shows for this pull-out");
    }
  }

  const codes = [
    ...new Set(redeliveries.flatMap((dr) => dr.lines.map((line) => line.branchCode)).filter(Boolean)),
  ];
  const [placeIdBySapCode, applied] = await Promise.all([
    codes.length > 0 ? ledger.placeIdsBySapCode(codes) : new Map<string, string>(),
    redeliveries.length > 0
      ? ledger.appliedDrEntries(redeliveries.map((dr) => dr.docEntry))
      : new Set<number>(),
  ]);
  const plan = planPulloutRedeliveries({
    pulloutNo: subject.pulloutNo,
    pulloutPlaceId: subject.placeId,
    pulledOut,
    returnDocEntries,
    redeliveries: redeliveries.filter((dr) => !applied.has(dr.docEntry)),
    placeIdBySapCode,
    placeNoun: ledger.placeNoun,
    unknownPlaceReason: ledger.unknownPlaceReason,
  });
  notes.push(...plan.skipped.map((skip) => skip.reason));

  const made: PulloutSapCheckResult["redeliveries"] = [];
  for (const redelivery of plan.deliveries) {
    try {
      made.push(await ledger.applyRedelivery(redelivery));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn(
        { tenantId, pulloutId: subject.id, drDocEntry: redelivery.dr.docEntry, err: message },
        "pullout sap check: redelivery not applied",
      );
      notes.push(`DR ${redelivery.dr.displayNo} was not applied: ${message}`);
    }
  }

  return {
    id: subject.id,
    linkedDocuments: linkPlan.links.map(({ doc }) => formatPulloutSapDoc(doc.type, doc.docNum)),
    linkedCount: linkPlan.links.reduce((sum, link) => sum + link.serialNumberIds.length, 0),
    pulledOutCount: linkPlan.pullOutIds.length,
    redeliveries: made,
    waitingCount: linkPlan.waitingSerialNos.length,
    notes,
  };
}
