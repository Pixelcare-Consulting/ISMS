import { AI_ASSISTANT_CEILINGS } from "@/features/ai/constants/assistant-limits";
import { reserveAiRequest } from "@/lib/cache/ai-limits";

function limits() {
  return { ...AI_ASSISTANT_CEILINGS };
}

function tenantId() {
  return `t-${Math.random().toString(36).slice(2)}`;
}

describe("AI request limits", () => {
  it("allows a request in process memory when Redis is not configured, until the local cap is full", async () => {
    const tenant = tenantId();
    const tight = {
      ...limits(),
      maxRequestsPerUser: 1,
      maxRequestsPerTenant: 1,
      maxUserConcurrency: 2,
      maxTenantConcurrency: 4,
    };

    const first = await reserveAiRequest({
      tenantId: tenant,
      userId: "u",
      limits: tight,
      client: null,
    });
    expect(first.ok).toBe(true);
    if (first.ok) await first.release();

    const overUser = await reserveAiRequest({
      tenantId: tenant,
      userId: "u",
      limits: tight,
      client: null,
    });
    expect(overUser).toEqual({ ok: false, reason: "rate" });

    const overCompany = await reserveAiRequest({
      tenantId: tenant,
      userId: "other",
      limits: { ...tight, maxRequestsPerUser: 5 },
      client: null,
    });
    expect(overCompany).toEqual({ ok: false, reason: "rate" });

    const busyTenant = tenantId();
    const held = await reserveAiRequest({
      tenantId: busyTenant,
      userId: "u",
      limits: { ...limits(), maxUserConcurrency: 1 },
      client: null,
    });
    expect(held.ok).toBe(true);
    const busy = await reserveAiRequest({
      tenantId: busyTenant,
      userId: "u",
      limits: { ...limits(), maxUserConcurrency: 1 },
      client: null,
    });
    expect(busy).toEqual({ ok: false, reason: "concurrency" });
    if (held.ok) await held.release();
  });

  it("denies the request when a configured Redis client errors", async () => {
    const failing = {
      incr: jest.fn(async () => {
        throw new Error("redis down");
      }),
      decr: jest.fn(async () => 0),
      expire: jest.fn(async () => 1),
    };
    await expect(
      reserveAiRequest({ tenantId: tenantId(), userId: "u", limits: limits(), client: failing }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("stops a request over the user limit and a tool loop at the step cap", async () => {
    let count = 0;
    const client = {
      incr: jest.fn(async (key: string) => {
        count += 1;
        if (key.includes(":rate:user:")) return AI_ASSISTANT_CEILINGS.maxRequestsPerUser + 1;
        return 1;
      }),
      decr: jest.fn(async () => 0),
      expire: jest.fn(async () => 1),
    };
    const result = await reserveAiRequest({
      tenantId: "t",
      userId: "u",
      limits: limits(),
      client,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rate");
    expect(count).toBeGreaterThan(0);
  });
});
