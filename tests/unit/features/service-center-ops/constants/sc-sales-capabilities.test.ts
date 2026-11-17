jest.mock("@/lib/auth/permissions", () => ({
  hasPermission: (permissions: string[] | undefined, slug: string) =>
    Boolean(permissions?.includes(slug)),
}));

import {
  resolveScSalesCapabilities,
  SC_RETURN_REQUEST,
  SC_SALES_CREATE,
  SC_SALES_VIEW,
} from "@/features/service-center-ops/constants/sc-permissions";

describe("resolveScSalesCapabilities", () => {
  it.each([SC_RETURN_REQUEST, SC_SALES_CREATE])("lets %s request a Service Return / Replacement", (slug) => {
    expect(resolveScSalesCapabilities([slug]).canRequestReturn).toBe(true);
  });

  it("keeps view-only users from requesting", () => {
    expect(resolveScSalesCapabilities([SC_SALES_VIEW]).canRequestReturn).toBe(false);
  });

  it("never turns on the branch evaluate / approve / complete steps", () => {
    const caps = resolveScSalesCapabilities([SC_RETURN_REQUEST, SC_SALES_CREATE, "returns.approve"]);
    expect(caps.canViewReturns).toBe(false);
    expect(caps.canEvaluateReturn).toBe(false);
    expect(caps.canApproveReturn).toBe(false);
    expect(caps.canCompleteReturn).toBe(false);
  });
});
