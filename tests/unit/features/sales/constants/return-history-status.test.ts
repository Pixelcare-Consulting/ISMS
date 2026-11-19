import {
  isReturnHistoryStatus,
  isScServiceOpenReturnStatus,
  REPLACED_STATUS,
  RESERVE_ODRF_STATUS,
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

describe("service center steps (Process V-b)", () => {
  it.each(["pending_sc", "awaiting_stock"])(
    "shows Reserve ODRF while the service center has the unit (%s)",
    (status) => {
      expect(returnHistoryStatusRef(status, "Service Replacement", "replacement")).toEqual(
        RESERVE_ODRF_STATUS,
      );
      expect(isScServiceOpenReturnStatus(status)).toBe(true);
      expect(isReturnHistoryStatus(status)).toBe(true);
    },
  );

  it("keeps Service Returned once the service center completes it", () => {
    expect(returnHistoryStatusRef("completed", "Service Return", "return")).toMatchObject({
      name: SERVICE_RETURNED_STATUS,
    });
  });

  it("drops the return status when the service center rejects it", () => {
    expect(returnHistoryStatusRef("rejected", "Service Return", "return")).toBeNull();
    expect(isScServiceOpenReturnStatus("rejected")).toBe(false);
  });

  it("filters the sales list by Reserve ODRF", () => {
    expect(parseSalesListStatusFilter("odrf")).toBe("ODRF");
  });
});
