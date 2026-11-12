import { escapeHtml, letterheadHtml, printDocumentHtml, type PrintLetterhead } from "@/utils/print-document";
import { printHtml } from "@/utils/print-html";

export interface TransferSlipPrintInput {
  transferNo: string;
  rsNo: string;
  drNo: string;
  fromBranch: string;
  toBranch: string;
  lines: { serialNo: string; model: string }[];
}

function slipSection(
  title: string,
  numberLabel: string,
  number: string,
  input: TransferSlipPrintInput,
  letterhead: PrintLetterhead | null,
): string {
  const rows = input.lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.serialNo)}</td><td>${escapeHtml(line.model)}</td></tr>`,
    )
    .join("");
  return `<section class="slip">
    ${letterheadHtml(letterhead)}
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

/** Each slip is its own page, so each carries the company header. */
export function transferSlipsHtml(input: TransferSlipPrintInput, letterhead: PrintLetterhead | null): string {
  return printDocumentHtml({
    title: input.transferNo,
    styles: `
    h1 { font-size: 18px; margin: 0 0 12px; }
    p { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 13px; }
    .slip + .slip { break-before: page; page-break-before: always; }`,
    body: `${slipSection("Release slip", "RS number", input.rsNo, input, letterhead)}
${slipSection("Delivery receipt", "DR number", input.drNo, input, letterhead)}`,
  });
}

/** Opens the browser print dialog for the release slip and delivery receipt. */
export function printTransferSlips(input: TransferSlipPrintInput, letterhead: PrintLetterhead | null): void {
  printHtml(transferSlipsHtml(input, letterhead));
}
