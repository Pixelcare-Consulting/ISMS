/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PulloutDetailView } from "@/app/(app)/logistics/_components/pullout-detail";
import {
  listPulloutSerialsAction,
  updatePulloutListAction,
} from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("@/features/settings/lib/load-print-letterhead", () => ({
  loadPrintLetterhead: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/features/logistics/actions/logistics.actions", () => ({
  listWarehousesForLogisticsAction: jest.fn(async () => []),
  listPulloutSerialsAction: jest.fn(),
  listPulloutChecklistOptionsAction: jest.fn(async () => ({
    reasons: [{ id: "reason-1", name: "Overstock" }],
    problemDescriptions: [{ id: "problem-1", name: "No power" }],
    classifications: [{ id: "class-1", name: "Good" }],
    unitPackingConditions: [{ id: "packing-1", name: "Sealed" }],
    accessoryCompleteness: [{ id: "accessory-1", name: "Complete" }],
  })),
  updatePulloutListAction: jest.fn(async () => ({ success: true })),
}));

const listSerials = jest.mocked(listPulloutSerialsAction);
const saveList = jest.mocked(updatePulloutListAction);

const detail = {
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
  status: { code: "for_pullout", name: "For pull-out", color: null },
  branch: { id: "b1", name: "Branch A" },
  warehouse: { id: "w1", name: "Main", code: "W1" },
  warehouseLocation: null,
  receiveLocations: [],
  reason: null,
  attachments: [],
  lines: [
    {
      serialNumberId: "s1",
      decision: "accepted",
      remarks: null,
      reasonName: "Overstock",
      problemDescriptionNames: [],
      serialNo: "SN1",
      skuCode: "SKU1",
      modelName: "Model One",
      priorCode: "STK",
      inventoryCode: "FPO",
      classificationNames: [],
      unitPackingConditionNames: [],
      accessoryCompletenessNames: [],
      recordedLocationId: null,
      receivedAt: null,
      receivedByName: null,
      receivedLocation: null,
      rejectedAt: null,
      rejectedByName: null,
      rejectionRemarks: null,
    },
  ],
  history: [],
} as unknown as PulloutDetail;

const capabilities = { canManage: true } as unknown as LogisticsActionCapabilities;

function serial(serialNumberId: string, inventoryCode: "STK" | "DEF") {
  return {
    serialNumberId,
    serialNo: serialNumberId.toUpperCase(),
    modelId: "m1",
    skuCode: "SKU2",
    modelName: "Model Two",
    inventoryCode,
  };
}

async function chooseOption(field: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: field }));
  const row = await screen.findByRole("option", { name: option });
  fireEvent.click(row);
  fireEvent.keyDown(row, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("option", { name: option })).not.toBeInTheDocument());
}

async function openAddSerials() {
  render(
    <PulloutDetailView
      detail={detail}
      capabilities={capabilities}
      branchScope={null}
      workflowStatuses={[]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add serials" }));
  await screen.findByRole("checkbox", { name: "Add NEW-STK" });
  // The option lists land after the serials.
  await act(async () => {});
}

function saveButton() {
  return screen.getByRole("button", { name: "Save list" });
}

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  listSerials.mockResolvedValue({
    success: true,
    serials: [serial("new-stk", "STK"), serial("new-def", "DEF")],
  });
});

describe("Add serials on the Logistics step", () => {
  it("keeps a serial's fields disabled until it is ticked", async () => {
    await openAddSerials();

    expect(screen.getByRole("combobox", { name: "Reason for NEW-STK" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Remarks for NEW-STK" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Add NEW-STK" }));

    expect(screen.getByRole("combobox", { name: "Reason for NEW-STK" })).toBeEnabled();
  });

  it("holds Save list until an added stock unit has all its details, then sends them", async () => {
    await openAddSerials();
    fireEvent.click(screen.getByRole("checkbox", { name: "Add NEW-STK" }));

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(/Still missing: NEW-STK/)).toBeInTheDocument();

    await chooseOption("Reason for NEW-STK", "Overstock");
    await chooseOption("Classification for NEW-STK", "Good");
    await chooseOption("Unit packing condition for NEW-STK", "Sealed");
    await chooseOption("Acc completeness for NEW-STK", "Complete");
    fireEvent.change(screen.getByRole("textbox", { name: "Remarks for NEW-STK" }), {
      target: { value: "Added late" },
    });

    expect(saveButton()).toBeEnabled();
    await act(async () => {
      fireEvent.click(saveButton());
    });

    expect(saveList).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({
        serialNumberIds: ["s1", "new-stk"],
        addedLines: [
          {
            serialNumberId: "new-stk",
            pulloutReasonCodeId: "reason-1",
            problemDescriptionIds: [],
            pulloutClassificationIds: ["class-1"],
            unitPackingConditionIds: ["packing-1"],
            accessoryCompletenessIds: ["accessory-1"],
            remarks: "Added late",
          },
        ],
      }),
    );
  });

  it("asks an added defective unit for its problem instead", async () => {
    await openAddSerials();
    fireEvent.click(screen.getByRole("checkbox", { name: "Add NEW-DEF" }));

    await chooseOption("Problem description for NEW-DEF", "No power");
    await chooseOption("Unit packing condition for NEW-DEF", "Sealed");
    await chooseOption("Acc completeness for NEW-DEF", "Complete");

    expect(screen.queryByRole("combobox", { name: "Classification for NEW-DEF" })).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("releases the hold when the serial is unticked", async () => {
    await openAddSerials();
    fireEvent.click(screen.getByRole("checkbox", { name: "Add NEW-STK" }));
    expect(saveButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Add NEW-STK" }));

    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText(/Still missing/)).not.toBeInTheDocument();
  });
});
