jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchPulloutLine: { findMany: jest.fn(), count: jest.fn() },
    serialNumberHistory: { findMany: jest.fn(), count: jest.fn() },
  },
}));

import * as dbClient from "@/lib/database/client";
import { serialActivityRepository } from "@/features/serial-activity/repositories/serial-activity.repository";

const lines = (dbClient.prisma as unknown as { branchPulloutLine: Record<string, jest.Mock> })
  .branchPulloutLine;
const history = (dbClient.prisma as unknown as { serialNumberHistory: Record<string, jest.Mock> })
  .serialNumberHistory;

const receivedAt = new Date("2026-11-05T02:00:00.000Z");
const startedAt = new Date("2026-11-01T02:00:00.000Z");

const pullout = {
  pulloutNo: "PLT-1",
  branch: { name: "Branch A" },
  warehouse: { name: "Main" },
};
const serialNumber = { serialNo: "SN1", model: { skuCode: "SKU1", name: "Model One" } };

beforeEach(() => {
  jest.clearAllMocks();
  history.findMany.mockResolvedValue([]);
  history.count.mockResolvedValue(0);
  // The same mock answers both pull-out sources, told apart by the receivedAt filter.
  lines.findMany.mockImplementation(async ({ where }) =>
    where.receivedAt
      ? [
          {
            id: "line1",
            receivedAt,
            priorStatusCode: { code: "DEF" },
            receivedLocation: { code: "A1" },
            receivedBy: { name: "Receiver", email: "receiver@example.com" },
            serialNumber,
            pullout,
          },
        ]
      : [
          {
            id: "line1",
            serialNumber,
            pullout: {
              ...pullout,
              createdAt: startedAt,
              waybillNo: null,
              notes: null,
              warehouseLocation: null,
              statusCode: { name: "Completed" },
              reasonStatusCode: null,
              createdBy: { name: "Requester", email: "requester@example.com" },
              approvalLevels: [],
            },
          },
        ],
  );
  lines.count.mockResolvedValue(1);
});

describe("Serial Log pull-out receipts", () => {
  it("shows the receipt as its own event, dated when the unit arrived", async () => {
    const result = await serialActivityRepository.list("t1", { type: "pulled_out" });

    expect(result.total).toBe(2);
    const received = result.items.find((event) => event.id === "pulled_out_received:line1");
    expect(received).toMatchObject({
      type: "pulled_out",
      typeLabel: "Pull-out received",
      timestamp: receivedAt,
      serialNo: "SN1",
      location: "Main · A1",
      reference: "PLT-1",
      status: "Received: DEF",
    });
  });

  it("only reads received lines for that event", async () => {
    await serialActivityRepository.list("t1", { type: "pulled_out" });

    const receivedCall = lines.findMany.mock.calls.find(([args]) => args.where.receivedAt);
    expect(receivedCall?.[0].where.receivedAt).toEqual({ not: null });
    expect(receivedCall?.[0].orderBy).toEqual({ receivedAt: "desc" });
  });

  it("filters receipts by when they arrived", async () => {
    await serialActivityRepository.list("t1", { type: "pulled_out", dateFrom: "2026-11-05" });

    const receivedCall = lines.findMany.mock.calls.find(([args]) => args.where.receivedAt);
    expect(receivedCall?.[0].where.receivedAt).toEqual(
      expect.objectContaining({ not: null, gte: expect.any(Date) }),
    );
  });
});
