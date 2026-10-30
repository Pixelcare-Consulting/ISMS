jest.mock("@/features/service-center-ordering/actions/sc-ordering-settings.actions", () => ({}));
jest.mock("@/features/service-center-ops/actions/sc-inventory.actions", () => ({}));

import { orderSetupHref } from "@/app/(app)/orders/_components/service-center-order-setup";

describe("orderSetupHref", () => {
  it("opens a service-center order on its center and customer", () => {
    expect(
      orderSetupHref({ orderFor: "service_center", serviceCenterId: "sc1", cardCode: "CELG004" }),
    ).toBe("/orders/manual/new?for=service_center&serviceCenterId=sc1&cardCode=CELG004&ready=1");
  });

  it("leaves the dealer out of an outright branch order", () => {
    expect(
      orderSetupHref({
        orderFor: "branch",
        dealerId: "",
        branchId: "b1",
        modeOfPaymentId: "m1",
      }),
    ).toBe("/orders/manual/new?branchId=b1&modeOfPaymentId=m1&ready=1");
  });
});
