import {
  UNIT_HISTORY_SUPPLY_PLANNING,
  UNIT_HISTORY_TEAM_LEADER,
  unitHistoryRoleLabel,
} from "@/features/inventory/lib/unit-history-role";

describe("unitHistoryRoleLabel", () => {
  it.each(["spa", "sp", "supply_planning", "supply_planning_associate"])(
    "labels %s as Supply Planning",
    (slug) => {
      expect(unitHistoryRoleLabel([slug])).toBe(UNIT_HISTORY_SUPPLY_PLANNING);
    },
  );

  it("keeps Team Leader when that is the person's role", () => {
    expect(unitHistoryRoleLabel(["tl"])).toBe(UNIT_HISTORY_TEAM_LEADER);
  });

  it("uses Supply Planning when the person is also a Team Leader", () => {
    expect(unitHistoryRoleLabel(["tl", "spa"])).toBe(UNIT_HISTORY_SUPPLY_PLANNING);
    expect(unitHistoryRoleLabel(["supply_planning_associate", "tl"])).toBe(
      UNIT_HISTORY_SUPPLY_PLANNING,
    );
  });

  it("does not treat another role as Team Leader", () => {
    expect(unitHistoryRoleLabel(["ps"])).toBeNull();
    expect(unitHistoryRoleLabel([])).toBeNull();
  });
});
