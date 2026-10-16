jest.mock("@/lib/database/client", () => ({
  prisma: {
    branchOrder: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/aor/scope", () => ({
  getUserBranchIds: jest.fn(),
}));

jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, permission: string) =>
    permissions?.includes(permission) ?? false,
}));

import { findOrderStatuses } from "@/features/pixelcare-ai/tools/find-order-status";
import { getUserBranchIds } from "@/lib/aor/scope";
import { prisma } from "@/lib/database/client";

const IN_SCOPE = "SO#2026-10-00009";
const OUT_OF_SCOPE = "SO#2026-10-00010";
const MISSING = "SO#2026-10-99999";

const ORDERS = [
  {
    id: "order-in",
    orderNumber: IN_SCOPE,
    status: "draft" as const,
    orderType: "manual" as const,
    branch: { id: "branch-a", name: "Store A" },
    approvalLevels: [],
  },
  {
    id: "order-out",
    orderNumber: OUT_OF_SCOPE,
    status: "approved" as const,
    orderType: "manual" as const,
    branch: { id: "branch-b", name: "Store B" },
    approvalLevels: [],
  },
];

type LookupWhere = {
  tenantId?: string;
  branchId?: { in?: string[] };
  OR?: Array<{ orderNumber: { equals: string } }>;
  orderNumber?: { contains?: string };
};

function matchesWhere(order: (typeof ORDERS)[number], where: LookupWhere): boolean {
  if (where.tenantId && where.tenantId !== "tenant-1") return false;
  const branchIn = where.branchId?.in;
  if (branchIn && !branchIn.includes(order.branch.id)) return false;
  if (where.OR && where.OR.length > 0) {
    return where.OR.some(
      (clause) => clause.orderNumber.equals.toLowerCase() === order.orderNumber.toLowerCase(),
    );
  }
  if (where.orderNumber?.contains) {
    return order.orderNumber.toLowerCase().includes(where.orderNumber.contains.toLowerCase());
  }
  return false;
}

describe("findOrderStatuses", () => {
  const findMany = prisma.branchOrder.findMany as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (getUserBranchIds as jest.Mock).mockResolvedValue(["branch-a"]);
    findMany.mockImplementation(async (args: { where: LookupWhere }) =>
      ORDERS.filter((order) => matchesWhere(order, args.where)),
    );
  });

  it("keeps the hash, hides orders outside branch scope, and marks a missing number as a miss", async () => {
    const result = await findOrderStatuses({
      tenantId: "tenant-1",
      userId: "user-1",
      permissions: ["orders.manual.view"],
      orderNumbers: [IN_SCOPE, OUT_OF_SCOPE, MISSING],
    });

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(getUserBranchIds).toHaveBeenCalledWith("tenant-1", "user-1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          branchId: { in: ["branch-a"] },
          OR: [
            { orderNumber: { equals: IN_SCOPE, mode: "insensitive" } },
            { orderNumber: { equals: OUT_OF_SCOPE, mode: "insensitive" } },
            { orderNumber: { equals: MISSING, mode: "insensitive" } },
          ],
        }),
      }),
    );

    expect(result.orders.map((order) => order.orderNumber)).toEqual([IN_SCOPE]);
    expect(result.orders[0]).toEqual(
      expect.objectContaining({
        orderNumber: IN_SCOPE,
        status: "draft",
        statusLabel: "Draft",
        href: "/orders/manual",
      }),
    );
    expect(result.orders.some((order) => order.orderNumber === OUT_OF_SCOPE)).toBe(false);
    expect(result.orders.some((order) => order.status === "approved")).toBe(false);

    expect(result.lookups).toEqual([
      expect.objectContaining({ query: IN_SCOPE, found: true }),
      {
        query: OUT_OF_SCOPE,
        found: false,
        note: "Not found in your access scope.",
      },
      {
        query: MISSING,
        found: false,
        note: "Not found in your access scope.",
      },
    ]);
    expect(result.misses).toEqual([OUT_OF_SCOPE, MISSING]);
    expect(result.lookups[1]).not.toHaveProperty("status");
    expect(result.lookups[1]).not.toHaveProperty("statusLabel");
    expect(result.lookups[2]).not.toHaveProperty("status");
    expect(result.lookups[2]).not.toHaveProperty("orders");
  });

  it("looks up message numbers and ignores extra numbers supplied by the model", async () => {
    const result = await findOrderStatuses({
      tenantId: "tenant-1",
      userId: "user-1",
      permissions: ["orders.manual.view"],
      fromMessage: [IN_SCOPE],
      orderNumbers: [OUT_OF_SCOPE],
    });

    if ("error" in result) throw new Error(result.error);

    expect(result.lookups.map((lookup) => lookup.query)).toEqual([IN_SCOPE]);
    expect(result.orders.map((order) => order.orderNumber)).toEqual([IN_SCOPE]);
    expect(result.misses).toEqual([]);
  });
});
