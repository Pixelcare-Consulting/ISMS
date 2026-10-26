export interface TransferSlipPrintInput {
  transferNo: string;
  rsNo: string;
  drNo: string;
  fromBranch: string;
  toBranch: string;
  lines: { serialNo: string; model: string }[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slipSection(title: string, numberLabel: string, number: string, input: TransferSlipPrintInput): string {
  const rows = input.lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.serialNo)}</td><td>${escapeHtml(line.model)}</td></tr>`,
    )
    .join("");
  return `<section class="slip">
    <h1>${escapeHtml(title)}</h1>
    <p><strong>${escapeHtml(numberLabel)}</strong> ${escapeHtml(number)}</p>
    <p><strong>Transfer</strong> ${escapeHtml(input.transferNo)}</p>
    <p><strong>From</strong> ${escapeHtml(input.fromBranch)}</p>
    <p><strong>To</strong> ${escapeHtml(input.toBranch)}</p>
    <table>
      <thead><tr><th>Serial number</th><th>Model</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

/** Opens the browser print dialog for the release slip and delivery receipt. */
export function printTransferSlips(input: TransferSlipPrintInput): boolean {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
  if (!popup) return false;
  popup.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.transferNo)}</title>
  <style>
    body { font-family: sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    p { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 13px; }
    .slip + .slip { break-before: page; page-break-before: always; margin-top: 32px; }
  </style>
</head>
<body>
  ${slipSection("Release slip", "RS number", input.rsNo, input)}
  ${slipSection("Delivery receipt", "DR number", input.drNo, input)}
</body>
</html>`);
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
}
