import { shipmentPrintDocument } from "@/app/(app)/logistics/_components/shipment-print";
import { PULLOUT_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import { manilaDateTimeInputValue } from "@/features/logistics/lib/shipment";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";

type PrintedLine = PulloutDetail["lines"][number];

/** Older pull-outs hold one reason on the header instead of one per unit. */
function reasonText(line: PrintedLine, headerReason: string | undefined): string {
  const reason = line.reasonName ?? headerReason;
  const problems = line.problemDescriptionNames.join(", ");
  return [reason, problems].filter(Boolean).join(": ") || "—";
}

/** Null until the waybill, courier and schedule are saved, so the slip uses saved values only. */
export function pulloutPrintDocument(detail: PulloutDetail) {
  if (detail.status.code === PULLOUT_WORKFLOW_CODE.cancelled) return null;
  return shipmentPrintDocument({
    title: "Pull-out",
    documentNo: detail.pulloutNo,
    shipment: {
      waybillNo: detail.waybillNo,
      courierName: detail.courierName,
      // Print shows a calendar date, so take the Manila date rather than the UTC one.
      scheduledAt: manilaDateTimeInputValue(detail.scheduledAt).slice(0, 10) || null,
      scheduledByName: detail.scheduledByName,
    },
    fields: [
      { label: "Branch", value: detail.branch.name },
      ...(detail.warehouse
        ? [{ label: "Destination warehouse", value: `${detail.warehouse.name} (${detail.warehouse.code})` }]
        : []),
    ],
    lines: detail.lines
      .filter((line) => !line.rejectedAt)
      .map((line) => ({
        model: `${line.skuCode} ${line.modelName}`,
        detail: [line.serialNo, line.priorCode].filter(Boolean).join(" · "),
        extras: [reasonText(line, detail.reason?.name), line.remarks?.trim() || "—"],
      })),
    lineHeaders: { model: "Model", detail: "Serial number" },
    extraHeaders: ["Reason", "Remarks"],
  });
}
