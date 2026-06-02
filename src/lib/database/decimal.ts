/** Prisma Decimal (and similar) → plain number for RSC → client props. */
export function decimalToNumber(
  value: { toString(): string } | number | null | undefined,
): number {
  if (value == null) return 0;
  return Number(typeof value === "number" ? value : value.toString()) || 0;
}

export function decimalToNumberOrNull(
  value: { toString(): string } | number | null | undefined,
): number | null {
  if (value == null) return null;
  const n = Number(typeof value === "number" ? value : value.toString());
  return Number.isFinite(n) ? n : null;
}
