jest.mock("@/features/pixelcare-ai/automations/run-scheduled", () => ({
  runDueAiAutomations: jest.fn(),
}));
jest.mock("@/lib/shared/logger", () => ({ logger: { error: jest.fn() } }));

import { GET } from "@/app/api/cron/ai-automations/route";
import { runDueAiAutomations } from "@/features/pixelcare-ai/automations/run-scheduled";

const runDue = runDueAiAutomations as jest.MockedFunction<typeof runDueAiAutomations>;

function call(authorization?: string) {
  return GET(
    new Request("http://app:3000/api/cron/ai-automations", {
      headers: authorization ? { authorization } : {},
    }),
  );
}

describe("GET /api/cron/ai-automations", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = original;
    jest.resetAllMocks();
  });

  it("stays closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await call("Bearer anything");
    expect(response.status).toBe(401);
    expect(runDue).not.toHaveBeenCalled();
  });

  it.each([[undefined], ["Bearer wrong"]])("rejects a missing or wrong secret (%s)", async (header) => {
    process.env.CRON_SECRET = "s3cret";
    const response = await call(header);
    expect(response.status).toBe(401);
    expect(runDue).not.toHaveBeenCalled();
  });

  it("returns the scheduler outcomes for a valid bearer", async () => {
    process.env.CRON_SECRET = "s3cret";
    runDue.mockResolvedValue([
      {
        automationId: "auto-1",
        tenantId: "tenant-1",
        slot: "2026-10-16T08:00",
        outcome: "failed",
        error: "Executor for template replenishment_review is not implemented",
        runId: "run-1",
      },
    ]);

    const response = await call("Bearer s3cret");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.outcomes).toEqual([
      expect.objectContaining({ outcome: "failed", runId: "run-1" }),
    ]);
    expect(typeof body.ranAt).toBe("string");
  });
});