import {
  REPLACED_STATUS,
  RETURNED_STATUS,
  returnHistoryStatusRef,
  SERVICE_REPLACED_STATUS,
  SERVICE_RETURNED_STATUS,
} from "@/features/sales/constants/return-history-status";
import { parseSalesListStatusFilter } from "@/features/sales/constants/sales-list-status";

describe("returnHistoryStatusRef", () => {
  it.each(["pending_cs", "pending_tl", "approved", "completed"])(
    "keeps Returned while a return is %s",
    (status) => {
      expect(
        returnHistoryStatusRef(status, "Dealer Initiated Return", "return"),
      ).toMatchObject({
        code: "returned",
        name: RETURNED_STATUS,
      });
    },
  );

  it.each(["pending_cs", "pending_tl", "approved", "completed"])(
    "keeps Replaced while a replacement is %s",
    (status) => {
      expect(
        returnHistoryStatusRef(status, "Dealer Initiated Replacement", "replacement"),
      ).toMatchObject({
        code: "replaced",
        name: REPLACED_STATUS,
      });
    },
  );

  it.each(["pending_cs", "pending_tl", "approved", "completed"])(
    "keeps Service Returned for a service return while %s",
    (status) => {
      expect(
        returnHistoryStatusRef(status, "Service Return", "return"),
      ).toMatchObject({
        code: "service_returned",
        name: SERVICE_RETURNED_STATUS,
      });
    },
  );

  it.each(["pending_cs", "pending_tl", "approved", "completed"])(
    "keeps Service Replaced for a service replacement while %s",
    (status) => {
      expect(
        returnHistoryStatusRef(status, "Service Replacement", "replacement"),
      ).toMatchObject({
        code: "service_replaced",
        name: SERVICE_REPLACED_STATUS,
      });
    },
  );

  it("does not keep the return status after a rejection", () => {
    expect(returnHistoryStatusRef("rejected", "Branch Return", "return")).toBeNull();
    expect(returnHistoryStatusRef(null, "Branch Return", "return")).toBeNull();
  });

  it("opens an old combined status link with no filter", () => {
    expect(parseSalesListStatusFilter("returned_replaced")).toBeUndefined();
    expect(parseSalesListStatusFilter("service_returned_replaced")).toBeUndefined();
    expect(parseSalesListStatusFilter("returned")).toBe("RETURNED");
    expect(parseSalesListStatusFilter("replaced")).toBe("REPLACED");
  });
});
