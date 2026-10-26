import { prisma } from "@/lib/database/client";
import { inventoryRepository } from "@/features/inventory/repositories/inventory.repository";

jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchDeliveryLine: { findMany: jest.fn() },
    branchTransferLine: { findMany: jest.fn() },
  },
}));

const findMany = prisma.branchDeliveryLine.findMany as jest.Mock;
const findTransferLines = prisma.branchTransferLine.findMany as jest.Mock;

function line(
  serialNumberId: string,
  delivery: Partial<{
    deliveryNo: string;
    drNo: string | null;
    drDate: Date | null;
    acceptedAt: Date | null;
    createdAt: Date;
  }>,
) {
  return {
    serialNumberId,
    delivery: {
      deliveryNo: "DLV-1",
      drNo: null,
      drDate: null,
      acceptedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      ...delivery,
    },
  };
}

describe("inventoryRepository.findLatestDeliveryReceipts", () => {
  beforeEach(() => {
    findMany.mockReset();
    findTransferLines.mockReset();
    findTransferLines.mockResolvedValue([]);
  });

  it("DIT unit shows DR# from drNo", async () => {
    const drDate = new Date("2026-10-10T00:00:00.000Z");
    findMany.mockResolvedValue([
      line("sn-1", { deliveryNo: "DLV-9", drNo: "DR-5001", drDate }),
    ]);

    const [row] = await inventoryRepository.findLatestDeliveryReceipts("t1", [
      "sn-1",
    ]);

    expect(row.deliveryNo).toBe("DR-5001");
    expect(row.internalDeliveryNo).toBe("DLV-9");
    expect(row.deliveryDate).toEqual(drDate);
  });

  it("legacy accepted delivery falls back to deliveryNo and acceptedAt", async () => {
    const acceptedAt = new Date("2026-03-05T00:00:00.000Z");
    findMany.mockResolvedValue([
      line("sn-1", { deliveryNo: "DLV-2", acceptedAt }),
    ]);

    const [row] = await inventoryRepository.findLatestDeliveryReceipts("t1", [
      "sn-1",
    ]);

    expect(row.deliveryNo).toBe("DLV-2");
    expect(row.deliveryDate).toEqual(acceptedAt);
  });

  it("rejected delivery without acceptedAt is excluded", async () => {
    findMany.mockResolvedValue([]);
    await inventoryRepository.findLatestDeliveryReceipts("t1", ["sn-1"]);

    const where = findMany.mock.calls[0][0].where;
    expect(where.delivery.OR).toEqual([
      { acceptedAt: { not: null } },
      { statusCode: { code: { in: ["pending", "partial", "accepted"] } } },
    ]);
  });

  it("keeps the delivery with the latest date per serial", async () => {
    findMany.mockResolvedValue([
      line("sn-1", { deliveryNo: "OLD", createdAt: new Date("2026-01-01") }),
      line("sn-1", { deliveryNo: "NEW", drNo: "DR-2", drDate: new Date("2026-05-01") }),
    ]);
    const rows = await inventoryRepository.findLatestDeliveryReceipts("t1", ["sn-1"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].deliveryNo).toBe("DR-2");
  });

  it("shows the transfer delivery receipt number and keeps the original date", async () => {
    const drDate = new Date("2026-02-01T00:00:00.000Z");
    findMany.mockResolvedValue([
      line("sn-1", { deliveryNo: "DLV-1", drNo: "DR-OLD", drDate }),
    ]);
    findTransferLines.mockResolvedValue([
      {
        serialNumberId: "sn-1",
        decidedAt: new Date("2026-10-26T00:00:00.000Z"),
        transfer: { drNo: "DR-XFR", transferNo: "XFR-1" },
      },
    ]);

    const [row] = await inventoryRepository.findLatestDeliveryReceipts("t1", ["sn-1"]);
    expect(row.deliveryNo).toBe("DR-XFR");
    expect(row.deliveryDate).toEqual(drDate);
  });
});
