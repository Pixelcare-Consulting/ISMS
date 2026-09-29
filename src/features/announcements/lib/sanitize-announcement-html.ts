import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "pre",
  "code",
  "img",
  "span",
  "div",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "colgroup",
  "col",
];

const ALLOWED_ATTR: Record<string, string[]> = {
  a: ["href", "target", "rel", "title", "class"],
  img: ["src", "alt", "title", "class", "width", "height"],
  "*": [
    "class",
    "title",
    "colspan",
    "rowspan",
    "scope",
    "span",
    "width",
    "height",
  ],
};

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTR,
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
};

/** True when body looks like HTML from the rich editor (vs legacy plain text). */
export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/** Sanitize announcement HTML for storage and safe client render. */
export function sanitizeAnnouncementHtml(dirty: string): string {
  return sanitizeHtml(dirty, SANITIZE_OPTIONS).trim();
}

/** Plain-text excerpt for search / list cards. */
export function stripAnnouncementHtml(value: string): string {
  if (!looksLikeHtml(value)) return value;
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Prepare body for Overview / banner display:
 * - HTML posts → sanitized HTML
 * - Legacy plain text → escaped + newlines preserved via white-space CSS (caller)
 *   or convert newlines to <br> when wrapping in HTML container.
 */
export function announcementBodyToSafeHtml(body: string): {
  html: string;
  isPlainText: boolean;
} {
  if (!looksLikeHtml(body)) {
    return { html: body, isPlainText: true };
  }
  return { html: sanitizeAnnouncementHtml(body), isPlainText: false };
}
