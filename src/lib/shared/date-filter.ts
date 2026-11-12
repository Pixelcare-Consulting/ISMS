import type { Prisma } from "@/lib/database/generated/prisma/client";

/** Local-day boundary: start → 00:00:00.000, end → 23:59:59.999. */
function parseDateBoundary(value: string, boundary: "start" | "end"): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (boundary === "start") {
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

export function buildDateFilter(
  dateFrom?: string,
  dateTo?: string,
): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) return undefined;
  return {
    ...(dateFrom ? { gte: parseDateBoundary(dateFrom, "start") } : {}),
    ...(dateTo ? { lte: parseDateBoundary(dateTo, "end") } : {}),
  };
}
