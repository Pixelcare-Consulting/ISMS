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

  it("limits a product specialist list to orders that person created", () => {
    const scopes = manualSpecialQueueScopes(BOTH, ["ps"], "all", "user-1");
    expect(scopes).toEqual([
      {
        orderType: "manual",
        statuses: ["draft", "pending_ps", "pending_sp"],
        createdById: "user-1",
      },
      {
        orderType: "special",
        statuses: ["draft"],
        createdById: "user-1",
      },
      {
        orderType: "special",
        statuses: ["pending_sp"],
        createdById: "user-1",
      },
    ]);
    const listed = orderScopeWhere("tenant-1", ["branch-1"], { typeScopes: scopes }).OR;
    expect(listed).toEqual([
      {
        orderType: "manual",
        status: { in: ["draft", "pending_ps", "pending_sp"] },
        createdById: "user-1",
      },
      { orderType: "special", status: { in: ["draft"] }, createdById: "user-1" },
      { orderType: "special", status: { in: ["pending_sp"] }, createdById: "user-1" },
    ]);
    expect(listed?.some((branch) => branch.createdById === "user-2")).toBe(false);

    const manualOnly = manualSpecialQueueScopes(BOTH, ["ps"], "manual", "user-1");
    expect(manualOnly).toEqual([
      {
        orderType: "manual",
        statuses: ["draft", "pending_ps", "pending_sp"],
        createdById: "user-1",
      },
    ]);

    const specialOnly = manualSpecialQueueScopes(BOTH, ["ps"], "special", "user-1");
    expect(specialOnly).toEqual([
      { orderType: "special", statuses: ["draft"], createdById: "user-1" },
      { orderType: "special", statuses: ["pending_sp"], createdById: "user-1" },
    ]);
  });

  it("keeps a non-specialist creator's own special Pending SP without opening that step", () => {
    const scopes = manualSpecialQueueScopes(BOTH, ["tl"], "special", "user-1");
    expect(scopes).toEqual([
      { orderType: "special", statuses: ["draft"] },
      { orderType: "special", statuses: ["pending_sp"], createdById: "user-1" },
    ]);
  });

  it("leaves team leader, supply planning, and admin queues open to other creators", () => {
    const teamLeader = manualSpecialQueueScopes(
      ["orders.manual.view", "orders.special.view"],
      ["tl"],
      "all",
      "user-1",
    );
    expect(teamLeader).toEqual([
      { orderType: "manual", statuses: ["pending_sp"] },
      { orderType: "special", statuses: [] },
      { orderType: "special", statuses: ["pending_sp"], createdById: "user-1" },
    ]);
    expect(teamLeader.find((scope) => scope.orderType === "manual")?.createdById).toBeUndefined();

    const planning = manualSpecialQueueScopes(
      [
        "orders.manual.view",
        "orders.manual.approve",
        "orders.special.view",
        "orders.special.approve",
      ],
      ["ps", "sp"],
      "all",
      "user-1",
    );
    expect(planning).toEqual([
      { orderType: "manual", statuses: ["pending_ps", "pending_sp"] },
      { orderType: "special", statuses: ["pending_sp"] },
    ]);

    const admin = manualSpecialQueueScopes(BOTH, ["ps", "tenant_admin"], "all", "user-1");
    expect(admin.every((scope) => scope.createdById == null)).toBe(true);
    expect(admin.find((scope) => scope.orderType === "manual")?.statuses).toContain("pending_tl");
  });

  it("limits product specialist history to orders they created", () => {
    const scopes = manualSpecialHistoryScopes(BOTH, "all", ["ps"], "user-1");
    expect(scopes).toEqual([
      { orderType: "manual", createdById: "user-1" },
      { orderType: "special", createdById: "user-1" },
    ]);
    expect(orderScopeWhere("tenant-1", null, { typeScopes: scopes }).OR).toEqual([
      { orderType: "manual", createdById: "user-1" },
      { orderType: "special", createdById: "user-1" },
    ]);
    expect(manualSpecialHistoryScopes(BOTH, "special", ["super_admin"], "user-1")).toEqual([
      { orderType: "special" },
    ]);
  });

  it("leaves special Pending SP on the role queue when the viewer can already approve it", () => {
    const scopes = manualSpecialQueueScopes(
      ["orders.manual.view", "orders.special.view", "orders.special.approve"],
      ["sp"],
      "special",
      "user-1",
    );
    expect(scopes).toEqual([{ orderType: "special", statuses: ["pending_sp"] }]);
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
