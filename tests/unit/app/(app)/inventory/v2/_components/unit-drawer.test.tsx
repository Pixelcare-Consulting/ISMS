/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import { BranchInventoryUnitDrawer } from "@/app/(app)/inventory/v2/_components/unit-drawer";
import {
  approveInventoryDefectAction,
  rejectInventoryDefectAction,
} from "@/features/inventory/actions/defect.actions";
import {
  markBranchInventoryStatusReadAction,
  type InventoryListItem,
} from "@/features/inventory/actions/inventory.actions";
import { InventoryApprovalBranchIdsProvider } from "@/features/inventory/components/inventory-unit-status-cell";

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("@/features/inventory/actions/inventory.actions", () => ({
  markBranchInventoryStatusReadAction: jest.fn(),
}));

jest.mock("@/features/inventory/actions/defect.actions", () => ({
  approveInventoryDefectAction: jest.fn(),
  rejectInventoryDefectAction: jest.fn(),
}));

const markRead = jest.mocked(markBranchInventoryStatusReadAction);
const approve = jest.mocked(approveInventoryDefectAction);
const reject = jest.mocked(rejectInventoryDefectAction);

function pendingUnit(branchId = "branch-1"): InventoryListItem {
  return {
    id: "inv-1",
    onPlanogram: true,
    deliveryNo: null,
    deliveryDate: null,
    agingDays: 4,
    pendingDefectInspection: true,
    pendingDefectReportId: "report-1",
    statusUpdatedAt: "2026-11-01T00:00:00.000Z",
    statusCode: { id: "st", code: "STK", name: "Stock", color: "emerald" },
    branch: { id: branchId, name: "Festival Mall", sapCode: "FM01" },
    serialNumber: {
      id: "sn-1",
      serialNo: "SN-100",
      model: {
        sku: "AC-1",
        name: "Window unit",
        brand: { name: "Brand" },
        seriesName: null,
      },
    },
  };
}

function renderDrawer(approvalBranchIds: string[] | null, unit = pendingUnit()) {
  return render(
    <InventoryApprovalBranchIdsProvider approvalBranchIds={approvalBranchIds}>
      <BranchInventoryUnitDrawer unit={unit} onOpenChange={jest.fn()} />
    </InventoryApprovalBranchIdsProvider>,
  );
}

describe("BranchInventoryUnitDrawer defect decision", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    markRead.mockResolvedValue({ success: true });
    approve.mockResolvedValue({ success: true });
    reject.mockResolvedValue({ success: true });
  });

  it("shows Approve and Reject for the team leader of that branch", () => {
    renderDrawer(["branch-1"]);

    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
    expect(screen.queryByText("Waiting for the team leader.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change status" })).not.toBeInTheDocument();
  });

  it("keeps the wait message for someone who cannot approve that branch", () => {
    renderDrawer(["other-branch"]);

    expect(screen.getByText("Waiting for the team leader.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change status" })).not.toBeInTheDocument();
  });

  it("approves the open report and marks the unit defective", async () => {
    renderDrawer(["branch-1"]);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(approve).toHaveBeenCalledWith({ reportId: "report-1" });
    });
    expect(reject).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Marked defective");
    expect(mockRefresh).toHaveBeenCalled();
    expect(screen.getByText("Defective")).toBeInTheDocument();
    expect(screen.getByText("A defective unit cannot be changed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change status" })).not.toBeInTheDocument();
  });

  it("rejects the open report and leaves the current status", async () => {
    renderDrawer(["branch-1"]);

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => {
      expect(reject).toHaveBeenCalledWith({ reportId: "report-1" });
    });
    expect(approve).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Defect report rejected");
    expect(screen.getByText("Stock")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for the team leader.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change status" })).toBeInTheDocument();
  });
});
