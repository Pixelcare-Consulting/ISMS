/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { InventoryUnitStatusCell } from "@/features/inventory/components/inventory-unit-status-cell";
import {
  InventoryListRefreshProvider,
  useInventoryListRefreshSubscription,
  type InventoryRowMutation,
} from "@/features/inventory/components/inventory-list-refresh";
import { updateInventoryStatusAction } from "@/features/inventory/actions/inventory.actions";

const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("@/features/inventory/actions/inventory.actions", () => ({
  updateInventoryStatusAction: jest.fn(),
}));

jest.mock("@/features/inventory/actions/defect.actions", () => ({
  reportInventoryDefectAction: jest.fn(),
  approveInventoryDefectAction: jest.fn(),
  rejectInventoryDefectAction: jest.fn(),
}));

const updateStatus = jest.mocked(updateInventoryStatusAction);

const displayUnit = {
  id: "inv-1",
  branchId: "branch-1",
  statusCode: { code: "DU", name: "Display unit", color: "amber" },
  pendingDefectInspection: false,
  pendingDefectReportId: null,
};

function RefreshProbe({ onMutation }: { onMutation: (mutation: InventoryRowMutation) => void }) {
  useInventoryListRefreshSubscription(onMutation);
  return null;
}

function CollapsingRow() {
  const [open, setOpen] = useState(true);
  if (!open) return <p>Row collapsed</p>;
  return (
    <div onClick={() => setOpen(false)}>
      <InventoryUnitStatusCell unit={displayUnit} />
    </div>
  );
}

describe("InventoryUnitStatusCell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateStatus.mockResolvedValue({ success: true });
  });

  it("shows Stock on the same row after a display unit is returned to stock", async () => {
    const mutations: InventoryRowMutation[] = [];
    render(
      <InventoryListRefreshProvider>
        <RefreshProbe onMutation={(mutation) => mutations.push(mutation)} />
        <InventoryUnitStatusCell unit={displayUnit} />
      </InventoryListRefreshProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stock" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Display unit" })).toBeInTheDocument();
    });
    expect(screen.getByText("Stock")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stock" })).not.toBeInTheDocument();
    expect(updateStatus).toHaveBeenCalledWith("inv-1", "STK");
    expect(mockRefresh).toHaveBeenCalled();
    expect(mutations).toEqual([
      expect.objectContaining({
        kind: "status",
        inventoryId: "inv-1",
        fromCode: "DU",
        toCode: "STK",
      }),
    ]);
  });

  it("opens the defect dialog and leaves the status on display unit", () => {
    render(<CollapsingRow />);

    fireEvent.click(screen.getByRole("button", { name: "Defective" }));

    expect(screen.getByRole("dialog", { name: /report a defect/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Problem description")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send for approval" })).toBeDisabled();
    expect(screen.getByText("Display unit")).toBeInTheDocument();
    expect(screen.queryByText("Row collapsed")).not.toBeInTheDocument();
    expect(updateStatus).not.toHaveBeenCalled();
  });
});
