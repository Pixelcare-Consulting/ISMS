import {
  RETURNED_REPLACED_STATUS,
  returnHistoryStatusRef,
  SERVICE_RETURNED_REPLACED_STATUS,
} from "@/features/sales/constants/return-history-status";

describe("returnHistoryStatusRef", () => {
  it.each(["pending_cs", "pending_tl", "approved", "completed"])(
    "keeps Returned/Replaced while the request is %s",
    (status) => {
      expect(returnHistoryStatusRef(status, "Dealer Initiated Return")).toMatchObject({
        name: RETURNED_REPLACED_STATUS,
      });
    },
  );

  it.each(["pending_cs", "pending_tl", "approved", "completed"])(
    "keeps Service Returned/Replaced for a service document while %s",
    (status) => {
      expect(returnHistoryStatusRef(status, "Service Replacement")).toMatchObject({
        name: SERVICE_RETURNED_REPLACED_STATUS,
      });
    },
  );

  it("does not keep the return status after a rejection", () => {
    expect(returnHistoryStatusRef("rejected", "Branch Return")).toBeNull();
    expect(returnHistoryStatusRef(null, "Branch Return")).toBeNull();
  });
});
