/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { PulloutRequestDialog } from "@/app/(app)/logistics/_components/pullout-request-dialog";
import {
  getPulloutDestinationAction,
  listPulloutSerialsAction,
} from "@/features/logistics/actions/logistics.actions";
import type { PulloutSerialOption } from "@/features/logistics/services/pullout-posting.service";

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock("@/features/logistics/actions/logistics.actions", () => ({
  listBranchesForLogisticsAction: jest.fn(async () => [
    { id: "branch-a", name: "Branch A" },
    { id: "branch-b", name: "Branch B" },
  ]),
  listPulloutChecklistOptionsAction: jest.fn(async () => ({
    reasons: [{ id: "reason-1", name: "Overstock" }],
    problemDescriptions: [{ id: "problem-1", name: "No power" }],
    classifications: [{ id: "class-1", name: "Good" }],
    unitPackingConditions: [{ id: "packing-1", name: "Sealed" }],
    accessoryCompleteness: [{ id: "accessory-1", name: "Complete" }],
  })),
  getPulloutDestinationAction: jest.fn(),
  listPulloutSerialsAction: jest.fn(),
  uploadPulloutAttachmentAction: jest.fn(),
}));

const listSerials = jest.mocked(listPulloutSerialsAction);
const getDestination = jest.mocked(getPulloutDestinationAction);

function serial(
  serialNumberId: string,
  inventoryCode: PulloutSerialOption["inventoryCode"] = "STK",
): PulloutSerialOption {
  return {
    serialNumberId,
    serialNo: serialNumberId.toUpperCase(),
    modelId: "model-1",
    skuCode: "SKU-1",
    modelName: "Model One",
    inventoryCode,
  };
}

function renderDialog(onOpenChange = jest.fn()) {
  const props = { onSubmit: jest.fn(async () => ({})), onCreated: jest.fn(), onOpenChange };
  return { ...render(<PulloutRequestDialog open {...props} />), props };
}

async function formShown() {
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
  getDestination.mockReset();
  getDestination.mockImplementation(async (branchId) => ({
    success: true,
    warehouse: { id: `${branchId}-wh`, name: `Warehouse of ${branchId}`, code: "WH1" },
  }));
  listSerials.mockReset();
  listSerials.mockImplementation(async (branchId) => ({
    success: true,
    serials: [serial(`${branchId}-unit`)],
  }));
});

function submitButton() {
  return screen.getByRole("button", { name: "Submit" });
}

async function pickUnit(serialNo: string) {
  fireEvent.click(await screen.findByRole("checkbox", { name: `Select ${serialNo}` }));
}

async function chooseOption(field: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: field }));
  const row = await screen.findByRole("option", { name: option });
  fireEvent.click(row);
  fireEvent.keyDown(row, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("option", { name: option })).not.toBeInTheDocument());
}

async function fillDetails(serialNo: string) {
  await chooseOption(`Unit packing condition for ${serialNo}`, "Sealed");
  await chooseOption(`Acc completeness for ${serialNo}`, "Complete");
}

async function fillClassification(serialNo: string) {
  await chooseOption(`Classification for ${serialNo}`, "Good");
}

async function fillReason(serialNo: string) {
  await chooseOption(`Reason for ${serialNo}`, "Overstock");
}

async function fillProblem(serialNo: string) {
  await chooseOption(`Problem description for ${serialNo}`, "No power");
}

async function pickUnitDetails(serialNo: string) {
  await pickUnit(serialNo);
  await fillReason(serialNo);
  await fillClassification(serialNo);
  await fillDetails(serialNo);
}

function unitRow(serialNo: string) {
  const row = screen
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryByLabelText(`Select ${serialNo}`));
  if (!row) throw new Error(`No row for ${serialNo}`);
  return row;
}

function useBothUnitTypes() {
  listSerials.mockImplementation(async (branchId) => ({
    success: true,
    serials: [serial(`${branchId}-stk`), serial(`${branchId}-def`, "DEF")],
  }));
}

