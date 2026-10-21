jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));
jest.mock("@/lib/database/client", () => ({ prisma: {} }));
jest.mock("@/features/aors/repositories/aor.repository", () => ({
  aorRepository: { listScopeForUser: jest.fn() },
}));

import { aorRepository } from "@/features/aors/repositories/aor.repository";
import { authorizeDeliveryScope } from "@/features/logistics/services/delivery-scope";

const listScope = aorRepository.listScopeForUser as jest.MockedFunction<
  typeof aorRepository.listScopeForUser
>;

const actor = { tenantId: "t1", userId: "u1", permissions: ["logistics.delivery.receive"] };
const delivery = { branchId: "b1", sourceWarehouseId: "w1" };

describe("authorizeDeliveryScope", () => {
  beforeEach(() => listScope.mockReset());

  it("allows via AOR warehouse matching sourceWarehouseId", async () => {
    listScope.mockResolvedValue({ branchIds: [], warehouseIds: ["w1"], hasRows: true });
    await expect(authorizeDeliveryScope(actor, delivery)).resolves.toBeUndefined();
  });

  it("allows via AOR branch", async () => {
    listScope.mockResolvedValue({ branchIds: ["b1"], warehouseIds: [], hasRows: true });
    await expect(authorizeDeliveryScope(actor, delivery)).resolves.toBeUndefined();
  });

  it("rejects when neither matches", async () => {
    listScope.mockResolvedValue({ branchIds: ["b2"], warehouseIds: ["w2"], hasRows: true });
    await expect(authorizeDeliveryScope(actor, delivery)).rejects.toThrow(
      "This delivery is outside your area of responsibility",
    );
  });

  it("rejects a warehouse AOR when the delivery has no source warehouse", async () => {
    listScope.mockResolvedValue({ branchIds: [], warehouseIds: ["w1"], hasRows: true });
    await expect(
      authorizeDeliveryScope(actor, { branchId: "b1", sourceWarehouseId: null }),
    ).rejects.toThrow("This delivery is outside your area of responsibility");
  });

  it("branches.manage skips lookup", async () => {
    await expect(
      authorizeDeliveryScope({ ...actor, permissions: ["branches.manage"] }, delivery),
    ).resolves.toBeUndefined();
    expect(listScope).not.toHaveBeenCalled();
  });

  it("no AOR rows is unrestricted", async () => {
    listScope.mockResolvedValue({ branchIds: [], warehouseIds: [], hasRows: false });
    await expect(authorizeDeliveryScope(actor, delivery)).resolves.toBeUndefined();
  });
});
