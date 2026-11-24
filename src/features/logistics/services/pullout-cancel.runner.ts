import {
  planPulloutCancel,
  pulloutCancelNeedsSap,
  type PulloutCancelLine,
  type PulloutCancelPlan,
} from "@/features/logistics/lib/pullout-cancel";
import {
  formatPulloutSapDoc,
  type PulloutSapDocument,
} from "@/features/logistics/lib/pullout-sap-document";
import {
  findPulloutSapDocuments,
  readPulloutSapDocument,
} from "@/features/logistics/services/pullout-sap-document.service";
import { runSapDocumentAction } from "@/features/sap/services/sap-document-status";
import { sapServiceLayerService } from "@/features/sap/services/sap-service-layer.service";
import type { SapServiceLayerCredentials } from "@/features/sap/types/sap-service-layer";
import { logger } from "@/lib/shared/logger";

/**
 * The SAP half of cancelling a pull-out, shared by branch and service center pull-outs
 * (rules in `lib/pullout-cancel.ts`). Reads every IT/Return for the pull-out, plans the
 * cancel, then closes the Returns and cancels the ITs before the caller writes ISMS. Each
 * SAP step is safe to repeat: a retry reads the document as closed or cancelled and skips it.
 */

const NOT_CONNECTED =
  "SAP is not connected, so a sent pull-out cannot be cancelled. Ask an admin to set up the Service Layer in Settings.";

const ACTION_VERB = { Close: "closed", Cancel: "cancelled" } as const;

export interface PulloutCancelSubject {
  id: string;
  pulloutNo: string;
  status: string;
  lines: PulloutCancelLine[];
}

export interface PulloutCancelOutcome {
  plan: PulloutCancelPlan;
  /** "Return: 14402 closed", one per document SAP acted on. */
  sapDone: string[];
}

/** Documents found by the pull-out number, plus any linked one whose rows lost it. */
async function pulloutDocuments(
  creds: SapServiceLayerCredentials,
  subject: PulloutCancelSubject,
): Promise<PulloutSapDocument[]> {
  const documents = await findPulloutSapDocuments(creds, subject.pulloutNo);
  const known = new Set(documents.map((doc) => `${doc.type}:${doc.docEntry}`));
  for (const line of subject.lines) {
    const linked = line.linked;
    if (!linked || linked.docEntry == null || known.has(`${linked.type}:${linked.docEntry}`)) continue;
    documents.push(await readPulloutSapDocument(creds, linked.type, linked.docEntry));
    known.add(`${linked.type}:${linked.docEntry}`);
  }
  return documents;
}

export async function settlePulloutCancelInSap(
  tenantId: string,
  subject: PulloutCancelSubject,
): Promise<PulloutCancelOutcome> {
  if (!pulloutCancelNeedsSap(subject.status)) {
    const plan = planPulloutCancel({ ...subject, documents: null });
    if (!plan.ok) throw new Error(plan.error);
    return { plan, sapDone: [] };
  }

  const creds = await sapServiceLayerService.getCredentials(tenantId);
  if (!creds) throw new Error(NOT_CONNECTED);
  const plan = planPulloutCancel({ ...subject, documents: await pulloutDocuments(creds, subject) });
  if (!plan.ok) throw new Error(plan.error);

  const sapDone: string[] = [];
  for (const step of plan.sapActions) {
    const label = formatPulloutSapDoc(step.type, step.docNum);
    try {
      await runSapDocumentAction(creds, step.type, step.docEntry, step.action);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      const done = sapDone.length > 0 ? ` Already done in SAP: ${sapDone.join(", ")}.` : "";
      throw new Error(`${label} could not be ${ACTION_VERB[step.action]} in SAP (${reason}). Nothing changed in ISMS.${done}`);
    }
    sapDone.push(`${label} ${ACTION_VERB[step.action]}`);
    logger.info(
      { tenantId, pulloutId: subject.id, type: step.type, docEntry: step.docEntry, action: step.action },
      "pullout cancel: SAP document updated",
    );
  }
  return { plan, sapDone };
}
