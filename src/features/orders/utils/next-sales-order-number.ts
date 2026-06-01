import { prisma } from "@/lib/database/client";

function currentYearMonth(d = new Date()): { year: number; month: string; prefix: string } {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return { year, month, prefix: `SO#${year}-${month}-` };
}

/**
 * Monthly sequential sales order number per tenant: SO#{YYYY}-{MM}-00001
 */
export async function nextSalesOrderNumber(tenantId: string): Promise<string> {
  const { prefix } = currentYearMonth();

  return prisma.$transaction(async (tx) => {
    const latest = await tx.branchOrder.findFirst({
      where: { tenantId, orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });

    let next = 1;
    if (latest?.orderNumber) {
      const suffix = latest.orderNumber.slice(prefix.length);
      const parsed = Number.parseInt(suffix, 10);
      if (Number.isFinite(parsed)) next = parsed + 1;
    }

    return `${prefix}${String(next).padStart(5, "0")}`;
  });
}
