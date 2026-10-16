import { allowlistProviderValue, capProviderJson } from "@/features/ai/lib/provider-payload";

describe("provider payload allowlist", () => {
  it("drops customer names and secret-like keys", () => {
    const payload = allowlistProviderValue({
      branchName: "ABENSON",
      sapCode: "ABP001",
      skuCode: "32STV105",
      stkQty: 15,
      status: "draft",
      orderNumber: "SO#2026-10-00009",
      href: "/inventory?branch=branch-1",
      customerName: "Jane Customer",
      email: "jane@example.com",
      phone: "09171234567",
      address: "123 Hidden Street",
      apiKey: "sk-live-secret",
      token: "raw-token",
      password: "DemoPass123",
      confirmationToken: "abc",
      lineHash: "hash",
      nested: {
        customer_name: "Hidden",
        note: "Shelf max 10",
      },
    }) as Record<string, unknown>;

    expect(payload.branchName).toBe("ABENSON");
    expect(payload.sapCode).toBe("ABP001");
    expect(payload.skuCode).toBe("32STV105");
    expect(payload.stkQty).toBe(15);
    expect(payload.orderNumber).toBe("SO#2026-10-00009");
    expect(payload.href).toBe("/inventory?branch=branch-1");
    expect(JSON.stringify(payload)).not.toContain("Jane Customer");
    expect(JSON.stringify(payload)).not.toContain("jane@example.com");
    expect(JSON.stringify(payload)).not.toContain("09171234567");
    expect(JSON.stringify(payload)).not.toContain("Hidden Street");
    expect(JSON.stringify(payload)).not.toContain("sk-live-secret");
    expect(JSON.stringify(payload)).not.toContain("raw-token");
    expect(JSON.stringify(payload)).not.toContain("DemoPass123");
    expect(JSON.stringify(payload)).not.toContain("confirmationToken");
    expect(payload).not.toHaveProperty("lineHash");
  });

  it("does not send a raw JSON slice when the payload is too large", () => {
    const capped = capProviderJson({ note: "x".repeat(20_000) }, 100) as {
      truncated?: boolean;
      preview?: string;
    };
    expect(capped.truncated).toBe(true);
    expect(capped.preview).toBeUndefined();
    expect(JSON.stringify(capped)).not.toContain("xxxxx");
  });

  it("blocks unsafe links inside tool fields", () => {
    const payload = allowlistProviderValue({
      href: "javascript:alert(1)",
      sourceHref: "//evil.example/phish",
    }) as Record<string, unknown>;
    expect(payload.href).toBeUndefined();
    expect(payload.sourceHref).toBeUndefined();
  });
});
