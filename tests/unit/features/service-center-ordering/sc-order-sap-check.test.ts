import type { CurrentPlacement } from "@/features/inventory/services/serial-placement";
import {
  blockedPlacementMessage,
  scDeliveryLocationId,
  scDeliveryNoForDr,
  scDeliverySettledStatus,
  scPlacementsToReplace,
  summarizeScOrderSapCheck,
} from "@/features/service-center-ordering/lib/sc-order-sap-check";

const placement = (overrides: Partial<CurrentPlacement>): CurrentPlacement => ({
  table: "warehouse",
  id: "row",
  serialNumberId: "s1",
  serialNo: "SN1",
  tenantId: "t1",
  place: "Main warehouse",
  branchId: null,
  warehouseId: "w1",
  warehouseLocationId: null,
  serviceCenterId: null,
  serviceCenterLocationId: null,
  statusCode: "STK",
  ...overrides,
});

describe("scPlacementsToReplace", () => {
  it("replaces the warehouse row SAP's DR moved the serial out of", () => {
    expect(scPlacementsToReplace([placement({ id: "w-row" })], "loc1")).toEqual({
      warehouseRowIds: ["w-row"],
      blocked: [],
    });
  });

  it("keeps a row already at the receiving location", () => {
    const here = placement({ table: "service_center", id: "sc-row", serviceCenterLocationId: "loc1", statusCode: "DIT" });
    expect(scPlacementsToReplace([here], "loc1")).toEqual({ warehouseRowIds: [], blocked: [] });
  });

  it("stops on a branch or another service-center location", () => {
    const branch = placement({ table: "branch", id: "b-row", serialNo: "SN2", place: "Branch A" });
    const elsewhere = placement({ table: "service_center", id: "x-row", serviceCenterLocationId: "loc2" });
    const { blocked } = scPlacementsToReplace([branch, elsewhere], "loc1");
    expect(blocked.map((row) => row.id)).toEqual(["b-row", "x-row"]);
    expect(blockedPlacementMessage([branch])).toBe("SN2 is at Branch A in ISMS");
  });
});

describe("scDeliveryLocationId", () => {
  it("uses the order's location, else the center's only one", () => {
    expect(scDeliveryLocationId("loc9", ["loc1", "loc2"])).toBe("loc9");
    expect(scDeliveryLocationId(null, ["loc1"])).toBe("loc1");
  });

  it("leaves it for Accept when the center has several or none", () => {
    expect(scDeliveryLocationId(null, ["loc1", "loc2"])).toBeNull();
    expect(scDeliveryLocationId(null, [])).toBeNull();
  });
});

describe("scDeliverySettledStatus", () => {
  it("is accepted only once every DR serial is", () => {
    const now = new Date();
    expect(scDeliverySettledStatus([{ acceptedAt: now }, { acceptedAt: now }])).toBe("accepted");
    expect(scDeliverySettledStatus([{ acceptedAt: now }, { acceptedAt: null }])).toBe("partial");
    // Returned units count as settled: accepted when any reached stock, rejected when all went back.
    expect(scDeliverySettledStatus([{ acceptedAt: now }, { acceptedAt: null, returnedAt: now }])).toBe("accepted");
    expect(scDeliverySettledStatus([{ acceptedAt: null, returnedAt: now }])).toBe("rejected");
    expect(scDeliverySettledStatus([{ acceptedAt: null, returnedAt: now }, { acceptedAt: null }])).toBe("partial");
  });
});

describe("scDeliveryNoForDr", () => {
  it("is unique per DR", () => {
    expect(scDeliveryNoForDr(51234)).toBe("SCD-DR51234");
  });
});

describe("summarizeScOrderSapCheck", () => {
  const base = { ordersChecked: 3, deliveriesCreated: 0, serialCount: 0, problems: [] };

  it("reports the deliveries it added", () => {
    expect(summarizeScOrderSapCheck({ ...base, deliveriesCreated: 2, serialCount: 5 })).toEqual({
      tone: "success",
      title: "Added 2 deliveries from SAP (5 units)",
      description: "Open a delivery to receive its units.",
    });
  });

  it("never drops a problem", () => {
    const withProblem = { ...base, problems: ["SCO-1: SN1 is at Branch A in ISMS."] };
    expect(summarizeScOrderSapCheck({ ...withProblem, deliveriesCreated: 1, serialCount: 5 })).toEqual({
      tone: "warning",
      title: "Added 1 delivery from SAP (5 units). 1 SAP delivery not added",
      description: "Not added: SCO-1: SN1 is at Branch A in ISMS.",
    });
    expect(summarizeScOrderSapCheck(withProblem)).toMatchObject({
      tone: "warning",
      title: "Some SAP deliveries could not be added",
    });
  });

  it("says when there is nothing to check or nothing new", () => {
    expect(summarizeScOrderSapCheck({ ...base, ordersChecked: 0 }).title).toBe(
      "No approved orders are waiting for a SAP delivery",
    );
    expect(summarizeScOrderSapCheck(base)).toEqual({ tone: "info", title: "No new SAP deliveries" });
  });
});