describe("PulloutRequestDialog units", () => {
  it("opens on the form with no STK or DEF step", async () => {
    renderDialog();

    await formShown();
    expect(screen.queryByRole("button", { name: /Stock/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Defective/ })).not.toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it("lists stock and defective units together", async () => {
    useBothUnitTypes();
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");

    expect(await screen.findByText("BRANCH-A-STK")).toBeInTheDocument();
    expect(screen.getByText("BRANCH-A-DEF")).toBeInTheDocument();
  });

  it("keeps the classification column and asks for it on stock units only", async () => {
    useBothUnitTypes();
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await pickUnit("BRANCH-A-STK");
    await pickUnit("BRANCH-A-DEF");

    expect(screen.getByRole("columnheader", { name: "Classification" })).toBeInTheDocument();
    expect(
      within(unitRow("BRANCH-A-STK")).getByRole("combobox", {
        name: "Classification for BRANCH-A-STK",
      }),
    ).toBeEnabled();
    expect(
      within(unitRow("BRANCH-A-DEF")).queryByRole("combobox", {
        name: "Classification for BRANCH-A-DEF",
      }),
    ).not.toBeInTheDocument();
  });

  it("uses one table, with every field disabled until its row is selected", async () => {
    useBothUnitTypes();
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await screen.findByText("BRANCH-A-STK");

    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Transfer details" })).toBeInTheDocument();
    const fields = [
      "Reason for BRANCH-A-STK",
      "Classification for BRANCH-A-STK",
      "Unit packing condition for BRANCH-A-STK",
      "Acc completeness for BRANCH-A-STK",
    ];
    for (const name of fields) {
      expect(screen.getByRole("combobox", { name })).toBeDisabled();
    }
    expect(screen.getByRole("textbox", { name: "Remarks for BRANCH-A-STK" })).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Problem description for BRANCH-A-DEF" }),
    ).toBeDisabled();

    await pickUnit("BRANCH-A-STK");
    for (const name of fields) {
      expect(screen.getByRole("combobox", { name })).toBeEnabled();
    }
    expect(screen.getByRole("textbox", { name: "Remarks for BRANCH-A-STK" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Remarks for BRANCH-A-DEF" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select BRANCH-A-STK" }));
    expect(screen.getByRole("combobox", { name: fields[0] })).toBeDisabled();
  });

  it("keeps a unit's details if it is unticked and ticked again", async () => {
    useBothUnitTypes();
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await screen.findByText("Warehouse of branch-a (WH1)");
    await pickUnitDetails("BRANCH-A-STK");
    expect(submitButton()).toBeEnabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select BRANCH-A-STK" }));
    expect(submitButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select BRANCH-A-STK" }));
    expect(submitButton()).toBeEnabled();
  });

  it("counts the selected units and names the ones still missing details", async () => {
    useBothUnitTypes();
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await pickUnit("BRANCH-A-DEF");
    await pickUnit("BRANCH-A-STK");

    expect(screen.getByText(/2 selected/)).toBeInTheDocument();
    expect(screen.getByText(/Still missing: BRANCH-A-STK, BRANCH-A-DEF/)).toBeInTheDocument();

    await fillDetails("BRANCH-A-DEF");
    await fillProblem("BRANCH-A-DEF");
    expect(screen.getByText(/Still missing: BRANCH-A-STK/)).toBeInTheDocument();
    expect(screen.queryByText(/Still missing: BRANCH-A-DEF/)).not.toBeInTheDocument();
  });

  it("gives each unit the Reason field for its type", async () => {
    useBothUnitTypes();
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await pickUnit("BRANCH-A-STK");
    await pickUnit("BRANCH-A-DEF");

    expect(screen.getByRole("columnheader", { name: "Reason" })).toBeInTheDocument();
    const stock = within(unitRow("BRANCH-A-STK"));
    expect(stock.getByRole("combobox", { name: "Reason for BRANCH-A-STK" })).toBeEnabled();
    expect(stock.queryByRole("combobox", { name: /Problem description/ })).not.toBeInTheDocument();
    const defective = within(unitRow("BRANCH-A-DEF"));
    expect(
      defective.getByRole("combobox", { name: "Problem description for BRANCH-A-DEF" }),
    ).toBeEnabled();
    expect(defective.queryByRole("combobox", { name: /^Reason/ })).not.toBeInTheDocument();
  });

  it("submits a defective unit with its problem and no classification or reason", async () => {
    useBothUnitTypes();
    const { props } = renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await screen.findByText("Warehouse of branch-a (WH1)");
    await pickUnit("BRANCH-A-DEF");
    await fillDetails("BRANCH-A-DEF");
    expect(submitButton()).toBeDisabled();
    await fillProblem("BRANCH-A-DEF");

    await act(async () => {
      fireEvent.click(submitButton());
    });

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    const [input] = props.onSubmit.mock.calls[0] as unknown as [
      {
        lines: {
          pulloutClassificationIds: string[];
          pulloutReasonCodeId?: string;
          problemDescriptionIds: string[];
        }[];
      },
    ];
    expect(input.lines[0]).toMatchObject({
      pulloutClassificationIds: [],
      pulloutReasonCodeId: undefined,
      problemDescriptionIds: ["problem-1"],
    });
  });

  it("holds a stock unit until its reason is chosen", async () => {
    useBothUnitTypes();
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await screen.findByText("Warehouse of branch-a (WH1)");
    await pickUnit("BRANCH-A-STK");
    await fillClassification("BRANCH-A-STK");
    await fillDetails("BRANCH-A-STK");
    expect(submitButton()).toBeDisabled();

    await fillReason("BRANCH-A-STK");
    expect(submitButton()).toBeEnabled();
  });

  it("holds a stock unit until its classification is chosen", async () => {
    useBothUnitTypes();
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await screen.findByText("Warehouse of branch-a (WH1)");
    await pickUnit("BRANCH-A-STK");
    await fillReason("BRANCH-A-STK");
    await fillDetails("BRANCH-A-STK");
    expect(submitButton()).toBeDisabled();

    await fillClassification("BRANCH-A-STK");
    expect(submitButton()).toBeEnabled();
  });

  it("reads the Status field from the selected units", async () => {
    useBothUnitTypes();
    renderDialog();
    await formShown();
    expect(screen.getByText("Follows the selected units")).toBeInTheDocument();

    await chooseBranch("Branch A");
    await pickUnit("BRANCH-A-DEF");
    const status = screen.getByText("Status", { selector: "dt" }).closest("div");
    if (!status) throw new Error("No Status field");
    expect(within(status).getByText("DEF")).toBeInTheDocument();

    await pickUnit("BRANCH-A-STK");
    expect(within(status).getByText("STK")).toBeInTheDocument();
    expect(within(status).getByText("DEF")).toBeInTheDocument();
    expect(within(status).queryByText("Mixed")).not.toBeInTheDocument();
  });
});

describe("PulloutRequestDialog branch and warehouse", () => {
  it("starts empty and fetches no units until a branch is chosen", async () => {
    renderDialog();
    await formShown();

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Branch Name" })).toHaveTextContent(
        "Select branch…",
      ),
    );
    expect(screen.getByText("Follows the selected branch")).toBeInTheDocument();
    expect(screen.getByText("Select a branch to see its units.")).toBeInTheDocument();
    expect(listSerials).not.toHaveBeenCalled();
    expect(getDestination).not.toHaveBeenCalled();
  });

  it("shows the warehouse connected to the chosen branch", async () => {
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    expect(await screen.findByText("Warehouse of branch-a (WH1)")).toBeInTheDocument();

    await chooseBranch("Branch B");
    expect(await screen.findByText("Warehouse of branch-b (WH1)")).toBeInTheDocument();
    expect(screen.queryByText("Warehouse of branch-a (WH1)")).not.toBeInTheDocument();
  });

  it("does not send a warehouse: the server decides it from the branch", async () => {
    const { props } = renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await screen.findByText("Warehouse of branch-a (WH1)");
    await pickUnitDetails("BRANCH-A-UNIT");

    await act(async () => {
      fireEvent.click(submitButton());
    });

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    const [input] = props.onSubmit.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(input.branchId).toBe("branch-a");
    expect(input).not.toHaveProperty("warehouseId");
  });

  it("explains and blocks submit when the branch has no warehouse", async () => {
    getDestination.mockImplementation(async () => ({
      error: "Branch A has no primary warehouse and no main warehouse is set.",
    }));
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    expect(
      await screen.findByText("Branch A has no primary warehouse and no main warehouse is set."),
    ).toBeInTheDocument();

    await pickUnitDetails("BRANCH-A-UNIT");
    expect(submitButton()).toBeDisabled();
  });

  it("fetches units only for the chosen branch and type", async () => {
    renderDialog();
    await formShown();
    await chooseBranch("Branch B");

    expect(await screen.findByText("BRANCH-B-UNIT")).toBeInTheDocument();
    expect(listSerials).toHaveBeenCalledTimes(1);
    expect(listSerials).toHaveBeenCalledWith("branch-b");
  });

  it("drops the picked units as soon as the branch changes", async () => {
    renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await pickUnit("BRANCH-A-UNIT");
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();

    listSerials.mockImplementation(() => new Promise(() => {}));
    await chooseBranch("Branch B");

    await waitFor(() =>
      expect(screen.queryByRole("checkbox", { name: "Select BRANCH-A-UNIT" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText(/1 selected/)).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Loading serials…")).toBeInTheDocument();
  });

  it("starts empty again after the dialog is reopened", async () => {
    const { rerender, props } = renderDialog();
    await formShown();
    await chooseBranch("Branch A");
    await screen.findByText("BRANCH-A-UNIT");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    rerender(<PulloutRequestDialog open={false} {...props} />);
    rerender(<PulloutRequestDialog open {...props} />);
    await formShown();

    expect(screen.getByRole("combobox", { name: "Branch Name" })).toHaveTextContent(
      "Select branch…",
    );
    expect(screen.getByText("Select a branch to see its units.")).toBeInTheDocument();
    expect(listSerials).toHaveBeenCalledTimes(1);
  });
});
