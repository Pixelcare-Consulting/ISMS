jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

import {
  resolveScSalesCapabilities,
  SC_RETURN_REQUEST,
  SC_SALES_CREATE,
  SC_SALES_UPDATE,
  SC_SALES_VIEW,
} from "@/features/service-center-ops/constants/sc-permissions";

describe("resolveScSalesCapabilities", () => {
  it.each([SC_SALES_VIEW, SC_SALES_CREATE, SC_SALES_UPDATE])("lets %s open the Service Center tab", (slug) => {
    expect(resolveScSalesCapabilities([slug]).canViewSalesList).toBe(true);
  });

  it("keeps users without SC sales access out of the tab", () => {
    expect(resolveScSalesCapabilities([SC_RETURN_REQUEST]).canViewSalesList).toBe(false);
  });

  it("is read only: SC copies are never encoded, edited, or returned from the tab", () => {
    const caps = resolveScSalesCapabilities([
      SC_SALES_VIEW,
      SC_SALES_CREATE,
      SC_SALES_UPDATE,
      SC_RETURN_REQUEST,
      "returns.approve",
    ]);
    expect(caps).toEqual({
      canViewSalesList: true,
      canViewReturns: false,
      canCreateSale: false,
      canUpdateSaleHeader: false,
      canRequestReturn: false,
      canEvaluateReturn: false,
      canApproveReturn: false,
      canCompleteReturn: false,
    });
  });
});
