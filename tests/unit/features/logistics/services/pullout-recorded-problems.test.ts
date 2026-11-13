jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchDefectReport: { findMany: jest.fn() },
    branchReturnRequest: { findMany: jest.fn() },
  },
}));

import { prisma } from "@/lib/database/client";
import { recordedProblemsBySerial } from "@/features/logistics/services/pullout-recorded-problems";

const defects = prisma.branchDefectReport.findMany as unknown as jest.Mock;
const returns = prisma.branchReturnRequest.findMany as unknown as jest.Mock;

const day = (d: number) => new Date(`2026-11-${String(d).padStart(2, "0")}T00:00:00Z`);

beforeEach(() => {
  defects.mockReset().mockResolvedValue([]);
  returns.mockReset().mockResolvedValue([]);
});

describe("recordedProblemsBySerial", () => {
  it("skips the queries when there are no serials", async () => {
    await expect(recordedProblemsBySerial("t1", [])).resolves.toEqual(new Map());
    expect(defects).not.toHaveBeenCalled();
  });

  it("uses approved defect tags and sales returns that were not rejected", async () => {
    await recordedProblemsBySerial("t1", ["s1"]);
    expect(defects.mock.calls[0][0].where).toMatchObject({ status: "approved" });
    expect(returns.mock.calls[0][0].where).toMatchObject({ status: { not: "rejected" } });
  });

  it("keeps the newest problem per serial across both sources", async () => {
    defects.mockResolvedValue([
      { serialNumberId: "s1", reason: "No power", reportedAt: day(1), decidedAt: day(3) },
      { serialNumberId: "s2", reason: "Cracked screen", reportedAt: day(5), decidedAt: null },
    ]);
    returns.mockResolvedValue([
      {
        createdAt: day(4),
        problemDescriptionText: "Dead on arrival; No sound",
        problemDescription: { name: "Dead on arrival" },
        saleDetail: { serialNumberId: "s1" },
        sale: { details: [] },
      },
      {
        createdAt: day(2),
        problemDescriptionText: null,
        problemDescription: { name: "Overheats" },
        saleDetail: { serialNumberId: "s2" },
        sale: { details: [] },
      },
    ]);

    const result = await recordedProblemsBySerial("t1", ["s1", "s2"]);

    expect(result).toEqual(
      new Map([
        ["s1", "Dead on arrival; No sound"],
        ["s2", "Cracked screen"],
      ]),
    );
  });

  it("reads an older return that names only the sale, for the serials asked about", async () => {
    returns.mockResolvedValue([
      {
        createdAt: day(4),
        problemDescriptionText: "No power",
        problemDescription: null,
        saleDetail: null,
        sale: { details: [{ serialNumberId: "s1" }, { serialNumberId: "other" }] },
      },
    ]);

    const result = await recordedProblemsBySerial("t1", ["s1"]);

    expect(result).toEqual(new Map([["s1", "No power"]]));
  });

  it("ignores blank problem text", async () => {
    defects.mockResolvedValue([
      { serialNumberId: "s1", reason: "  ", reportedAt: day(1), decidedAt: day(1) },
    ]);
    await expect(recordedProblemsBySerial("t1", ["s1"])).resolves.toEqual(new Map());
  });
});
