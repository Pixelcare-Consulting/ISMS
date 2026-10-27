jest.mock("node:crypto", () => ({
  ...jest.requireActual<typeof import("node:crypto")>("node:crypto"),
  randomInt: jest.fn(),
}));

jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchOrder: {
      findFirst: jest.fn(),
    },
  },
}));

import { randomInt } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { nextDraftOrderNumber } from "@/features/orders/lib/suggestion-pool";
import { isCanonicalSalesOrderNumber } from "@/features/pixelcare-ai/lib/sales-order-numbers";
import {
  isSalesOrderNumberConflict,
  MAX_SALES_ORDER_NUMBER_ATTEMPTS,
  nextSalesOrderNumber,
  SALES_ORDER_NUMBER_EXHAUSTED_MESSAGE,
} from "@/features/orders/utils/next-sales-order-number";
import { prisma } from "@/lib/database/client";

const randomIntMock = randomInt as unknown as jest.Mock;
const findFirst = prisma.branchOrder.findFirst as jest.Mock;

const OCTOBER = new Date(2026, 9, 27);

describe("nextSalesOrderNumber", () => {
  beforeEach(() => {
    randomIntMock.mockReset();
    findFirst.mockReset();
  });

  it("matches SO#YYYY-MM-##### for the same local month the allocator already used", async () => {
    randomIntMock.mockReturnValue(42);
    findFirst.mockResolvedValue(null);

    const orderNumber = await nextSalesOrderNumber("tenant-1", { now: OCTOBER });

    expect(orderNumber).toBe("SO#2026-10-00042");
    expect(orderNumber).toMatch(/^SO#\d{4}-\d{2}-\d{5}$/);
    expect(isCanonicalSalesOrderNumber(orderNumber)).toBe(true);
    expect(randomIntMock).toHaveBeenCalledWith(0, 100_000);
    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", orderNumber: "SO#2026-10-00042" },
      select: { id: true },
    });
  });

  it.each([
    [0, "00000"],
    [99999, "99999"],
  ])("keeps a 5-digit suffix for %s", async (rolled, suffix) => {
    randomIntMock.mockReturnValue(rolled);
    findFirst.mockResolvedValue(null);

    await expect(nextSalesOrderNumber("tenant-1", { now: OCTOBER })).resolves.toBe(
      `SO#2026-10-${suffix}`,
    );
  });

  it("tries another suffix when the first number is already used", async () => {
    randomIntMock.mockReturnValueOnce(7).mockReturnValueOnce(42);
    findFirst.mockImplementation(async (args: { where: { orderNumber: string } }) => {
      if (args.where.orderNumber === "SO#2026-10-00007") return { id: "taken" };
      return null;
    });

    const orderNumber = await nextSalesOrderNumber("tenant-1", { now: OCTOBER });

    expect(orderNumber).toBe("SO#2026-10-00042");
    expect(orderNumber).not.toBe("SO#2026-10-00007");
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenNthCalledWith(1, {
      where: { tenantId: "tenant-1", orderNumber: "SO#2026-10-00007" },
      select: { id: true },
    });
  });

  it("throws when every attempt is already used", async () => {
    randomIntMock.mockReturnValue(1234);
    findFirst.mockResolvedValue({ id: "taken" });

    await expect(nextSalesOrderNumber("tenant-1", { now: OCTOBER })).rejects.toThrow(
      SALES_ORDER_NUMBER_EXHAUSTED_MESSAGE,
    );
    expect(findFirst).toHaveBeenCalledTimes(MAX_SALES_ORDER_NUMBER_ATTEMPTS);
    expect(randomIntMock).toHaveBeenCalledTimes(MAX_SALES_ORDER_NUMBER_ATTEMPTS);
  });

  it("assigns a suggested-order draft through the same allocator", async () => {
    randomIntMock.mockReturnValue(15);
    const draftFindFirst = jest.fn().mockResolvedValue(null);
    const db = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      branchOrder: { findFirst: draftFindFirst },
    } as unknown as Prisma.TransactionClient;

    await expect(nextDraftOrderNumber(db, "tenant-2", OCTOBER)).resolves.toBe("SO#2026-10-00015");
    expect(draftFindFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-2", orderNumber: "SO#2026-10-00015" },
      select: { id: true },
    });
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("isSalesOrderNumberConflict", () => {
  it("retries only an order-number unique conflict", () => {
    expect(isSalesOrderNumberConflict({ code: "P2002", meta: { target: ["tenantId", "orderNumber"] } })).toBe(
      true,
    );
    expect(isSalesOrderNumberConflict({ code: "P2002", meta: { target: ["order_number"] } })).toBe(true);
    expect(isSalesOrderNumberConflict({ code: "P2002" })).toBe(true);
    expect(isSalesOrderNumberConflict({ code: "P2002", meta: { target: ["orderId", "level"] } })).toBe(
      false,
    );
    expect(isSalesOrderNumberConflict({ code: "P2003" })).toBe(false);
    expect(isSalesOrderNumberConflict(new Error("no"))).toBe(false);
  });
});
