/**
 * Spread into a BranchInventory write that sets statusCodeId.
 * Same-code writes, including a branch move that keeps the current code, do not stamp.
 */
export function statusUpdatedStamp(
  previousStatus: string | null | undefined,
  nextStatus: string,
): { statusUpdatedAt: Date } | Record<string, never> {
  if (previousStatus === nextStatus) return {};
  return { statusUpdatedAt: new Date() };
}

/**
 * A unit is new when its status changed after this user opened it,
 * or after their first count if they have never opened it.
 */
export function isStatusUnread(input: {
  statusUpdatedAt: Date | null;
  readAt: Date | null;
  seenThroughAt: Date;
}): boolean {
  if (!input.statusUpdatedAt) return false;
  const seenAt = input.readAt ?? input.seenThroughAt;
  return input.statusUpdatedAt.getTime() > seenAt.getTime();
}
