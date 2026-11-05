import { shipmentPrintDocument } from "@/app/(app)/logistics/_components/shipment-print";
import { TRANSFER_WORKFLOW_CODE } from "@/features/logistics/constants/workflow-codes";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";

function isClosed(code: string): boolean {
  return code === TRANSFER_WORKFLOW_CODE.rejected || code === TRANSFER_WORKFLOW_CODE.cancelled;
}

/** Null until the waybill, courier and schedule are saved, so the sheet uses saved values only. */
export function transferPrintDocument(detail: TransferDetail) {
  if (isClosed(detail.status.code)) return null;
  return shipmentPrintDocument({
    title: "Transfer",
    documentNo: detail.transferNo,
    shipment: detail.shipment,
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
