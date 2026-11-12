/** @jest-environment jsdom */
import "@testing-library/jest-dom";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { PulloutDetailView } from "@/app/(app)/logistics/_components/pullout-detail";
import {
  linkPulloutSapDocumentAction,
  unlinkPulloutSapDocumentAction,
} from "@/features/logistics/actions/logistics.actions";
import type { LogisticsActionCapabilities } from "@/features/logistics/constants/logistics-permissions";
import type { PulloutDetail } from "@/features/logistics/services/pullout-posting.service";

jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("@/features/settings/lib/load-print-letterhead", () => ({
  loadPrintLetterhead: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/features/logistics/actions/logistics.actions", () => ({
  linkPulloutSapDocumentAction: jest.fn(async () => ({
    success: true,
    label: "IT: 494405",
    linkedCount: 1,
  })),
  unlinkPulloutSapDocumentAction: jest.fn(async () => ({ success: true })),
}));

const link = jest.mocked(linkPulloutSapDocumentAction);
const unlink = jest.mocked(unlinkPulloutSapDocumentAction);

function line(serialNumberId: string, sapDocument: PulloutDetail["lines"][number]["sapDocument"] = null) {
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
  };
}

function sentDetail(lines = [line("s1"), line("s2", { type: "RETURN", docNum: 14402, docDate: "2026-11-10", linkedAt: null, linkedByName: null })]) {
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
    canLinkSapDocuments: true,
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

describe("SAP documents on a sent pull-out", () => {
  it("shows each unit's SAP document, or that none is linked", () => {
    renderView();

    expect(screen.getByRole("columnheader", { name: "SAP document" })).toBeInTheDocument();
    expect(within(rowFor("S1")).getByText("Not linked")).toBeInTheDocument();
    expect(within(rowFor("S2")).getByText("Return: 14402")).toBeInTheDocument();
  });

  it("links the typed IT to the units without a document", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Link SAP document" }));

    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Link document" });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Document number"), {
      target: { value: "494405" },
    });
    expect(within(dialog).getByRole("checkbox", { name: /S1/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /S2/ })).not.toBeChecked();

    await act(async () => {
      fireEvent.click(submit);
    });

    expect(link).toHaveBeenCalledWith("p1", {
      serialNumberIds: ["s1"],
      docType: "IT",
      docNum: "494405",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open with SAP's reason when the check fails", async () => {
    link.mockResolvedValueOnce({ error: "SAP has no IT: 1" });
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Link SAP document" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Document number"), { target: { value: "1" } });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Link document" }));
    });

    expect(within(dialog).getByRole("alert")).toHaveTextContent("SAP has no IT: 1");
  });

  it("unlinks a unit after confirming", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Unlink SAP document from S2" }));
    const confirm = await screen.findByRole("alertdialog");
    await act(async () => {
      fireEvent.click(within(confirm).getByRole("button", { name: "Unlink" }));
    });

    expect(unlink).toHaveBeenCalledWith("p1", "s2");
  });

  it("shows the column but no link controls to someone who cannot manage logistics", () => {
    renderView({ canManage: false } as unknown as LogisticsActionCapabilities);

    expect(screen.getByRole("columnheader", { name: "SAP document" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Link SAP document" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unlink/ })).not.toBeInTheDocument();
  });
});
