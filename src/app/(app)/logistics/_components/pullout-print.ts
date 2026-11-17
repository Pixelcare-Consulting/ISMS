import type { SlipDocument } from "@/app/(app)/logistics/_components/slip-print";
import { PULLOUT_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import { formatManilaDate, shipmentIsReady } from "@/features/logistics/lib/shipment";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";

type PrintedLine = PulloutDetail["lines"][number];


function joined(values: readonly (string | null | undefined)[]): string {
  return values
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * The checklist fields a unit was pulled out with, in the detail table's column order. Older
 * pull-outs hold one reason on the header instead of one per unit.
 */
const DETAIL_COLUMNS: readonly {
  label: string;
  value: (line: PrintedLine, headerReason: string | undefined) => string;
}[] = [
  { label: "Reason", value: (line, headerReason) => joined([line.reasonName ?? headerReason]) },
  { label: "Problem", value: (line) => joined(line.problemDescriptionNames) },
  { label: "Classification", value: (line) => joined(line.classificationNames) },
  { label: "Unit packing", value: (line) => joined(line.unitPackingConditionNames) },
  { label: "Acc completeness", value: (line) => joined(line.accessoryCompletenessNames) },
  { label: "Remarks", value: (line) => joined([line.remarks]) },
];

/**
 * Pull-out slip. Null until the waybill, courier and schedule are saved, and on cancelled
 * pull-outs. `placeCopy` names the first page's copy: "BRANCH" or "SERVICE CENTER".
 */
export function pulloutPrintDocument(detail: PulloutDetail, placeCopy: string): SlipDocument | null {
  if (detail.status.code === PULLOUT_WORKFLOW_CODE.cancelled) return null;
  if (!shipmentIsReady(detail)) return null;
  const lines = detail.lines.filter((line) => !line.rejectedAt);
  const headerReason = detail.reason?.name;
  const cells = lines.map((line) => DETAIL_COLUMNS.map((column) => column.value(line, headerReason)));
  // A column no unit on this slip filled in leaves room for the rest.
  const shown = DETAIL_COLUMNS.flatMap((_, index) =>
    cells.some((row) => row[index]) ? [index] : [],
  );
  return {
    title: "PULL-OUT SLIP",
    number: detail.pulloutNo,
    customer: detail.place.name,
    // The slip shows a calendar date, so take the Manila date rather than the UTC one.
    date: formatManilaDate(detail.scheduledAt),
    address: "",
    detailColumns: shown.map((index) => DETAIL_COLUMNS[index].label),
    items: lines.map((line, row) => ({
      modelCode: line.skuCode,
      serialNo: line.serialNo,
      notes: [],
      details: shown.map((index) => cells[row][index]),
    })),
    copyLegend: [`PAGE 1: ${placeCopy} COPY`, "PAGE 2: ACCOUNTING COPY"],
    copiesPerPage: 2,
  };
}
