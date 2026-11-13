import type { SlipDocument } from "@/app/(app)/logistics/_components/slip-print";
import { TRANSFER_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import { formatManilaDate } from "@/features/logistics/lib/shipment";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";

/** Team Lead has approved and the transfer was not stopped. */
const PRINTABLE_CODES: readonly string[] = [
  TRANSFER_WORKFLOW_CODE.approved,
  TRANSFER_WORKFLOW_CODE.for_transfer,
  TRANSFER_WORKFLOW_CODE.in_transit,
  TRANSFER_WORKFLOW_CODE.accepted,
  TRANSFER_WORKFLOW_CODE.completed,
];

const DELIVERY_RECEIPT_LEGEND = [
  "PAGE 1: BRANCH COPY",
  "PAGE 2: ACCOUNTING COPY",
  "PAGE 3: DEMAND COPY",
] as const;

const STOCK_TRANSFER_REMARK = "Remarks: Stock transfer";

export interface TransferSlipNumbers {
  rsNo: string | null;
  drNo: string | null;
}

/**
 * Release slip and delivery receipt in the client's slip layout. `numbers` lets the approve
 * flow print before the detail reloads with them. The date is the Team Lead approval, or today
 * when the approval is not in the loaded history yet.
 */
export function transferSlipDocuments(
  detail: TransferDetail,
  numbers: TransferSlipNumbers = detail,
  now: Date = new Date(),
): SlipDocument[] {
  const approvedAt = detail.history.find((entry) => entry.action === "transfer.approved")?.at;
  const items = detail.lines
    .filter((line) => line.decision !== "rejected")
    .map((line) => {
      const remarks = line.requestRemarks?.trim();
      return {
        modelCode: line.skuCode,
        serialNo: line.serialNo,
        note: remarks ? `${STOCK_TRANSFER_REMARK} / ${remarks}` : STOCK_TRANSFER_REMARK,
      };
    });
  const base = {
    customer: detail.toBranch.name,
    date: formatManilaDate(approvedAt ?? now.toISOString()),
    address: "",
    items,
    copyLegend: DELIVERY_RECEIPT_LEGEND,
    copiesPerPage: 1 as const,
  };
  const slips: SlipDocument[] = [];
  if (numbers.rsNo) slips.push({ ...base, title: "RELEASE SLIP", number: numbers.rsNo });
  if (numbers.drNo) {
    slips.push({ ...base, title: "DELIVERY RECEIPT", number: numbers.drNo, reference: { label: "Ref RTV#:", value: "" } });
  }
  return slips;
}

/** Null until Team Lead approval, on rejected or cancelled transfers, and without RS/DR numbers. */
export function transferPrintDocument(detail: TransferDetail): SlipDocument[] | null {
  if (!PRINTABLE_CODES.includes(detail.status.code)) return null;
  const slips = transferSlipDocuments(detail);
  return slips.length > 0 ? slips : null;
}
