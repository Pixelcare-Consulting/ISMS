import {
  getDeliveryActionableStatusCodes,
  getPulloutActionableStatusCodes,
  getTransferActionableStatusCodes,
} from "@/features/logistics/constants/logistics-actionable-statuses";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";

function caps(
  overrides: Partial<LogisticsActionCapabilities>,
): LogisticsActionCapabilities {
  return {
    canCreate: false,
    canManage: false,
    canApproveTl: false,
    canRejectTransfer: false,
    canAcceptDelivery: false,
    canExecuteTransfer: false,
    canReceiveTransfer: false,
    canSchedulePullout: false,
    canReleasePullout: false,
    canCompletePullout: false,
    ...overrides,
  };
}

describe("logistics actionable status codes", () => {
  it("counts dispatch for managers and accept for receivers", () => {
    expect(getDeliveryActionableStatusCodes(caps({ canManage: true }))).toEqual(
      ["approved"],
    );
    expect(
      getDeliveryActionableStatusCodes(caps({ canAcceptDelivery: true })),
    ).toEqual(["pending", "partial"]);
    expect(
      getDeliveryActionableStatusCodes(
        caps({ canManage: true, canAcceptDelivery: true }),
      ),
    ).toEqual(["approved", "pending", "partial"]);
  });

  it("maps transfer approve / execute / receive gates", () => {
    expect(
      getTransferActionableStatusCodes(caps({ canApproveTl: true })),
    ).toEqual(["requested", "pending_tl"]);
    expect(
      getTransferActionableStatusCodes(caps({ canExecuteTransfer: true })),
    ).toEqual(["approved", "for_transfer"]);
    expect(
      getTransferActionableStatusCodes(caps({ canReceiveTransfer: true })),
    ).toEqual(["in_transit"]);
  });

  it("maps pull-out TL / schedule / release / complete gates", () => {
    expect(
      getPulloutActionableStatusCodes(caps({ canApproveTl: true })),
    ).toEqual(["pending_tl"]);
    expect(
      getPulloutActionableStatusCodes(caps({ canSchedulePullout: true })),
    ).toEqual(["for_pullout"]);
    expect(
      getPulloutActionableStatusCodes(caps({ canReleasePullout: true })),
    ).toEqual(["pending_logistics"]);
    expect(
      getPulloutActionableStatusCodes(caps({ canCompletePullout: true })),
    ).toEqual(["in_transit"]);
  });
});
