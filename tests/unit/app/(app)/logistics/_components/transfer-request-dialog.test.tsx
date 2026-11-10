/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { TransferForm } from "@/app/(app)/logistics/_components/transfer-form";
import { TransferRequestDialog } from "@/app/(app)/logistics/_components/transfer-request-dialog";
import {
  getTransferDetailAction,
  listBranchesForLogisticsAction,
  listTransferModelsAction,
  listTransferSerialsAction,
} from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { TransferDetail } from "@/features/logistics/services/transfer-posting.service";

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn(), message: jest.fn() },
}));

jest.mock("@/features/logistics/actions/logistics.actions", () => ({
  approveTransferAction: jest.fn(),
  executeTransferAction: jest.fn(),
  getTransferDetailAction: jest.fn(),
  listBranchesForLogisticsAction: jest.fn(),
  listTransferModelsAction: jest.fn(),
  listTransferSerialsAction: jest.fn(),
  receiveTransferAction: jest.fn(),
  rejectTransferAction: jest.fn(),
  rejectTransferSerialAction: jest.fn(),
}));

const listBranches = jest.mocked(listBranchesForLogisticsAction);
const listModels = jest.mocked(listTransferModelsAction);
const listSerials = jest.mocked(listTransferSerialsAction);
const getDetail = jest.mocked(getTransferDetailAction);

const STOCK = { code: "STK", name: "Stock", color: "emerald" };

function renderCreate() {
  const onSubmit = jest.fn(async () => ({ transferNo: "XFR-1" }));
  render(
    <TransferRequestDialog
      open
      onOpenChange={jest.fn()}
      onSubmit={onSubmit}
      onCreated={jest.fn()}
      currentUserName="Paula Staff"
    />,
  );
  return { onSubmit };
}

async function choose(field: string, option: string | RegExp) {
  const trigger = await waitFor(() => {
    const combobox = screen.getByRole("combobox", { name: field });
    expect(combobox).toBeEnabled();
    return combobox;
  });
  fireEvent.click(trigger);
  const row = await screen.findByRole("option", { name: option });
  await act(async () => {
    fireEvent.click(row);
  });
}

function detail(overrides: Partial<TransferDetail> = {}): TransferDetail {
  return {
    id: "transfer-1",
    transferNo: "XFR-1",
    notes: null,
    createdAt: "2026-11-05T01:00:00.000Z",
    createdBy: "Paula Staff",
    status: { code: "pending_tl", name: "Pending TL", color: null },
    rsNo: null,
    drNo: null,
    fromBranch: { id: "branch-a", name: "Branch A" },
    toBranch: { id: "branch-b", name: "Branch B" },
    lines: [
      {
        serialNumberId: "s1",
        serialNo: "SN-1",
        skuCode: "SKU-1",
        modelName: "Model One",
        quantity: 1,
        priorCode: "STK",
        inventoryCode: "RSV",
        inventoryStatus: { code: "RSV", name: "Reserved", color: "orange" },
        branchId: "branch-a",
        branchName: "Branch A",
        decision: "pending",
        remarks: null,
        requestRemarks: "For the mall display",
      },
    ],
    history: [],
    ...overrides,
  } as TransferDetail;
}

function releasableDetail(): TransferDetail {
  return detail({ status: { code: "for_transfer", name: "For transfer", color: null } });
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
  listBranches.mockReset();
  listBranches.mockResolvedValue([
    { id: "branch-a", name: "Branch A", dealerId: "dealer-1" },
    { id: "branch-b", name: "Branch B", dealerId: "dealer-1" },
  ] as Awaited<ReturnType<typeof listBranchesForLogisticsAction>>);
  listModels.mockReset();
  listModels.mockResolvedValue({
    success: true,
    models: [{ id: "model-1", skuCode: "SKU-1", name: "Model One" }],
  } as Awaited<ReturnType<typeof listTransferModelsAction>>);
  listSerials.mockReset();
  listSerials.mockResolvedValue({
    success: true,
    serials: [
      { serialNumberId: "s1", serialNo: "SN-1", inventoryCode: "STK", inventoryStatus: STOCK },
      { serialNumberId: "s2", serialNo: "SN-2", inventoryCode: "STK", inventoryStatus: STOCK },
    ],
  } as Awaited<ReturnType<typeof listTransferSerialsAction>>);
  getDetail.mockReset();
});

describe("new transfer request form", () => {
  it("lays out Transfer details as Model, Serial number, Status, Remarks, Action", async () => {
    renderCreate();
    const table = await screen.findByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual(["#", "", "Model", "Serial number", "Status", "Remarks", "Action"]);
  });

  it("takes remarks per serial instead of one remark for the whole request", async () => {
    renderCreate();
    await screen.findByRole("textbox", { name: "Remarks for row 1" });
    expect(screen.queryByPlaceholderText("Why these units are moving")).not.toBeInTheDocument();
  });

  it("submits each serial with its own remark", async () => {
    const { onSubmit } = renderCreate();
    await choose("Model for row 1", "SKU-1 — Model One");
    await choose("Serial for row 1", /SN-1/);
    fireEvent.change(screen.getByRole("textbox", { name: "Remarks for row 1" }), {
      target: { value: "For the mall display" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        serialNumberIds: ["s1"],
        lineRemarks: { s1: "For the mall display" },
      }),
    );
  });
});

