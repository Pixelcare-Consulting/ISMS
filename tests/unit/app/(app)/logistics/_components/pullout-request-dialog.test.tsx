/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { PulloutRequestDialog } from "@/app/(app)/logistics/_components/pullout-request-dialog";
import { listPulloutSerialsAction } from "@/features/logistics/actions/logistics.actions";
import type { PulloutSerialOption } from "@/features/logistics/services/pullout-posting.service";

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock("@/features/logistics/actions/logistics.actions", () => ({
  listBranchesForLogisticsAction: jest.fn(async () => [
    { id: "branch-a", name: "Branch A" },
    { id: "branch-b", name: "Branch B" },
  ]),
  listWarehousesForLogisticsAction: jest.fn(async () => [
    { id: "warehouse-1", name: "Main", code: "WH1" },
  ]),
  listPulloutChecklistOptionsAction: jest.fn(async () => ({
    classifications: [],
    unitPackingConditions: [],
    accessoryCompleteness: [],
  })),
  listPulloutSerialsAction: jest.fn(),
  uploadPulloutAttachmentAction: jest.fn(),
}));

const listSerials = jest.mocked(listPulloutSerialsAction);

function serial(serialNumberId: string): PulloutSerialOption {
  return {
    serialNumberId,
    serialNo: serialNumberId.toUpperCase(),
    modelId: "model-1",
    skuCode: "SKU-1",
    modelName: "Model One",
    inventoryCode: "STK",
  };
}

function renderDialog(onOpenChange = jest.fn()) {
  const props = { onSubmit: jest.fn(async () => ({})), onCreated: jest.fn(), onOpenChange };
  return { ...render(<PulloutRequestDialog open {...props} />), props };
}

async function chooseStock() {
  fireEvent.click(await screen.findByRole("button", { name: /Stock/ }));
  await screen.findByRole("heading", { name: "Requestor" });
}

async function chooseBranch(name: string) {
  const trigger = await waitFor(() => {
    const field = screen.getByRole("combobox", { name: "Branch Name" });
    expect(field).toBeEnabled();
    return field;
  });
  fireEvent.click(trigger);
  const option = await screen.findByRole("option", { name });
  await act(async () => {
    fireEvent.click(option);
  });
}

beforeAll(() => {
  // cmdk and Radix need these; jsdom has neither.
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  listSerials.mockReset();
  listSerials.mockImplementation(async (branchId) => ({
    success: true,
    serials: [serial(`${branchId}-unit`)],
  }));
});

describe("PulloutRequestDialog branch and warehouse", () => {
  it("starts empty and fetches no units until a branch is chosen", async () => {
    renderDialog();
    await chooseStock();

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Branch Name" })).toHaveTextContent(
        "Select branch…",
      ),
    );
    expect(screen.getByRole("combobox", { name: "Destination warehouse" })).toHaveTextContent(
      "Select warehouse…",
    );
    expect(screen.getByText("Select a branch to see its units.")).toBeInTheDocument();
    expect(listSerials).not.toHaveBeenCalled();
  });

  it("fetches units only for the chosen branch and type", async () => {
    renderDialog();
    await chooseStock();
    await chooseBranch("Branch B");

    expect(await screen.findByText("BRANCH-B-UNIT")).toBeInTheDocument();
    expect(listSerials).toHaveBeenCalledTimes(1);
    expect(listSerials).toHaveBeenCalledWith("branch-b", "STK");
  });

  it("drops the picked units as soon as the branch changes", async () => {
    renderDialog();
    await chooseStock();
    await chooseBranch("Branch A");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select BRANCH-A-UNIT" }));
    expect(screen.getByRole("heading", { name: "Transfer details" })).toBeInTheDocument();

    listSerials.mockImplementation(() => new Promise(() => {}));
    await chooseBranch("Branch B");

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Transfer details" })).not.toBeInTheDocument(),
    );
    expect(within(screen.getByRole("table")).getByText("Loading serials…")).toBeInTheDocument();
  });

  it("starts empty again after the dialog is reopened", async () => {
    const { rerender, props } = renderDialog();
    await chooseStock();
    await chooseBranch("Branch A");
    await screen.findByText("BRANCH-A-UNIT");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    rerender(<PulloutRequestDialog open={false} {...props} />);
    rerender(<PulloutRequestDialog open {...props} />);
    await chooseStock();

    expect(screen.getByRole("combobox", { name: "Branch Name" })).toHaveTextContent(
      "Select branch…",
    );
    expect(screen.getByText("Select a branch to see its units.")).toBeInTheDocument();
    expect(listSerials).toHaveBeenCalledTimes(1);
  });
});
