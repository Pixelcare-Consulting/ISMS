import { clampAiAssistantLimits, readAiAssistantGate } from "@/features/ai/services/assistant-policy.service";
import { AI_ASSISTANT_CEILINGS } from "@/features/ai/constants/assistant-limits";
import { prisma } from "@/lib/database/client";

jest.mock("@/lib/database/client", () => ({
  prisma: {
    aiAssistantPolicy: {
      findUnique: jest.fn(),
    },
  },
}));

const findUnique = prisma.aiAssistantPolicy.findUnique as jest.Mock;

describe("assistant policy", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("clamps limits down to the code ceiling", () => {
    const limits = clampAiAssistantLimits({
      maxRequestsPerUser: 999,
      maxOutputTokens: 99999,
      maxToolSteps: 40,
      maxUserConcurrency: 9,
      maxTenantConcurrency: 100,
    });
    expect(limits.maxRequestsPerUser).toBe(AI_ASSISTANT_CEILINGS.maxRequestsPerUser);
    expect(limits.maxOutputTokens).toBe(AI_ASSISTANT_CEILINGS.maxOutputTokens);
    expect(limits.maxToolSteps).toBe(AI_ASSISTANT_CEILINGS.maxToolSteps);
    expect(limits.maxUserConcurrency).toBe(AI_ASSISTANT_CEILINGS.maxUserConcurrency);
    expect(limits.maxTenantConcurrency).toBe(AI_ASSISTANT_CEILINGS.maxTenantConcurrency);
  });

  it("stays off when the row is missing, disabled, or unreadable", async () => {
    findUnique.mockResolvedValue(null);
    await expect(readAiAssistantGate("tenant-1")).resolves.toEqual({ ok: false, reason: "missing" });

    findUnique.mockResolvedValue({ enabled: false, ...AI_ASSISTANT_CEILINGS });
    await expect(readAiAssistantGate("tenant-1")).resolves.toEqual({ ok: false, reason: "disabled" });

    findUnique.mockRejectedValue(new Error("database down"));
    await expect(readAiAssistantGate("tenant-1")).resolves.toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  it("returns clamped limits only when the row is enabled", async () => {
    findUnique.mockResolvedValue({ enabled: true, ...AI_ASSISTANT_CEILINGS, maxToolSteps: 99 });
    const gate = await readAiAssistantGate("tenant-1");
    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.limits.maxToolSteps).toBe(AI_ASSISTANT_CEILINGS.maxToolSteps);
  });
});
