const ORIGINAL_ENV = process.env;

/** env.ts parses process.env at import time, so each case re-imports it. */
async function loadAppUrl(overrides: Record<string, string | undefined>) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, APP_URL: undefined, NEXT_PUBLIC_APP_URL: undefined, ...overrides };
  const mod = await import("@/lib/shared/env");
  return mod.appUrl();
}

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("appUrl", () => {
  it("prefers the runtime APP_URL over the build-time NEXT_PUBLIC_APP_URL", async () => {
    await expect(
      loadAppUrl({ APP_URL: "https://isms.example.com", NEXT_PUBLIC_APP_URL: "http://baked.local" }),
    ).resolves.toBe("https://isms.example.com");
  });

  it("falls back to NEXT_PUBLIC_APP_URL", async () => {
    await expect(loadAppUrl({ NEXT_PUBLIC_APP_URL: "https://staging.example.com" })).resolves.toBe(
      "https://staging.example.com",
    );
  });

  it("defaults to localhost when nothing is configured", async () => {
    await expect(loadAppUrl({})).resolves.toBe("http://localhost:3000");
  });

  it("strips a trailing slash so callers can append paths", async () => {
    await expect(loadAppUrl({ APP_URL: "https://isms.example.com/" })).resolves.toBe(
      "https://isms.example.com",
    );
  });
});
