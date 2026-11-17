import type { Prisma } from "@/lib/database/generated/prisma/client";

/** Next REPL-###### number for the tenant. Branch and service center replacements share it. */
export async function nextReplacementNo(
  tenantId: string,
  tx: Pick<Prisma.TransactionClient, "salesReplacement">,
): Promise<string> {
  const count = await tx.salesReplacement.count({ where: { tenantId } });
  return `REPL-${String(count + 1).padStart(6, "0")}`;
}
