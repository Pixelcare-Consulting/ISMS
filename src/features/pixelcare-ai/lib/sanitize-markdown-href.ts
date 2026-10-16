/** Allow same-app paths and https links. Block scripts, data URLs, and protocol-relative links. */
export function sanitizeMarkdownHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const cleaned = href.replace(/[\*_~]+$/g, "").trim();
  if (!cleaned || /\s/.test(cleaned)) return undefined;
  const lower = cleaned.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    cleaned.startsWith("//") ||
    cleaned.startsWith("\\")
  ) {
    return undefined;
  }
  if (cleaned.startsWith("/")) return cleaned;
  if (lower.startsWith("https://")) return cleaned;
  return undefined;
}
