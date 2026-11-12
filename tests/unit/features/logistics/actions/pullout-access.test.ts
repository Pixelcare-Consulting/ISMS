import {
  getPulloutDetailAction,
  getPulloutKpisAction,
  listPulloutsAction,
} from "@/features/logistics/actions/logistics.actions";

let mockPermissions: string[] = [];

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

// Keeps the real allow/deny decision so a wrong slug in an action fails the test.
jest.mock("@/lib/auth/permissions", () => {
  const session = () => ({
    user: { id: "user-1", tenantId: "tenant-1", permissions: mockPermissions },
  });
  return {
    hasPermission: (permissions: string[] | undefined, slug: string) =>
      Boolean(permissions?.includes(slug)),
    requirePermission: jest.fn(async (slug: string) => {
      if (!mockPermissions.includes(slug)) throw new Error("FORBIDDEN");
      return session();
    }),
    requireAnyPermission: jest.fn(async (slugs: string[]) => {
      if (!slugs.some((slug) => mockPermissions.includes(slug))) throw new Error("FORBIDDEN");
      return session();
    }),
  };
});

jest.mock("@/lib/database/client", () => ({ prisma: {} }));

jest.mock("@/features/logistics/repositories/logistics.repository", () => ({
  logisticsRepository: {
    listPullouts: jest.fn(async () => ({ items: [], total: 0, page: 1, limit: 25 })),
    countPulloutsByStatus: jest.fn(async () => []),
    countAllPullouts: jest.fn(async () => 0),
  },
}));

jest.mock("@/features/logistics/services/pullout-posting.service", () => ({
  pulloutPostingService: { getDetail: jest.fn(async () => ({ id: "pullout-1" })) },
}));

jest.mock("@/features/reason-status/services/reason-status.service", () => ({
  reasonStatusService: { listActiveCodes: jest.fn(async () => []) },
}));

const viewActions: Array<[string, () => Promise<unknown>]> = [
  ["list", () => listPulloutsAction()],
  ["detail", () => getPulloutDetailAction("pullout-1")],
  ["kpis", () => getPulloutKpisAction()],
];

describe("pull-out view access", () => {
  it.each(viewActions)("%s opens with pullouts.view", async (_name, action) => {
    mockPermissions = ["pullouts.view"];
    await expect(action()).resolves.toBeDefined();
  });

  it.each(viewActions)("%s stays closed on the old logistics gate", async (_name, action) => {
    mockPermissions = ["logistics.view", "logistics.manage", "orders.view", "orders.create"];
    await expect(action()).rejects.toThrow("FORBIDDEN");
  });
});
