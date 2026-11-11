import type { PrismaClient } from "@prisma/client";

import { seedTestAccountAors } from "../../../prisma/seed-test-accounts";
import {
  DEMO_USERS,
  resolveSeedProfile,
  ROLES,
  TEST_ACCOUNT_BRANCH_AORS,
} from "../../../prisma/seed-data";

const TENANT = "tenant-1";
const USERS = {
  "tl@demo.local": { id: "tl" },
  "ps@demo.local": { id: "ps" },
  "receiver@demo.local": { id: "receiver" },
};
const BRANCHES = [
  { id: "alturas", sapCode: "ABB001" },
  { id: "icm", sapCode: "ABB002" },
];

function fakePrisma(input: {
  branches?: typeof BRANCHES;
  existing?: { userId: string; branchId: string }[];
}) {
  const existing = input.existing ?? [];
  const aorCreate = jest.fn<Promise<object>, [{ data: Record<string, unknown> }]>(
    async () => ({}),
  );
  const prisma = {
    branch: { findMany: jest.fn(async () => input.branches ?? BRANCHES) },
    aor: {
      findFirst: jest.fn(
        async ({ where }: { where: { userId: string; branchId: string } }) =>
          existing.some(
            (row) => row.userId === where.userId && row.branchId === where.branchId,
          )
            ? { id: "existing" }
            : null,
      ),
      create: aorCreate,
    },
  };
  return { prisma: prisma as unknown as PrismaClient, aorCreate };
}

function createdPairs(aorCreate: jest.Mock) {
  return aorCreate.mock.calls
    .map(([arg]) => `${arg.data.userId}:${arg.data.branchId}`)
    .sort();
}

describe("seedTestAccountAors", () => {
  it("is reachable as its own seed profile", () => {
    process.env.SEED_PROFILE = "test-accounts";

    expect(resolveSeedProfile()).toBe("test-accounts");

    delete process.env.SEED_PROFILE;
  });

  it("assigns each test account to its branches", async () => {
    const { prisma, aorCreate } = fakePrisma({});

    await seedTestAccountAors(prisma, TENANT, USERS);

    expect(createdPairs(aorCreate)).toEqual([
      "ps:icm",
      "receiver:alturas",
      "tl:alturas",
      "tl:icm",
    ]);
    expect(aorCreate.mock.calls[0]?.[0].data).toMatchObject({ tenantId: TENANT, status: "active" });
  });

  it("does not repeat a row that exists, so re-seeding is safe", async () => {
    const { prisma, aorCreate } = fakePrisma({
      existing: [
        { userId: "tl", branchId: "alturas" },
        { userId: "ps", branchId: "icm" },
      ],
    });

    await seedTestAccountAors(prisma, TENANT, USERS);

    expect(createdPairs(aorCreate)).toEqual(["receiver:alturas", "tl:icm"]);
  });

  it("skips a branch this database does not have", async () => {
    const { prisma, aorCreate } = fakePrisma({ branches: [{ id: "icm", sapCode: "ABB002" }] });

    await seedTestAccountAors(prisma, TENANT, USERS);

    expect(createdPairs(aorCreate)).toEqual(["ps:icm", "tl:icm"]);
  });

  it("skips an account that was not seeded", async () => {
    const { prisma, aorCreate } = fakePrisma({});

    await seedTestAccountAors(prisma, TENANT, { "tl@demo.local": { id: "tl" } });

    expect(createdPairs(aorCreate)).toEqual(["tl:alturas", "tl:icm"]);
  });
});

describe("test account seed data", () => {
  it("only names accounts the seed creates", () => {
    const seeded = DEMO_USERS.map((user) => user.email as string);

    for (const { email } of TEST_ACCOUNT_BRANCH_AORS) {
      expect(seeded).toContain(email);
    }
  });

  it("seeds the receiver with a role that can accept a transfer", () => {
    const receiver = DEMO_USERS.find((user) => user.email === "receiver@demo.local");
    const role = ROLES.find((row) => row.slug === receiver?.roleSlug);

    expect(role?.permissions).toEqual(
      expect.arrayContaining(["logistics.view", "logistics.create"]),
    );
  });
});
