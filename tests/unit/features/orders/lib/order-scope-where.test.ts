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

const SEE_EVERYONE = ["orders.manual.view_all", "orders.special.view_all"];

/** Seeded Product Specialist: creates, edits while Pending SP, sees own orders only. */
const PS = [...BOTH, "orders.manual.edit_pending"];
/** Seeded Team Leader on manual / special: edits while Pending SP, sees everyone's orders. */
const TL = ["orders.manual.view", "orders.special.view", "orders.manual.edit_pending", ...SEE_EVERYONE];
const SP = [
  "orders.manual.view",
  "orders.manual.approve_sp",
  "orders.special.view",
  "orders.special.approve_sp",
  ...SEE_EVERYONE,
];
const ADMIN = [...BOTH, ...SEE_EVERYONE, "orders.manual.view_queue", "orders.special.view_queue"];

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
    const scopes = manualSpecialQueueScopes(PS, "all");
    expect(scopes).toEqual([
      {
        orderType: "manual",
        statuses: ["draft", "pending_sp"],
      },
      {
        orderType: "special",
        statuses: ["draft"],
      },
    ]);

    expect(orderScopeWhere("tenant-1", null, { typeScopes: scopes })).toEqual({
      tenantId: "tenant-1",
      OR: [
        { orderType: "manual", status: { in: ["draft", "pending_sp"] } },
        { orderType: "special", status: { in: ["draft"] } },
      ],
    });
  });

  it("omits a type whose queue is empty instead of matching every status", () => {
    const scopes = manualSpecialQueueScopes(TL, "all");
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
      ["orders.manual.view", "orders.special.approve_sp"],
      "all",
    );
    expect(scopes).toEqual([{ orderType: "manual" }, { orderType: "special" }]);
    expect(orderScopeWhere("tenant-1", null, { typeScopes: scopes })).toEqual({
      tenantId: "tenant-1",
      OR: [{ orderType: "manual" }, { orderType: "special" }],
    });
  });

  it("limits the list to the viewer's own orders without See everyone's orders", () => {
    const scopes = manualSpecialQueueScopes(PS, "all", "user-1");
    expect(scopes).toEqual([
      {
        orderType: "manual",
        statuses: ["draft", "pending_sp"],
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
        status: { in: ["draft", "pending_sp"] },
        createdById: "user-1",
      },
      { orderType: "special", status: { in: ["draft"] }, createdById: "user-1" },
      { orderType: "special", status: { in: ["pending_sp"] }, createdById: "user-1" },
    ]);
    expect(listed?.some((branch) => branch.createdById === "user-2")).toBe(false);

    const manualOnly = manualSpecialQueueScopes(PS, "manual", "user-1");
    expect(manualOnly).toEqual([
      {
        orderType: "manual",
        statuses: ["draft", "pending_sp"],
        createdById: "user-1",
      },
    ]);

    const specialOnly = manualSpecialQueueScopes(PS, "special", "user-1");
    expect(specialOnly).toEqual([
      { orderType: "special", statuses: ["draft"], createdById: "user-1" },
      { orderType: "special", statuses: ["pending_sp"], createdById: "user-1" },
    ]);
  });

  it("keeps a creator's own special Pending SP without opening that step", () => {
    const scopes = manualSpecialQueueScopes([...BOTH, ...SEE_EVERYONE], "special", "user-1");
    expect(scopes).toEqual([
      { orderType: "special", statuses: ["draft"] },
      { orderType: "special", statuses: ["pending_sp"], createdById: "user-1" },
    ]);
  });

  it("leaves queues with See everyone's orders open to other creators", () => {
    const teamLeader = manualSpecialQueueScopes(TL, "all", "user-1");
    expect(teamLeader).toEqual([
      { orderType: "manual", statuses: ["pending_sp"] },
      { orderType: "special", statuses: [] },
      { orderType: "special", statuses: ["pending_sp"], createdById: "user-1" },
    ]);
    expect(teamLeader.find((scope) => scope.orderType === "manual")?.createdById).toBeUndefined();

    const planning = manualSpecialQueueScopes(SP, "all", "user-1");
    expect(planning).toEqual([
      { orderType: "manual", statuses: ["pending_ps", "pending_sp", "pending_logistics"] },
      { orderType: "special", statuses: ["pending_sp", "pending_logistics"] },
    ]);

    const admin = manualSpecialQueueScopes(ADMIN, "all", "user-1");
    expect(admin.every((scope) => scope.createdById == null)).toBe(true);
    expect(admin.find((scope) => scope.orderType === "manual")?.statuses).toContain("pending_tl");
  });

  it("limits history to own orders without See everyone's orders", () => {
    const scopes = manualSpecialHistoryScopes(PS, "all", "user-1");
    expect(scopes).toEqual([
      { orderType: "manual", createdById: "user-1" },
      { orderType: "special", createdById: "user-1" },
    ]);
    expect(orderScopeWhere("tenant-1", null, { typeScopes: scopes }).OR).toEqual([
      { orderType: "manual", createdById: "user-1" },
      { orderType: "special", createdById: "user-1" },
    ]);
    expect(manualSpecialHistoryScopes(ADMIN, "special", "user-1")).toEqual([
      { orderType: "special" },
    ]);
  });

  it("leaves special Pending SP on the role queue when the viewer can already approve it", () => {
    const scopes = manualSpecialQueueScopes(SP, "special", "user-1");
    expect(scopes).toEqual([{ orderType: "special", statuses: ["pending_sp", "pending_logistics"] }]);
  });

  it("matches nothing when every requested type is outside the viewer's access", () => {
    const scopes = manualSpecialQueueScopes(["orders.manual.view"], "special");
    expect(scopes).toEqual([]);
    expect(hasQueryableTypeScopes(scopes)).toBe(false);
    expect(orderScopeWhere("tenant-1", null, { typeScopes: scopes }).OR).toEqual([
      { id: { in: [] } },
    ]);
  });
});
