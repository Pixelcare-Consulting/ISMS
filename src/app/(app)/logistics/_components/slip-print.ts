import { escapeHtml, letterheadHtml, printDocumentHtml, type PrintLetterhead } from "@/utils/print-document";
import { printHtml } from "@/utils/print-html";

/**
 * The client's paper slip layout (pull-out and transfer slips): number and title, customer
 * block, a boxed list of units, signature lines, and the copy legend. The letterhead stays the
 * shared one.
 */

export interface SlipItem {
  /** Model code, printed letter-spaced the way the client's forms show it. */
  modelCode: string;
  serialNo: string;
  /** Small line under the serial: condition, problems, remarks. Empty prints nothing. */
  note: string;
}

export interface SlipDocument {
  title: string;
  number: string;
  customer: string;
  date: string;
  /** Printed as a blank line until branches carry an address. */
  address: string;
  /** Extra header row such as "Ref RTV#". */
  reference?: { label: string; value: string };
  items: SlipItem[];
  /** One entry per carbon copy, e.g. "PAGE 1: BRANCH COPY". */
  copyLegend: readonly string[];
  /** Two copies share one page, split by a cut line. */
  copiesPerPage: 1 | 2;
}

function field(label: string, value: string, className = ""): string {
  return `<div class="slip-field ${className}"><span class="slip-label">${escapeHtml(label)}</span><span class="slip-value">${escapeHtml(value)}</span></div>`;
}

function itemHtml(item: SlipItem): string {
  const note = item.note ? `<div class="item-note">${escapeHtml(item.note)}</div>` : "";
  return `<li class="item">
        <div class="item-model">${escapeHtml(item.modelCode)}</div>
        <div>Serial No.: ${escapeHtml(item.serialNo)}</div>
        ${note}
      </li>`;
}

function signatureHtml(label: string): string {
  return `<div class="sign">
        <div class="sign-row"><span>${escapeHtml(label)}</span><span class="sign-line"></span></div>
        <div class="sign-caption">Signature Over Printed Name</div>
        <div class="sign-row"><span>Date:</span><span class="sign-line"></span><span>Time:</span><span class="sign-line"></span></div>
      </div>`;
}

function copyHtml(slip: SlipDocument, letterhead: PrintLetterhead | null): string {
  const items =
    slip.items.length > 0
      ? `<ol class="items">${slip.items.map(itemHtml).join("")}</ol>`
      : `<p class="items-empty">No units on this slip.</p>`;
  const reference = slip.reference ? field(slip.reference.label, slip.reference.value) : "";
  return `<section class="copy">
    ${letterheadHtml(letterhead)}
    <div class="slip-no">No. <strong>${escapeHtml(slip.number)}</strong></div>
    <h1 class="slip-title">${escapeHtml(slip.title)}</h1>
    <div class="slip-head">
      ${field("Customer:", slip.customer, "wide")}
      ${field("Date:", slip.date)}
      ${field("Address:", slip.address, "full")}
      ${reference}
    </div>
    <div class="items-box">
      <div class="items-title">DESCRIPTION OF ITEM</div>
      ${items}
    </div>
    <div class="signatures">
      ${signatureHtml("Approved by:")}
      ${signatureHtml("Received by:")}
    </div>
    <p class="legend">${slip.copyLegend.map((entry) => `<span>${escapeHtml(entry)}</span>`).join("")}</p>
  </section>`;
}

const CUT_LINE = '<div class="cut-line" aria-hidden="true"></div>';

function slipPageHtml(slip: SlipDocument, letterhead: PrintLetterhead | null): string {
  const copy = copyHtml(slip, letterhead);
  const copies = slip.copiesPerPage === 2 ? `${copy}${CUT_LINE}${copy}` : copy;
  return `<div class="slip">${copies}${CUT_LINE}</div>`;
}

const SLIP_STYLES = `
    .slip + .slip { break-before: page; page-break-before: always; }
    .copy { break-inside: avoid; page-break-inside: avoid; font-size: 13px; }
    .copy .letterhead { margin-bottom: 12px; }
    .slip-no { text-align: right; font-size: 14px; }
    .slip-title { text-align: center; font-size: 18px; letter-spacing: 0.08em; margin: 4px 0 12px; }
    .slip-head { display: grid; grid-template-columns: 2fr 1fr; gap: 8px 24px; margin-bottom: 12px; }
    .slip-field { display: flex; align-items: flex-end; gap: 8px; }
    .slip-field.full { grid-column: 1 / -1; }
    .slip-label { font-weight: 700; white-space: nowrap; }
    .slip-value { flex: 1; min-height: 1.3em; border-bottom: 1px solid #111; }
    .items-box { border: 1px solid #111; min-height: 96px; margin-bottom: 16px; }
    .items-title { text-align: center; font-weight: 700; padding: 4px 8px; border-bottom: 1px solid #111; }
    .items { list-style: none; margin: 0; padding: 8px 12px; columns: 2; column-gap: 24px; }
    .item { break-inside: avoid; page-break-inside: avoid; margin-bottom: 8px; }
    .item-model { font-family: "Courier New", Courier, monospace; font-weight: 700; letter-spacing: 0.2em; }
    .item-note { font-size: 11px; }
    .items-empty { margin: 0; padding: 8px 12px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    .sign-row { display: flex; align-items: flex-end; gap: 8px; margin-top: 16px; }
    .sign-row span:not(.sign-line) { white-space: nowrap; }
    .sign-line { flex: 1; min-height: 1.3em; border-bottom: 1px solid #111; }
    .sign-caption { text-align: center; font-size: 11px; padding-left: 80px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 32px; margin: 16px 0 0; font-size: 11px; font-weight: 700; }
    .cut-line { border-top: 2px dotted #555; margin: 20px 0; }`;

/** Each slip starts a new page and ends at a cut line. */
export function slipsHtml(slips: readonly SlipDocument[], letterhead: PrintLetterhead | null): string {
  return printDocumentHtml({
    title: slips.map((slip) => `${slip.title} ${slip.number}`).join(", "),
    styles: SLIP_STYLES,
    body: slips.map((slip) => slipPageHtml(slip, letterhead)).join("\n"),
  });
}

/** Opens the browser print dialog for the slips. */
export function printSlips(slips: readonly SlipDocument[], letterhead: PrintLetterhead | null): void {
  printHtml(slipsHtml(slips, letterhead));
}
