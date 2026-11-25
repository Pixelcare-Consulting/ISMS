jest.mock("@/lib/database/client", () => ({
  prisma: {
    user: { findMany: jest.fn() },
  },
}));

import { orderRepository } from "@/features/orders/repositories/order.repository";
import { prisma } from "@/lib/database/client";

const findMany = prisma.user.findMany as jest.Mock;

describe("orderRepository.listTeamLeaderOptions", () => {
  it("lists every active user holding the Team Leader review checkbox", async () => {
    findMany.mockResolvedValue([
      { id: "tl-maria", name: "Maria Santos", email: "maria@example.com" },
    ]);

    await expect(orderRepository.listTeamLeaderOptions("tenant-1")).resolves.toEqual([
      { id: "tl-maria", name: "Maria Santos", email: "maria@example.com" },
    ]);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        deletedAt: null,
        disabledAt: null,
        userRoles: {
          some: {
            role: {
              tenantId: "tenant-1",
              deletedAt: null,
              rolePermissions: {
                some: { permission: { slug: "orders.auto_replenish.approve_tl" } },
              },
            },
          },
        },
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty("aors");
  });
});
