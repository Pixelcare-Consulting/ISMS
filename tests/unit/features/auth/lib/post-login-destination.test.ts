import {
  isLoginProbePath,
  resolvePostLoginDestination,
  safeInternalPath,
  waitForValue,
} from "@/features/auth/lib/post-login-destination";

const PROBE_PATHS = [
  "/.env",
  "/.env.production",
  "/.git/config",
  "/.ssh/id_dsa",
  "/.aws/credentials",
  "/backup.sql",
  "/laravel.log",
  "/readme.bak",
  "/%2eenv",
  "/%2eenv.production",
  "/%2egit/config",
  "/%2essh/id_dsa",
  "/%2eaws/credentials",
  "/%2Eenv",
  "/%252eenv",
  "/%252eenv.production",
  "/%252egit/config",
  "/%252essh/id_dsa",
  "/%252eaws/credentials",
  "/%252Eenv",
  "/%252ebackup.sql",
  "/backup%2esql",
  "/laravel%252elog",
  "/readme%2ebak",
  "/%2e%2e/%2eenv",
  "/%252e%252e/%252egit/config",
  "/orders/../../.env",
  "/.aws\\credentials",
  "/%5c.env",
  "/%255c.git/config",
  "/Backup.SQL",
  "/LARAVEL.LOG",
  "/Readme.BAK",
  ".env",
  "%252eenv",
] as const;

describe("safeInternalPath", () => {
  it("accepts in-app paths", () => {
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/orders/manual")).toBe("/orders/manual");
    expect(safeInternalPath("/orders/manual?status=open")).toBe("/orders/manual?status=open");
    expect(safeInternalPath("/settings/profile")).toBe("/settings/profile");
    expect(isLoginProbePath("/dashboard")).toBe(false);
    expect(isLoginProbePath("/orders/manual")).toBe(false);
  });

  it("rejects off-site and protocol-relative URLs", () => {
    expect(safeInternalPath("https://evil.example/phish")).toBeNull();
    expect(safeInternalPath("//evil.example/phish")).toBeNull();
    expect(safeInternalPath("https://evil.example/.env")).toBeNull();
    expect(safeInternalPath("//evil.example/.env")).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath("")).toBeNull();
    expect(isLoginProbePath("https://evil.example/phish")).toBe(false);
    expect(isLoginProbePath("//evil.example/phish")).toBe(false);
    expect(isLoginProbePath("https://evil.example/.env")).toBe(false);
    expect(isLoginProbePath(null)).toBe(false);
  });

  it.each(PROBE_PATHS)("rejects scanner probe %s", (probe) => {
    expect(safeInternalPath(probe)).toBeNull();
    expect(isLoginProbePath(probe)).toBe(true);
  });

  it("drops an unknown section without calling it a secret-file probe", () => {
    expect(safeInternalPath("/not-a-real-section")).toBeNull();
    expect(isLoginProbePath("/not-a-real-section")).toBe(false);
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

  it("sends a tenant user to the dashboard when the callback is a probe", () => {
    expect(
      resolvePostLoginDestination({ isPlatformOperator: false, callbackUrl: "/%252eenv" }),
    ).toBe("/dashboard");
    expect(
      resolvePostLoginDestination({ isPlatformOperator: false, callbackUrl: "/.git/config" }),
    ).toBe("/dashboard");
  });

  it("falls back to the dashboard when the session is not readable yet", () => {
    expect(resolvePostLoginDestination({ isPlatformOperator: false, callbackUrl: null })).toBe(
      "/dashboard",
    );
  });

  it("sends a tenant super admin to setup", () => {
    expect(
      resolvePostLoginDestination({
        isPlatformOperator: false,
        roleSlugs: ["super_admin"],
        callbackUrl: null,
      }),
    ).toBe("/setup");
  });

  it("ignores an operations callback for a tenant super admin", () => {
    expect(
      resolvePostLoginDestination({
        isPlatformOperator: false,
        roleSlugs: ["super_admin"],
        callbackUrl: "/orders/manual",
      }),
    ).toBe("/setup");
  });

  it("keeps a safe setup callback for a tenant super admin", () => {
    expect(
      resolvePostLoginDestination({
        isPlatformOperator: false,
        roleSlugs: ["super_admin"],
        callbackUrl: "/settings/master-data",
      }),
    ).toBe("/settings/master-data");
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
