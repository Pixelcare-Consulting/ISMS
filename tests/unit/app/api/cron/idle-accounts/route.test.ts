jest.mock("@/features/users/services/idle-account.service", () => ({
  runIdleAccountMaintenance: jest.fn(),
}));
jest.mock("@/lib/shared/logger", () => ({ logger: { error: jest.fn() } }));

import { GET } from "@/app/api/cron/idle-accounts/route";
import { runIdleAccountMaintenance } from "@/features/users/services/idle-account.service";

const runIdle = runIdleAccountMaintenance as jest.MockedFunction<
  typeof runIdleAccountMaintenance
>;

function call(authorization?: string) {
  return GET(
    new Request("http://app:3000/api/cron/idle-accounts", {
      headers: authorization ? { authorization } : {},
    }),
  );
}

describe("GET /api/cron/idle-accounts", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = original;
    jest.resetAllMocks();
  });

  it("stays closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await call("Bearer anything");
    expect(response.status).toBe(401);
    expect(runIdle).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    const response = await call("Bearer wrong");
    expect(response.status).toBe(401);
    expect(runIdle).not.toHaveBeenCalled();
  });

  it("returns the sweep counts for a valid bearer", async () => {
    process.env.CRON_SECRET = "s3cret";
    runIdle.mockResolvedValue({ sessionsCleared: 2, accountsDisabled: 1 });

    const response = await call("Bearer s3cret");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessionsCleared).toBe(2);
    expect(body.accountsDisabled).toBe(1);
    expect(typeof body.ranAt).toBe("string");
  });
});
