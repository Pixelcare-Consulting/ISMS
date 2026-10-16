import {
  canUsePixelcareAi,
  evaluatePixelcareAiAccess,
  isPixelcareAiEnabled,
  parsePixelcareAiUserAllowlist,
  PIXELCARE_AI_PERMISSION,
} from "@/features/pixelcare-ai/constants/permissions";

describe("pixelcare-ai access", () => {
  it("is always enabled (no kill switch)", () => {
    expect(isPixelcareAiEnabled()).toBe(true);
    expect(isPixelcareAiEnabled("false")).toBe(true);
    expect(isPixelcareAiEnabled("true")).toBe(true);
    expect(isPixelcareAiEnabled(undefined)).toBe(true);
  });

  it("allows any authenticated user when allowlist is empty", () => {
    expect(
      canUsePixelcareAi({
        userId: "user-1",
        email: "anyone@example.com",
        permissions: [],
        allowlist: [],
      }),
    ).toBe(true);
  });

  it("restricts to allowlisted user ids when allowlist is non-empty", () => {
    expect(
      canUsePixelcareAi({
        userId: "user-42",
        permissions: [],
        allowlist: ["user-42"],
      }),
    ).toBe(true);
    expect(
      canUsePixelcareAi({
        userId: "user-9",
        permissions: [],
        allowlist: ["user-42"],
      }),
    ).toBe(false);
  });

  it("restricts to allowlisted emails when allowlist is non-empty", () => {
    expect(
      canUsePixelcareAi({
        userId: "user-9",
        email: "Support@Example.com",
        permissions: [],
        allowlist: ["support@example.com"],
      }),
    ).toBe(true);
  });

  it("lets ai.internal bypass a non-empty allowlist", () => {
    expect(
      canUsePixelcareAi({
        userId: "user-1",
        permissions: [PIXELCARE_AI_PERMISSION],
        allowlist: ["someone-else"],
      }),
    ).toBe(true);
  });

  it("denies non-allowlisted users without permission when locked down", () => {
    expect(
      evaluatePixelcareAiAccess({
        userId: "user-9",
        email: "other@example.com",
        permissions: ["ai.assist"],
        allowlist: ["user-42"],
      }),
    ).toEqual({ ok: false, reason: "allowlist" });
  });

  it("parses allowlist helpers", () => {
    expect(parsePixelcareAiUserAllowlist(" a,b , ,c ")).toEqual(["a", "b", "c"]);
    expect(parsePixelcareAiUserAllowlist('"user-1","support@example.com"')).toEqual([
      "user-1",
      "support@example.com",
    ]);
    expect(parsePixelcareAiUserAllowlist("")).toEqual([]);
    expect(parsePixelcareAiUserAllowlist(undefined)).toEqual([]);
  });
});