describe("transfer page", () => {
  it("has no waybill and scheduling section", () => {
    render(<TransferForm mode="view" layout="page" detail={releasableDetail()} />);
    expect(screen.queryByText("Waybill and scheduling")).not.toBeInTheDocument();
  });

  it("offers Approve and Reject only on a branch this person can approve for", async () => {
    const decide = { canApproveTl: true, canRejectTransfer: true } as LogisticsActionCapabilities;
    const pending = detail({ status: { code: "pending_tl", name: "Pending TL", color: null } });
    const onDocumentActionsChange = jest.fn();
    const page = (approvalBranchIds: string[] | null) => (
      <TransferForm
        mode="view"
        layout="page"
        actionsPlacement="external"
        detail={pending}
        capabilities={decide}
        approvalBranchIds={approvalBranchIds}
        onDocumentActionsChange={onDocumentActionsChange}
      />
    );

    const { rerender } = render(page(["branch-z"]));
    await waitFor(() =>
      expect(onDocumentActionsChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ canApprove: false, canReject: false }),
      ),
    );

    rerender(page(["branch-a"]));
    await waitFor(() =>
      expect(onDocumentActionsChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ canApprove: true, canReject: true }),
      ),
    );
  });
});

describe("branch transfer dialog", () => {
  it("shows the remark the requester wrote on each serial", async () => {
    getDetail.mockResolvedValue({ success: true, detail: detail() } as Awaited<
      ReturnType<typeof getTransferDetailAction>
    >);
    render(
      <TransferRequestDialog
        open
        onOpenChange={jest.fn()}
        onSubmit={jest.fn()}
        onCreated={jest.fn()}
        transferId="transfer-1"
      />,
    );
    const row = (await screen.findByText("SN-1")).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("For the mall display")).toBeInTheDocument();
  });

  it("has no whole-request Remarks row on a transfer without one", async () => {
    getDetail.mockResolvedValue({ success: true, detail: detail() } as Awaited<
      ReturnType<typeof getTransferDetailAction>
    >);
    render(
      <TransferRequestDialog
        open
        onOpenChange={jest.fn()}
        onSubmit={jest.fn()}
        onCreated={jest.fn()}
        transferId="transfer-1"
      />,
    );
    await screen.findByText("SN-1");
    expect(screen.getAllByText("Remarks")).toHaveLength(1);
  });

  it("shows each serial's current status on the line items", async () => {
    const lines = detail().lines.map((line) => ({
      ...line,
      inventoryCode: "FTR",
      inventoryStatus: { code: "FTR", name: "For transfer", color: "violet" },
    }));
    getDetail.mockResolvedValue({
      success: true,
      detail: detail({ status: { code: "for_transfer", name: "For transfer", color: null }, lines }),
    } as Awaited<ReturnType<typeof getTransferDetailAction>>);
    render(
      <TransferRequestDialog
        open
        onOpenChange={jest.fn()}
        onSubmit={jest.fn()}
        onCreated={jest.fn()}
        transferId="transfer-1"
      />,
    );
    const row = (await screen.findByText("SN-1")).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("For transfer")).toBeInTheDocument();
  });

  it.each([
    ["for_transfer", false],
    ["in_transit", true],
  ])("offers the receiving branch Accept and Reject on %s: %s", async (code, offered) => {
    const lines = detail().lines.map((line) => ({ ...line, inventoryCode: "DIT" }));
    getDetail.mockResolvedValue({
      success: true,
      detail: detail({ status: { code, name: code, color: null }, lines }),
    } as Awaited<ReturnType<typeof getTransferDetailAction>>);
    render(
      <TransferRequestDialog
        open
        onOpenChange={jest.fn()}
        onSubmit={jest.fn()}
        onCreated={jest.fn()}
        transferId="transfer-1"
        branchScope={["branch-b"]}
        capabilities={{ canReceiveTransfer: true } as LogisticsActionCapabilities}
      />,
    );
    await screen.findByText("SN-1");
    expect(screen.queryAllByRole("button", { name: "Accept" })).toHaveLength(offered ? 1 : 0);
    expect(screen.queryAllByRole("button", { name: "Reject" })).toHaveLength(offered ? 1 : 0);
  });

  it("offers Logistics Release once the Team Lead approves, without a waybill", async () => {
    getDetail.mockResolvedValue({
      success: true,
      detail: releasableDetail(),
    } as Awaited<ReturnType<typeof getTransferDetailAction>>);
    render(
      <TransferRequestDialog
        open
        onOpenChange={jest.fn()}
        onSubmit={jest.fn()}
        onCreated={jest.fn()}
        transferId="transfer-1"
        capabilities={{ canExecuteTransfer: true } as LogisticsActionCapabilities}
      />,
    );
    await screen.findByText("SN-1");
    await waitFor(() =>
      expect(screen.queryAllByRole("button", { name: "Release" })).toHaveLength(1),
    );
  });

  it("still shows the remark on transfers created before per-serial remarks", async () => {
    getDetail.mockResolvedValue({
      success: true,
      detail: detail({ notes: "Legacy note" }),
    } as Awaited<ReturnType<typeof getTransferDetailAction>>);
    render(
      <TransferRequestDialog
        open
        onOpenChange={jest.fn()}
        onSubmit={jest.fn()}
        onCreated={jest.fn()}
        transferId="transfer-1"
      />,
    );
    expect(await screen.findByText("Legacy note")).toBeInTheDocument();
  });
});
