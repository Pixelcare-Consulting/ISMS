jest.mock("@/lib/database/client", () => ({
  prisma: { sapServiceLayerConfig: { findMany: jest.fn() } },
}));
jest.mock("@/lib/shared/logger", () => ({ logger: { error: jest.fn() } }));
jest.mock("@/features/sap/services/sap-change-check", () => ({ runSapChangeCheck: jest.fn() }));
jest.mock("@/features/sap/services/sap-change-notifier", () => ({
  purgeClosedSapChangeNotifications: jest.fn().mockResolvedValue(2),
}));

import { GET } from "@/app/api/cron/sap-check/route";
import { runSapChangeCheck } from "@/features/sap/services/sap-change-check";
import { prisma } from "@/lib/database/client";

const findConfigs = prisma.sapServiceLayerConfig.findMany as jest.Mock;
const runCheck = runSapChangeCheck as jest.MockedFunction<typeof runSapChangeCheck>;

function call(authorization?: string) {
  return GET(
    new Request("http://app:3000/api/cron/sap-check", {
      headers: authorization ? { authorization } : {},
    }),
  );
}

describe("GET /api/cron/sap-check", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });

  it("stays closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await call("Bearer anything");
    expect(response.status).toBe(401);
    expect(runCheck).not.toHaveBeenCalled();
  });

  it.each([[undefined], ["Bearer wrong"]])("rejects a missing or wrong secret (%s)", async (header) => {
    process.env.CRON_SECRET = "s3cret";
    const response = await call(header);
    expect(response.status).toBe(401);
    expect(findConfigs).not.toHaveBeenCalled();
  });

  it("checks every tenant with SAP enabled, isolating a failing one", async () => {
    process.env.CRON_SECRET = "s3cret";
    findConfigs.mockResolvedValue([{ tenantId: "t1" }, { tenantId: "t2" }]);
    runCheck
      .mockRejectedValueOnce(new Error("SAP unreachable"))
      .mockResolvedValueOnce([{ syncKey: "warehouse", outcome: "none" }]);

    const response = await call("Bearer s3cret");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tenants).toEqual([
      { tenantId: "t1", error: "SAP unreachable" },
      { tenantId: "t2", checks: [{ syncKey: "warehouse", outcome: "none" }] },
    ]);
    expect(body.purged).toBe(2);
  });
});
