import type { SlipDocument } from "@/app/(app)/logistics/_components/slip-print";
import { PULLOUT_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import { formatManilaDate, shipmentIsReady } from "@/features/logistics/lib/shipment";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";

type PrintedLine = PulloutDetail["lines"][number];

const RETURN_SLIP_LEGEND = ["PAGE 1: BRANCH COPY", "PAGE 2: ACCOUNTING COPY"] as const;

/**
 * "DEFECTIVE UNIT / WITH LINE ON SCREEN / Remarks: Horizontal Bars on Screen". Older pull-outs
 * hold one reason on the header instead of one per unit.
 */
function itemNote(line: PrintedLine, headerReason: string | undefined): string {
  const reason = line.reasonName ?? headerReason;
  const condition = [reason, ...line.problemDescriptionNames]
    .map((part) => part?.trim().toUpperCase())
    .filter(Boolean);
  const remarks = line.remarks?.trim();
  return [...condition, ...(remarks ? [`Remarks: ${remarks}`] : [])].join(" / ");
}

/** Pull-out slip. Null until the waybill, courier and schedule are saved, and on cancelled pull-outs. */
export function pulloutPrintDocument(detail: PulloutDetail): SlipDocument | null {
  if (detail.status.code === PULLOUT_WORKFLOW_CODE.cancelled) return null;
  if (!shipmentIsReady(detail)) return null;
  return {
    title: "PULL-OUT SLIP",
    number: detail.pulloutNo,
    customer: detail.branch.name,
    // The slip shows a calendar date, so take the Manila date rather than the UTC one.
    date: formatManilaDate(detail.scheduledAt),
    address: "",
    items: detail.lines
      .filter((line) => !line.rejectedAt)
      .map((line) => ({
        modelCode: line.skuCode,
        serialNo: line.serialNo,
        note: itemNote(line, detail.reason?.name),
      })),
    copyLegend: RETURN_SLIP_LEGEND,
    copiesPerPage: 2,
  };
}
