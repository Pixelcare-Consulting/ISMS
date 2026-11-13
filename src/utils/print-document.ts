/** Company header printed at the top of every slip. */
export interface PrintLetterhead {
  /** Company Settings logo, a data URL. */
  logo: string | null;
  companyName: string;
  /** Free text from Company Settings, one printed line each (address, phone, fax). */
  lines: string[];
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Ubuntu is the client's document font. Offline or blocked, slips fall back to Arial. */
const PRINT_FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com" />' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap" />';

const BASE_STYLES = `
    body { font-family: "Ubuntu", Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
    .letterhead { display: flex; align-items: center; gap: 24px; margin-bottom: 24px; }
    .letterhead img { max-height: 64px; max-width: 220px; object-fit: contain; flex-shrink: 0; }
    .letterhead .company-name { font-size: 20px; font-weight: 700; flex-shrink: 0; }
    .letterhead .contact { flex: 1; font-size: 12px; line-height: 1.6; padding-bottom: 6px; border-bottom: 1px solid #555; }
    .letterhead .contact p { margin: 0; }
    @media print { body { margin: 12px; } }`;

/** No lines and no logo leaves the header out, so an unset tenant prints as before. */
export function letterheadHtml(letterhead: PrintLetterhead | null): string {
  if (!letterhead) return "";
  const lines = letterhead.lines.map((line) => line.trim()).filter(Boolean);
  if (!letterhead.logo && lines.length === 0) return "";
  const mark = letterhead.logo
    ? `<img src="${escapeHtml(letterhead.logo)}" alt="${escapeHtml(letterhead.companyName)}" />`
    : `<div class="company-name">${escapeHtml(letterhead.companyName)}</div>`;
  const contact = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
  return `<header class="letterhead">${mark}<div class="contact">${contact}</div></header>`;
}

/** Full HTML page for `printHtml`, with the shared font and base styles. */
export function printDocumentHtml(input: { title: string; styles: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  ${PRINT_FONT_LINK}
  <style>${BASE_STYLES}
${input.styles}
  </style>
</head>
<body>
${input.body}
</body>
</html>`;
}
