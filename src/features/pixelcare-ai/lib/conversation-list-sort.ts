export type ConversationSortFields = {
  pinnedAt: string | null;
  updatedAt: string;
};

/**
 * Pinned first (most recently pinned), then by updatedAt desc.
 * Mirrors repository list order for optimistic UI updates.
 */
export function sortConversationListItems<T extends ConversationSortFields>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const aPinned = a.pinnedAt ? Date.parse(a.pinnedAt) : Number.NaN;
    const bPinned = b.pinnedAt ? Date.parse(b.pinnedAt) : Number.NaN;
    const aIsPinned = Number.isFinite(aPinned);
    const bIsPinned = Number.isFinite(bPinned);

    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    if (aIsPinned && bIsPinned && aPinned !== bPinned) {
      return bPinned - aPinned;
    }

    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}
