import {
  assessConfirmation,
  confirmationDenialMessage,
  hashOrderableLines,
} from "@/features/pixelcare-ai/automations/line-hash";
import type { ReplenishmentLine } from "@/features/pixelcare-ai/automations/proposal-lines";

const lines: ReplenishmentLine[] = [
  { sku: "SKU1", modelId: "model-1", shelfMax: 10, stk: 4, sug: 6, exceptions: [] },
];

function row(overrides?: Partial<{ lineHash: string; usedAt: Date | null; expiresAt: Date }>) {
  return {
    userId: "user-1",
    proposalId: "proposal-1",
    lineHash: overrides?.lineHash ?? hashOrderableLines(lines),
    expiresAt: overrides?.expiresAt ?? new Date("2026-10-16T12:15:00.000Z"),
    usedAt: overrides?.usedAt ?? null,
  };
}

const base = {
  actorUserId: "user-1",
  proposalId: "proposal-1",
  currentLineHash: hashOrderableLines(lines),
  now: new Date("2026-10-16T12:00:00.000Z"),
  canCreate: true,
  branchInScope: true,
  isOwner: true,
};

describe("replenishment confirmation", () => {
  it("changes the hash when an orderable line changes", () => {
    const next = hashOrderableLines([{ ...lines[0]!, sug: 9 }]);
    expect(next).not.toBe(hashOrderableLines(lines));
  });

  it("rejects confirm without a token, a changed hash, a reused token, or lost permission", () => {
    expect(assessConfirmation({ ...base, row: null }).ok).toBe(false);

    const changed = assessConfirmation({
      ...base,
      row: row(),
      currentLineHash: "different",
    });
    expect(changed).toEqual({ ok: false, reason: "hash" });

    const reused = assessConfirmation({
      ...base,
      row: row({ usedAt: new Date("2026-10-16T11:00:00.000Z") }),
    });
    expect(reused).toEqual({ ok: false, reason: "used" });

    const lost = assessConfirmation({ ...base, row: row(), canCreate: false });
    expect(lost).toEqual({ ok: false, reason: "permission" });

    const outside = assessConfirmation({ ...base, row: row(), branchInScope: false });
    expect(outside).toEqual({ ok: false, reason: "scope" });

    expect(assessConfirmation({ ...base, row: row() })).toEqual({ ok: true });
    expect(confirmationDenialMessage("used")).toContain("already used");
  });
});
