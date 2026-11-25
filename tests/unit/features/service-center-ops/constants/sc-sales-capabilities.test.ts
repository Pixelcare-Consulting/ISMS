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
    expect(resolveScSalesCapabilities(["returns.request"]).canViewSalesList).toBe(false);
  });

  it("never encodes or edits SC sales; branch return slugs do not request here", () => {
    const caps = resolveScSalesCapabilities([
      SC_SALES_VIEW,
      SC_SALES_CREATE,
      SC_SALES_UPDATE,
      "returns.request",
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

  it("requests a return only with its own SC checkbox", () => {
    expect(resolveScSalesCapabilities([SC_SALES_VIEW, SC_RETURN_REQUEST]).canRequestReturn).toBe(true);
    expect(resolveScSalesCapabilities([SC_SALES_VIEW, SC_SALES_CREATE]).canRequestReturn).toBe(false);
  });
});
