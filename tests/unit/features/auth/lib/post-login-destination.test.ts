import {
  resolvePostLoginDestination,
  safeInternalPath,
  waitForValue,
} from "@/features/auth/lib/post-login-destination";

describe("safeInternalPath", () => {
  it("accepts in-app paths", () => {
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/settings/profile")).toBe("/settings/profile");
  });

  it("rejects off-site and protocol-relative URLs", () => {
    expect(safeInternalPath("https://evil.example/phish")).toBeNull();
    expect(safeInternalPath("//evil.example/phish")).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath("")).toBeNull();
  });
});

describe("resolvePostLoginDestination", () => {
  it("sends platform operators to the provider console", () => {
    expect(
      resolvePostLoginDestination({ isPlatformOperator: true, callbackUrl: "/dashboard" }),
    ).toBe("/provider");
    expect(
      resolvePostLoginDestination({ isPlatformOperator: true, callbackUrl: "/provider/tenants" }),
    ).toBe("/provider/tenants");
  });

  it("honors a safe callback for tenant users", () => {
    expect(
      resolvePostLoginDestination({ isPlatformOperator: false, callbackUrl: "/orders/manual" }),
    ).toBe("/orders/manual");
  });

  it("falls back to the dashboard when the session is not readable yet", () => {
    expect(resolvePostLoginDestination({ isPlatformOperator: false, callbackUrl: null })).toBe(
      "/dashboard",
    );
  });
});

describe("waitForValue", () => {
  it("returns the first non-null read instead of giving up", async () => {
    let attempts = 0;
    const value = await waitForValue(async () => {
      attempts += 1;
      return attempts >= 3 ? { id: "session" } : null;
    }, [0, 0, 0, 0]);

    expect(value).toEqual({ id: "session" });
    expect(attempts).toBe(3);
  });

  it("returns null after retries so the caller can still continue", async () => {
    const value = await waitForValue(async () => null, [0, 0]);
    expect(value).toBeNull();
  });
});
