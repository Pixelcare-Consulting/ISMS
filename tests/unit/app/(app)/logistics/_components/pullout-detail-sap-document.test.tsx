/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "sonner";

import { PulloutDetailView } from "@/app/(app)/logistics/_components/pullout-detail";
import { checkPulloutSapAction } from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("@/features/settings/lib/load-print-letterhead", () => ({
  loadPrintLetterhead: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/features/logistics/actions/logistics.actions", () => ({
  checkPulloutSapAction: jest.fn(),
}));

const checkSap = jest.mocked(checkPulloutSapAction);

function result(overrides: Record<string, unknown> = {}) {
  return {
    success: true as const,
    result: {
      id: "p1",
      linkedDocuments: [],
      linkedCount: 0,
      pulledOutCount: 0,
      redeliveries: [],
      waitingCount: 0,
      notes: [],
      ...overrides,
    },
  };
}

type Line = PulloutDetail["lines"][number];

function line(
  serialNumberId: string,
  sapDocument: Line["sapDocument"] = null,
  redelivery: Line["redelivery"] = null,
) {
  return {
    serialNumberId,
    decision: "accepted",
    remarks: null,
    reasonName: "Overstock",
    problemDescriptionNames: [],
    serialNo: serialNumberId.toUpperCase(),
    skuCode: "SKU1",
    modelName: "Model One",
    priorCode: "STK",
    inventoryCode: "DIT",
    classificationNames: [],
    unitPackingConditionNames: [],
    accessoryCompletenessNames: [],
    receivedAt: null,
    receivedByName: null,
    receivedLocation: null,
    rejectedAt: null,
    rejectedByName: null,
    rejectionRemarks: null,
    sapDocument,
    redelivery,
  };
}

const RETURN_14402 = { type: "RETURN" as const, docNum: 14402, docDate: "2026-11-10", linkedAt: null, linkedByName: null };

function sentDetail(
  lines = [
    line("s1"),
    line("s2", RETURN_14402),
    line("s3", RETURN_14402, { deliveryId: "d1", deliveryNo: "DLV-9", drNo: "168206", branchName: "Branch B" }),
  ],
) {
  return {
    id: "p1",
    pulloutNo: "PLT-1",
    condition: "STK",
    notes: null,
    waybillNo: null,
    courierName: null,
    createdAt: "2026-11-05T02:00:00.000Z",
    createdByName: "Requester",
    scheduledAt: null,
    scheduledByName: null,
    actualScheduledDate: null,
    status: { code: "in_transit", name: "Pull-out in transit", color: null },
    branch: { id: "b1", name: "Branch A" },
    warehouse: null,
    warehouseLocation: null,
    reason: null,
    attachments: [],
    lines,
    canCheckSap: true,
    history: [],
  } as unknown as PulloutDetail;
}

const logistics = { canManage: true } as unknown as LogisticsActionCapabilities;

function renderView(capabilities = logistics, detail = sentDetail()) {
  render(
    <PulloutDetailView
      detail={detail}
      capabilities={capabilities}
      branchScope={null}
      workflowStatuses={[]}
    />,
  );
}

function rowFor(serialNo: string) {
  return screen.getByText(serialNo, { selector: "td, td *" }).closest("tr") as HTMLElement;
}

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = jest.fn();
  Element.prototype.hasPointerCapture = jest.fn(() => false);
});

beforeEach(() => jest.clearAllMocks());

describe("Check SAP on a sent pull-out", () => {
  it("shows each unit's SAP document and redelivery, or that SAP has none yet", () => {
    renderView();

    expect(screen.getByRole("columnheader", { name: "SAP document" })).toBeInTheDocument();
    expect(within(rowFor("S1")).getByText("Not in SAP yet")).toBeInTheDocument();
    expect(within(rowFor("S2")).getByText("Return: 14402")).toBeInTheDocument();
    const redelivered = rowFor("S3");
    expect(within(redelivered).getByText(/Redelivered on DR 168206 to Branch B/)).toBeInTheDocument();
    expect(within(redelivered).getByRole("link", { name: "DLV-9" })).toHaveAttribute(
      "href",
      "/logistics/deliveries/d1",
    );
  });

  it("checks SAP and reports what it found", async () => {
    checkSap.mockResolvedValueOnce(
      result({
        linkedDocuments: ["IT: 494405"],
        linkedCount: 1,
        pulledOutCount: 1,
        redeliveries: [{ deliveryNo: "DLV-10", drNo: "555", unitCount: 1 }],
        notes: ["Return: 1 is cancelled in SAP, so it was not used"],
      }),
    );
    renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check SAP" }));
    });

    expect(checkSap).toHaveBeenCalledWith("p1");
    expect(toast.success).toHaveBeenCalledWith(
      "Found IT: 494405. 1 unit pulled out. DR 555 redelivered 1 on DLV-10.",
    );
    expect(toast.warning).toHaveBeenCalledWith("Return: 1 is cancelled in SAP, so it was not used");
  });

  it("says when SAP has nothing for the units yet", async () => {
    checkSap.mockResolvedValueOnce(result({ waitingCount: 2 }));
    renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check SAP" }));
    });

    expect(toast.info).toHaveBeenCalledWith("SAP has no IT or Return for these 2 units yet.");
  });

  it("shows SAP's error", async () => {
    checkSap.mockResolvedValueOnce({ error: "SAP is not connected" });
    renderView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check SAP" }));
    });

    expect(toast.error).toHaveBeenCalledWith("SAP is not connected");
  });

  it("shows the column but no Check SAP to someone who cannot manage logistics", () => {
    renderView({ canManage: false } as unknown as LogisticsActionCapabilities);

    expect(screen.getByRole("columnheader", { name: "SAP document" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check SAP" })).not.toBeInTheDocument();
  });
});
