import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolvePostLoginDestination,
  safeInternalPath,
  waitForValue,
} from "./post-login-destination";

describe("safeInternalPath", () => {
  it("accepts in-app paths", () => {
    assert.equal(safeInternalPath("/dashboard"), "/dashboard");
    assert.equal(safeInternalPath("/settings/profile"), "/settings/profile");
  });

  it("rejects off-site and protocol-relative URLs", () => {
    assert.equal(safeInternalPath("https://evil.example/phish"), null);
    assert.equal(safeInternalPath("//evil.example/phish"), null);
    assert.equal(safeInternalPath(null), null);
    assert.equal(safeInternalPath(""), null);
  });
});

describe("resolvePostLoginDestination", () => {
  it("sends platform operators to the provider console", () => {
    assert.equal(
      resolvePostLoginDestination({
        isPlatformOperator: true,
        callbackUrl: "/dashboard",
      }),
      "/provider",
    );
    assert.equal(
      resolvePostLoginDestination({
        isPlatformOperator: true,
        callbackUrl: "/provider/tenants",
      }),
      "/provider/tenants",
    );
  });

  it("honors a safe callback for tenant users", () => {
    assert.equal(
      resolvePostLoginDestination({
        isPlatformOperator: false,
        callbackUrl: "/orders/manual",
      }),
      "/orders/manual",
    );
  });

  it("falls back to the dashboard when the session is not readable yet", () => {
    assert.equal(
      resolvePostLoginDestination({
        isPlatformOperator: false,
        callbackUrl: null,
      }),
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

    assert.deepEqual(value, { id: "session" });
    assert.equal(attempts, 3);
  });

  it("returns null after retries so the caller can still continue", async () => {
    const value = await waitForValue(async () => null, [0, 0]);
    assert.equal(value, null);
  });
});
