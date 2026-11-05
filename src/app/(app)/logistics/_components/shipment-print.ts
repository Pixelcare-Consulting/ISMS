import { formatScheduleDate, shipmentIsReady, type LogisticsShipment } from "@/features/logistics/lib/shipment";

export interface ShipmentPrintLine {
  model: string;
  detail: string;
  /** Cells for `extraHeaders`, in the same order. */
  extras?: string[];
}

export interface ShipmentPrintDocument {
  title: string;
  documentNo: string;
  waybillNo: string;
  courierName: string;
  scheduleDate: string;
  fields: { label: string; value: string }[];
  lines: ShipmentPrintLine[];
  lineHeaders: { model: string; detail: string };
  extraHeaders?: string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function shipmentPrintDocument(input: {
  title: string;
  documentNo: string;
  shipment: LogisticsShipment;
  fields: { label: string; value: string }[];
  lines: ShipmentPrintLine[];
  lineHeaders: { model: string; detail: string };
  extraHeaders?: string[];
}): ShipmentPrintDocument | null {
  if (!shipmentIsReady(input.shipment)) return null;
  const waybillNo = input.shipment.waybillNo?.trim() ?? "";
  const courierName = input.shipment.courierName?.trim() ?? "";
  const scheduleDate = formatScheduleDate(input.shipment.scheduledAt);
  if (!waybillNo || !courierName || scheduleDate === "—") return null;
  return {
    title: input.title,
    documentNo: input.documentNo,
    waybillNo,
    courierName,
    scheduleDate,
    fields: input.fields,
    lines: input.lines,
    lineHeaders: input.lineHeaders,
    extraHeaders: input.extraHeaders,
  };
}

export function shipmentPrintHtml(document: ShipmentPrintDocument): string {
  const fields = [
    { label: "Waybill", value: document.waybillNo },
    { label: "Courier / forwarder", value: document.courierName },
    { label: "Schedule date", value: document.scheduleDate },
    ...document.fields,
  ]
    .map(
      (field) =>
        `<div class="field"><div class="label">${escapeHtml(field.label)}</div><div>${escapeHtml(field.value)}</div></div>`,
    )
    .join("");
  const headers = [
    document.lineHeaders.model,
    document.lineHeaders.detail,
    ...(document.extraHeaders ?? []),
  ];
  const rows =
    document.lines.length > 0
      ? document.lines
          .map((line) => {
            const cells = [line.model, line.detail, ...(line.extras ?? [])];
            return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
          })
          .join("")
      : `<tr><td colspan="${headers.length}">No units on this ${escapeHtml(document.title.toLowerCase())}.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(document.title)} ${escapeHtml(document.documentNo)}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .sub { margin: 0 0 20px; color: #444; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-bottom: 24px; }
    .label { font-size: 12px; color: #555; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; border-bottom: 1px solid #ccc; padding: 6px 8px; font-size: 14px; }
    th { font-size: 12px; color: #555; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(document.title)}</h1>
  <p class="sub">${escapeHtml(document.documentNo)}</p>
  <div class="grid">${fields}</div>
  <table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

/** Opens the saved waybill sheet and the browser print dialog. */
export function printShipmentDocument(document: ShipmentPrintDocument): boolean {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(shipmentPrintHtml(document));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => {
    popup.print();
  }, 150);
  return true;
}
