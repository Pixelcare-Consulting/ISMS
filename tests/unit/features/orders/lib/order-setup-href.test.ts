jest.mock("@/features/service-center-ordering/actions/sc-ordering-settings.actions", () => ({}));
jest.mock("@/features/service-center-ops/actions/sc-inventory.actions", () => ({}));

import { orderSetupHref } from "@/app/(app)/orders/_components/order-setup";
import { scOrderSetupHref } from "@/app/(app)/service-centers/orders/new/_components/sc-order-setup";

describe("orderSetupHref", () => {
  it("leaves the dealer out of an outright branch order", () => {
    expect(orderSetupHref({ dealerId: "", branchId: "b1", modeOfPaymentId: "m1" })).toBe(
      "/orders/manual/new?branchId=b1&modeOfPaymentId=m1&ready=1",
    );
  });

  it("carries the dealer of a consignment branch order", () => {
    expect(orderSetupHref({ dealerId: "d1", branchId: "b1", modeOfPaymentId: "m1" })).toBe(
      "/orders/manual/new?dealerId=d1&branchId=b1&modeOfPaymentId=m1&ready=1",
    );
  });
});

describe("scOrderSetupHref", () => {
  it("opens a service-center order on its own create page, center and customer", () => {
    expect(scOrderSetupHref({ serviceCenterId: "sc1", cardCode: "CELG004" })).toBe(
      "/service-centers/orders/new?serviceCenterId=sc1&cardCode=CELG004&ready=1",
    );
  });
});
