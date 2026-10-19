/**
 * Name shown under the SKU.
 * When the stored name repeats the code at the end, the code is not shown twice.
 */
export function displayModelName(skuCode: string, name: string): string {
  const code = skuCode.trim();
  const label = name.trim();
  if (!code || !label) return label;
  if (label.toLowerCase() === code.toLowerCase()) return "";
  if (!label.toLowerCase().endsWith(code.toLowerCase())) return label;
  return label
    .slice(0, label.length - code.length)
    .replace(/[\s\-–—/|]+$/u, "")
    .trim();
}
