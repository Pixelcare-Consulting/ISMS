import { PROVIDER_ONLY_ROLE_SLUGS } from "@/features/roles/constants/role.constants";
import { ACCOUNT_IDLE_DISABLE_MS } from "@/lib/auth/account-activity";
import { deleteIdleSessions } from "@/lib/auth/session-liveness";
import { prisma } from "@/lib/database/client";

/**
 * Drop sessions idle longer than 30 minutes, then turn off accounts with no
 * activity for 7 days. Super Admin is skipped. Activity is `User.lastActiveAt`,
 * which is the newest session activity kept after the session row is deleted,
 * or `createdAt` when they never signed in.
 */
export async function runIdleAccountMaintenance(now = new Date()): Promise<{
  sessionsCleared: number;
  accountsDisabled: number;
}> {
  const sessionsCleared = await deleteIdleSessions(now);
  const accountsDisabled = await disableQuietAccounts(now);
  return { sessionsCleared, accountsDisabled };
}

async function disableQuietAccounts(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - ACCOUNT_IDLE_DISABLE_MS);
  const quiet = await prisma.user.findMany({
    where: {
      deletedAt: null,
      disabledAt: null,
      userRoles: {
        none: {
          role: { slug: { in: Array.from(PROVIDER_ONLY_ROLE_SLUGS) } },
        },
      },
      OR: [
        { lastActiveAt: { lt: cutoff } },
        { AND: [{ lastActiveAt: null }, { createdAt: { lt: cutoff } }] },
      ],
    },
    select: { id: true },
  });
  const ids = quiet.map((user) => user.id);
  if (ids.length === 0) return 0;

  await prisma.user.updateMany({
    where: { id: { in: ids }, disabledAt: null },
    data: { disabledAt: now },
  });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  return ids.length;
}
