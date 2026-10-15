jest.mock("@/lib/auth/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
  signOutServer: jest.fn(),
}));

jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

import { resolveLogisticsCapabilities } from "@/features/logistics/constants/logistics-permissions";

describe("delivery role gates", () => {
  it("lets logistics dispatch and a branch receiver accept", () => {
    expect(resolveLogisticsCapabilities(["logistics.view"]).canManage).toBe(false);
    expect(resolveLogisticsCapabilities(["logistics.manage"]).canManage).toBe(true);
    expect(resolveLogisticsCapabilities(["inventory.view"]).canAcceptDelivery).toBe(false);
    expect(resolveLogisticsCapabilities(["logistics.create"]).canAcceptDelivery).toBe(true);
    expect(resolveLogisticsCapabilities(["logistics.view"]).canAcceptDelivery).toBe(false);
  });
});
