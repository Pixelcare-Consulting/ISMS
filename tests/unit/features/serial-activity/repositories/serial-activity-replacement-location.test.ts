jest.mock("@/lib/database/client", () => {
  function mockModel() {
    const calls: Record<string, jest.Mock> = {};
    return new Proxy(calls, {
      get(target, prop: string) {
        if (prop === "then") return undefined;
        if (!target[prop]) {
          target[prop] =
            prop === "count"
              ? jest.fn().mockResolvedValue(0)
              : jest.fn().mockResolvedValue([]);
        }
        return target[prop];
      },
    });
  }

  const prisma = new Proxy({} as Record<string, ReturnType<typeof mockModel>>, {
    get(target, prop: string) {
      if (prop === "then") return undefined;
      if (!target[prop]) target[prop] = mockModel();
      return target[prop];
    },
  });

  return { prisma };
});

import { formatTransactionDate } from "@/features/serial-activity/lib/transaction-snapshot";
import { serialActivityRepository } from "@/features/serial-activity/repositories/serial-activity.repository";
import { prisma } from "@/lib/database/client";

const history = prisma.serialNumberHistory as unknown as {
  findMany: jest.Mock;
  count: jest.Mock;
};
const sales = prisma.branchSalesTransaction as unknown as { findMany: jest.Mock };
const replacements = prisma.salesReplacement as unknown as { findMany: jest.Mock };

const createdAt = new Date("2026-11-20T02:00:00.000Z");

function historyRow(context: Record<string, string>) {
  return {
    id: "hist-1",
    serialNumberId: "sn-1",
    txnType: "replacement",
    details: "Replacement 1911 → STK at branch sold",
    context,
    status: "Replaced",
    createdAt,
    serialNumber: { serialNo: "OLD-SN", model: { skuCode: "SKU", name: "TV" } },
    createdBy: { name: "Ana", email: "ana@example.com" },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  history.findMany.mockResolvedValue([]);
  history.count.mockResolvedValue(0);
  sales.findMany.mockResolvedValue([]);
  replacements.findMany.mockResolvedValue([]);
});

describe("replacement serial log location", () => {
  it("fills the branch, date, and contact from the live sale when the snapshot omitted them", async () => {
    history.count.mockResolvedValue(1);
    history.findMany.mockResolvedValue([
      historyRow({
        transactionNo: "1911",
        transactionAmount: "9999",
        customerName: "pxc justine",
      }),
    ]);
    sales.findMany.mockResolvedValue([
      {
        transactionNo: "1911",
        transactionDate: new Date("2026-11-01T00:00:00.000Z"),
        customerName: "pxc justine",
        contactNo: "09181234567",
        branch: { name: "Cubao" },
        details: [{ serialNumberId: "sn-1", saleAmount: 9999, amount: 9999 }],
      },
    ]);

    const result = await serialActivityRepository.list("tenant-1", { type: "sold" });
    const event = result.items.find((item) => item.id === "history:hist-1");

    expect(event?.location).toBe("Cubao");
    expect(event?.transaction?.transactionDate).toBe(formatTransactionDate("2026-11-01"));
    expect(event?.transaction?.customerNumber).toBe("09181234567");
    expect(event?.transaction?.customerName).toBe("pxc justine");
  });

  it("uses the replacement branch and does not invent a date or contact", async () => {
    history.count.mockResolvedValue(1);
    history.findMany.mockResolvedValue([
      historyRow({
        transactionNo: "1911",
        transactionAmount: "9999",
        customerName: "pxc justine",
        returnedSerialNo: "OLD-SN",
        replacedSerialNo: "NEW-SN",
      }),
    ]);
    replacements.findMany.mockResolvedValue([
      {
        originalSerialNumberId: "sn-1",
        replacementSerialNumberId: "sn-2",
        originalInvoiceNo: "1911",
        replacementInvoiceNo: "1911",
        originalSerialNumber: { serialNo: "OLD-SN" },
        replacementSerialNumber: { serialNo: "NEW-SN" },
        sale: { branch: { name: "  " } },
        replacementBranch: { name: "Warehouse Branch" },
      },
    ]);

    const result = await serialActivityRepository.list("tenant-1", { type: "sold" });
    const event = result.items.find((item) => item.id === "history:hist-1");

    expect(event?.location).toBe("Warehouse Branch");
    expect(event?.transaction?.transactionNo).toBe("1911");
    expect(event?.transaction?.customerName).toBe("pxc justine");
    expect(event?.transaction?.transactionDate).toBeNull();
    expect(event?.transaction?.customerNumber).toBeNull();
  });
});
