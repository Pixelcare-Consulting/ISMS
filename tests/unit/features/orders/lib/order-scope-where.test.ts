jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

import { manualSpecialHistoryScopes, manualSpecialQueueScopes } from "@/features/orders/lib/manual-special-order-scope";
import { hasQueryableTypeScopes, orderScopeWhere } from "@/features/orders/lib/order-scope-where";

const BOTH = [
  "orders.manual.view",
  "orders.manual.create",
  "orders.special.view",
  "orders.special.create",
];

describe("combined manual and special order scope", () => {
  it("keeps a single type on its own status list", () => {
    expect(
      orderScopeWhere("tenant-1", ["branch-1"], {
        orderType: "manual",
        statuses: ["pending_sp"],
      }),
    ).toEqual({
      tenantId: "tenant-1",
      branchId: { in: ["branch-1"] },
      orderType: "manual",
      status: { in: ["pending_sp"] },
    });
  });

  it("does not leak manual pending_sp optional edit onto special rows", () => {
    const scopes = manualSpecialQueueScopes(BOTH, ["ps"], "all");
    expect(scopes).toEqual([
      {
        orderType: "manual",
        statuses: ["draft", "pending_ps", "pending_sp"],
      },
      {
        orderType: "special",
        statuses: ["draft"],
      },
    ]);

    expect(orderScopeWhere("tenant-1", null, { typeScopes: scopes })).toEqual({
      tenantId: "tenant-1",
      OR: [
        { orderType: "manual", status: { in: ["draft", "pending_ps", "pending_sp"] } },
        { orderType: "special", status: { in: ["draft"] } },
      ],
    });
  });

  it("omits a type whose queue is empty instead of matching every status", () => {
    const scopes = manualSpecialQueueScopes(
      ["orders.manual.view", "orders.special.view"],
      ["tl"],
      "all",
    );
    expect(scopes).toEqual([
      { orderType: "manual", statuses: ["pending_sp"] },
      { orderType: "special", statuses: [] },
    ]);
    expect(hasQueryableTypeScopes(scopes)).toBe(true);
    expect(orderScopeWhere("tenant-1", ["branch-1"], { typeScopes: scopes }).OR).toEqual([
      { orderType: "manual", status: { in: ["pending_sp"] } },
    ]);
  });

  it("limits history by type and does not add a status filter", () => {
    const scopes = manualSpecialHistoryScopes(
      ["orders.manual.view", "orders.special.approve"],
      "all",
    );
    expect(scopes).toEqual([{ orderType: "manual" }, { orderType: "special" }]);
    expect(orderScopeWhere("tenant-1", null, { typeScopes: scopes })).toEqual({
      tenantId: "tenant-1",
      OR: [{ orderType: "manual" }, { orderType: "special" }],
    });
  });

  it("matches nothing when every requested type is outside the viewer's access", () => {
    const scopes = manualSpecialQueueScopes(["orders.manual.view"], ["sp"], "special");
    expect(scopes).toEqual([]);
    expect(hasQueryableTypeScopes(scopes)).toBe(false);
    expect(orderScopeWhere("tenant-1", null, { typeScopes: scopes }).OR).toEqual([
      { id: { in: [] } },
    ]);
  });
});
