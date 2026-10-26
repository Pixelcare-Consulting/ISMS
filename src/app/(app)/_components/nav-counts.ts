import {
  flattenNavLinks,
  visibleCountBadgeKeys,
  type NavCountBadgeKey,
  type NavEntry,
  type NavLinkItem,
} from "@/config/app-navigation";

export type NavCountBadges = Partial<Record<NavCountBadgeKey, number>>;

function sumCountKeys(
  keys: readonly NavCountBadgeKey[],
  countBadges: NavCountBadges | undefined,
): number {
  if (!countBadges || keys.length === 0) return 0;
  let total = 0;
  for (const key of keys) {
    total += countBadges[key] ?? 0;
  }
  return total;
}

export function resolveNavLinkCount(
  item: Pick<NavLinkItem, "countBadgeKey" | "countBadgeParts">,
  permissions: string[],
  countBadges: NavCountBadges | undefined,
): number {
  return sumCountKeys(visibleCountBadgeKeys(item, permissions), countBadges);
}

export function resolveNavEntryCount(
  entry: NavEntry,
  permissions: string[],
  countBadges: NavCountBadges | undefined,
): number {
  switch (entry.type) {
    case "link":
      return resolveNavLinkCount(entry, permissions, countBadges);
    case "group":
      return flattenNavLinks(entry.items).reduce(
        (total, item) =>
          total + resolveNavLinkCount(item, permissions, countBadges),
        0,
      );
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}
