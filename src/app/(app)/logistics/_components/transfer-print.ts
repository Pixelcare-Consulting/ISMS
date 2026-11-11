import { shipmentPrintDocument } from "@/app/(app)/logistics/_components/shipment-print";
import { TRANSFER_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";

/** Team Lead has approved and the transfer was not stopped. */
const PRINTABLE_CODES: readonly string[] = [
  TRANSFER_WORKFLOW_CODE.approved,
  TRANSFER_WORKFLOW_CODE.for_transfer,
  TRANSFER_WORKFLOW_CODE.in_transit,
  TRANSFER_WORKFLOW_CODE.accepted,
  TRANSFER_WORKFLOW_CODE.completed,
];

/** Null until Team Lead approval, and on rejected or cancelled transfers. */
export function transferPrintDocument(detail: TransferDetail) {
  if (!PRINTABLE_CODES.includes(detail.status.code)) return null;
  return shipmentPrintDocument({
    title: "Transfer",
    documentNo: detail.transferNo,
    fields: [
      { label: "Releasing branch", value: detail.fromBranch.name },
      { label: "Receiving branch", value: detail.toBranch.name },
      ...(detail.rsNo ? [{ label: "RS number", value: detail.rsNo }] : []),
      ...(detail.drNo ? [{ label: "DR number", value: detail.drNo }] : []),
    ],
    lines: detail.lines
      .filter((line) => line.decision !== "rejected")
      .map((line) => ({
        model: `${line.skuCode} ${line.modelName}`,
        detail: line.serialNo,
        extras: [line.requestRemarks?.trim() || "—"],
      })),
    lineHeaders: { model: "Model", detail: "Serial number" },
    extraHeaders: ["Remarks"],
  });
}
