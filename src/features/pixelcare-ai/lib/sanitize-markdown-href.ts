/** Strip trailing markdown emphasis the model sometimes glues onto URLs. */
export function sanitizeMarkdownHref(href: string | undefined): string | undefined {
  if (!href) return href;
  return href.replace(/[\*_~]+$/g, "");
}
