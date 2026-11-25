/**
 * Display label only: which role an approver had, for unit history rows. Never an
 * access check. Matches the seeded role slugs, like the approval history `role_slug`.
 */
const SUPPLY_PLANNING_APPROVER_SLUGS = [
  "sp",
  "spa",
  "supply_planning",
  "supply_planning_associate",
] as const;
const TEAM_LEADER_ROLE_SLUG = "tl";

export const UNIT_HISTORY_SUPPLY_PLANNING = "Supply Planning";
export const UNIT_HISTORY_TEAM_LEADER = "Team Leader";

const SUPPLY_PLANNING_SLUGS = new Set<string>(SUPPLY_PLANNING_APPROVER_SLUGS);

/**
 * Approval text follows the person's roles, not the workflow step stored on the document.
 * Supply Planning wins when they also hold Team Leader.
 */
export function unitHistoryRoleLabel(roleSlugs: readonly string[]): string | null {
  const slugs = roleSlugs.map((slug) => slug.trim().toLowerCase()).filter((slug) => slug.length > 0);
  if (slugs.some((slug) => SUPPLY_PLANNING_SLUGS.has(slug))) {
    return UNIT_HISTORY_SUPPLY_PLANNING;
  }
  if (slugs.includes(TEAM_LEADER_ROLE_SLUG)) {
    return UNIT_HISTORY_TEAM_LEADER;
  }
  return null;
}
